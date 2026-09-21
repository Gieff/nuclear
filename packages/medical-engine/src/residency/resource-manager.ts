/**
 * @nuclear/medical-engine — P3.3-A pure residency state machine (public facade).
 * Node-safe. See `residency-budget.ts` for the internal budget/eviction engine.
 */
import {
  assertValidBudget,
  attemptEviction,
  budgetFieldForTier,
  bytesForTier,
  declaredBudget,
  measureSafely,
  applyMeasurement,
  evictionOrder,
  leaseSnapshot,
  leaseSnapshots,
  makeRoom,
  projectedUsage,
  recordEviction,
  registrationOrder,
  resourceSnapshot,
  settlementOf,
  type EvictionContext,
  type LeaseRecord,
  type ResourceRecord,
} from './residency-budget.js';
import { RESIDENCY_ERROR_CODES, ResidencyError } from './residency-errors.js';
import {
  isPhysicalTier,
  priorityRank,
  requiredTierOf,
  residencyRank,
  tierRank,
} from './residency-tier.js';
import type { VolumeIngestionPlan } from '../renderer/volume-types.js';
import type {
  ResidencySettlementResult,
  ResourceBudget,
  ResourceLeaseSnapshot,
  ResourceResidencySnapshot,
  ResourceRetention,
  ResourceSettlement,
  StableResidencyTier,
  VolumeResidencyBackend,
} from './residency-types.js';
/** Pure residency manager. All mutations flow through `retain`/`reconcile`. */
export class ResourceManager {
  private readonly backend: VolumeResidencyBackend;
  private readonly budget: ResourceBudget | undefined;
  private readonly resources = new Map<string, ResourceRecord>();
  private readonly leaseIndex = new Map<string, string>();
  private nextSequence = 0;
  constructor(backend: VolumeResidencyBackend, options: { budget?: ResourceBudget } = {}) {
    assertValidBudget(options.budget);
    this.backend = backend;
    this.budget = options.budget;
  }
  /** Registers or refreshes one lease. Never acquires physically. */
  retain(retention: ResourceRetention): void {
    const requiredTier = this.assertRetention(retention);
    const resource = this.ensureResource(retention.plan);
    if (!isPhysicalTier(resource.tier) && resource.tier !== 'source-available') {
      resource.tier = 'source-available';
    }
    resource.leases.set(retention.leaseId, {
      leaseId: retention.leaseId,
      retention,
      requiredTier,
    });
    this.leaseIndex.set(retention.leaseId, resource.volumeId);
    this.refresh(resource);
  }
  /** Drops a lease. Unknown leases are a safe typed no-op, not an error. */
  release(leaseId: string): { released: boolean; volumeId?: string } {
    const volumeId = this.leaseIndex.get(leaseId);
    if (volumeId === undefined) {
      return { released: false };
    }
    this.leaseIndex.delete(leaseId);
    const resource = this.resources.get(volumeId);
    if (resource !== undefined) {
      resource.leases.delete(leaseId);
      this.refresh(resource);
    }
    return { released: true, volumeId };
  }
  /** Validates next, retains new, releases removed, then settles. */
  reconcile(next: readonly ResourceRetention[]): ResidencySettlementResult {
    const bindings = new Map<string, string>();
    for (const retention of next) {
      const prior = bindings.get(retention.leaseId);
      if (prior !== undefined && prior !== retention.plan.volumeId) {
        throw this.conflict(retention.leaseId, prior, retention.plan.volumeId);
      }
      bindings.set(retention.leaseId, retention.plan.volumeId);
      this.assertRetention(retention);
    }
    const previousLeaseIds = [...this.leaseIndex.keys()];
    for (const retention of next) {
      this.retain(retention);
    }
    const nextLeaseIds = new Set(next.map((retention) => retention.leaseId));
    for (const leaseId of previousLeaseIds) {
      if (!nextLeaseIds.has(leaseId)) {
        this.release(leaseId);
      }
    }
    return this.settle();
  }
  /** Acquires leased resources, then evicts every zero-lease physical one. */
  settle(): ResidencySettlementResult {
    const context: EvictionContext = { evictedVolumeIds: [], settlements: [] };
    const ordered = registrationOrder(this.resources);
    for (const resource of ordered) {
      if (isPhysicalTier(resource.tier)) {
        applyMeasurement(this.backend, resource);
      }
    }
    for (const resource of ordered) {
      if (resource.leases.size > 0) {
        context.settlements.push(this.settleResource(resource, context));
      }
    }
    for (const resource of evictionOrder(this.resources)) {
      if (resource.leases.size === 0 && isPhysicalTier(resource.tier)) {
        recordEviction(this.backend, resource, context);
      }
    }
    return {
      settlements: context.settlements,
      evictedVolumeIds: context.evictedVolumeIds,
      resources: registrationOrder(this.resources).map(resourceSnapshot),
      leases: leaseSnapshots(this.resources),
    };
  }
  /** Selective eviction of zero-lease physical resources; confirmed ids only. */
  evictUnreferenced(): readonly string[] {
    const confirmed: string[] = [];
    for (const resource of evictionOrder(this.resources)) {
      if (resource.leases.size > 0 || !isPhysicalTier(resource.tier)) {
        continue;
      }
      const outcome = attemptEviction(this.backend, resource);
      if (outcome.confirmed) {
        confirmed.push(resource.volumeId);
      }
    }
    return confirmed;
  }
  snapshot(): {
    resources: readonly ResourceResidencySnapshot[];
    leases: readonly ResourceLeaseSnapshot[];
    budget?: ResourceBudget;
  } {
    const resources = registrationOrder(this.resources).map(resourceSnapshot);
    const leases = leaseSnapshots(this.resources);
    return this.budget === undefined
      ? { resources, leases }
      : { resources, leases, budget: this.budget };
  }
  getResource(volumeId: string): ResourceResidencySnapshot | undefined {
    const resource = this.resources.get(volumeId);
    return resource === undefined ? undefined : resourceSnapshot(resource);
  }
  getLease(leaseId: string): ResourceLeaseSnapshot | undefined {
    const volumeId = this.leaseIndex.get(leaseId);
    const lease = volumeId === undefined ? undefined : this.resources.get(volumeId)?.leases.get(leaseId);
    return lease === undefined || volumeId === undefined ? undefined : leaseSnapshot(lease, volumeId);
  }
  /** Clears manager state. Not an eviction: the backend owner tears it down. */
  reset(): void {
    this.resources.clear();
    this.leaseIndex.clear();
    this.nextSequence = 0;
  }
  private conflict(
    leaseId: string,
    boundVolumeId: string,
    requestedVolumeId: string,
  ): ResidencyError {
    return new ResidencyError(
      RESIDENCY_ERROR_CODES.leaseVolumeConflict,
      `Lease '${leaseId}' is already bound to volume '${boundVolumeId}'; it cannot also bind '${requestedVolumeId}'. Release the lease before re-binding it.`,
    );
  }
  /** Fail-closed preconditions; reads state but never mutates it. */
  private assertRetention(retention: ResourceRetention): StableResidencyTier {
    const { leaseId, plan, demand, availability } = retention;
    if (demand.assetId !== plan.assetId) {
      throw new ResidencyError(
        RESIDENCY_ERROR_CODES.leaseAssetMismatch,
        `Lease '${leaseId}' demands asset '${demand.assetId}' but the plan belongs to asset '${plan.assetId}'. Retain the demand for the plan's own asset.`,
      );
    }
    if (availability.state !== 'online' && availability.state !== 'loading') {
      throw new ResidencyError(
        RESIDENCY_ERROR_CODES.sourceUnavailable,
        `Lease '${leaseId}' for volume '${plan.volumeId}' has availability '${availability.state}'; only 'online' or 'loading' may produce a live volume, and a cached preview is not a live volume. Relink or re-verify the source first.`,
      );
    }
    const bound = this.leaseIndex.get(leaseId);
    if (bound !== undefined && bound !== plan.volumeId) {
      throw this.conflict(leaseId, bound, plan.volumeId);
    }
    return requiredTierOf(demand);
  }
  private ensureResource(plan: VolumeIngestionPlan): ResourceRecord {
    const existing = this.resources.get(plan.volumeId);
    if (existing !== undefined) {
      return existing;
    }
    const resource: ResourceRecord = {
      volumeId: plan.volumeId,
      assetId: plan.assetId,
      geometricDigest: plan.provenance.geometricDigest,
      plan,
      sequence: this.nextSequence,
      leases: new Map<string, LeaseRecord>(),
      tier: 'metadata-only',
      priorityRank: priorityRank('unused'),
      requiredTier: 'source-available',
      measurement: 'unavailable',
    };
    this.nextSequence += 1;
    this.resources.set(plan.volumeId, resource);
    return resource;
  }
  /** Recomputes last-known priority and required tier from live leases. */
  private refresh(resource: ResourceRecord): void {
    let priority = -1;
    let required: StableResidencyTier | null = null;
    for (const lease of resource.leases.values()) {
      const leasePriority = priorityRank(lease.retention.demand.priority);
      if (leasePriority > priority) {
        priority = leasePriority;
      }
      if (required === null || tierRank(lease.requiredTier) > tierRank(required)) {
        required = lease.requiredTier;
      }
    }
    if (priority >= 0) {
      resource.priorityRank = priority;
    }
    if (required !== null) {
      resource.requiredTier = required;
    }
  }
  private settleResource(
    resource: ResourceRecord,
    context: EvictionContext,
  ): ResourceSettlement {
    const required = resource.requiredTier;
    if (residencyRank(resource.tier) >= tierRank(required)) {
      applyMeasurement(this.backend, resource);
      return settlementOf(resource, 'resident', required);
    }
    const field = budgetFieldForTier(required);
    if (field === null) {
      applyMeasurement(this.backend, resource);
      return settlementOf(resource, 'resident', required);
    }
    const measurement = measureSafely(this.backend, resource.plan, required);
    const needed = bytesForTier(measurement, required);
    const ceiling = declaredBudget(this.budget, field);
    // A declared budget with no backend measurement is not enforceable: acquire honestly, but never claim verified residency.
    const budgetUnverified = ceiling !== undefined && needed === undefined;
    if (ceiling !== undefined && needed !== undefined) {
      makeRoom(this.backend, this.resources, resource, needed, ceiling, context);
      if (projectedUsage(this.resources.values(), resource, needed) > ceiling) {
        return settlementOf(
          resource,
          'budget-exhausted',
          required,
          `Needs ${needed} ${field} for '${required}' but the declared budget of ${ceiling} cannot be met after evicting every zero-lease resource; residency remains '${resource.tier}'. Raise the budget or reduce demand.`,
        );
      }
    }
    let achieved: StableResidencyTier;
    try {
      achieved = this.backend.acquire(resource.plan, required);
    } catch (error) {
      return settlementOf(
        resource,
        'loader-failed',
        required,
        `Backend acquire threw: ${error instanceof Error ? error.message : String(error)}. Volume identity preserved at '${resource.tier}'.`,
      );
    }
    resource.tier = achieved;
    applyMeasurement(this.backend, resource);
    if (tierRank(achieved) < tierRank(required)) {
      return settlementOf(resource, 'deferred', required, `Backend reached only '${achieved}' for required '${required}'; the volume is partially resident.`);
    }
    if (budgetUnverified) {
      return settlementOf(resource, 'budget-unverified', required, `Declared budget field '${field}' is set but the residency backend exposes no '${field}' measurement for '${required}'; '${resource.volumeId}' was acquired without a verifiable budget guarantee, which is not proof of sufficiency.`);
    }
    return settlementOf(resource, 'resident', required);
  }
}
