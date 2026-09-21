/**
 * @nuclear/medical-engine — internal residency engine (P3.3-A).
 *
 * Budget accounting, deterministic eviction ordering/attempts and snapshot
 * projection. Internal to the `ResourceManager` facade; pure Node, no
 * Cornerstone. A missing measurement is never replaced by a guessed number.
 */
import type { AssetId, AssetResidencyTier } from '@nuclear/shared-types';
import type { VolumeIngestionPlan } from '../renderer/volume-types.js';
import { RESIDENCY_ERROR_CODES, ResidencyError } from './residency-errors.js';
import { isPhysicalTier } from './residency-tier.js';
import type {
  ResidencyMeasurement,
  ResidencyMeasurementState,
  ResourceBudget,
  ResourceLeaseSnapshot,
  ResourceResidencySnapshot,
  ResourceRetention,
  ResourceSettlement,
  StableResidencyTier,
  VolumeResidencyBackend,
} from './residency-types.js';
export type BudgetField = 'cpuBytes' | 'gpuBytes';
const BUDGET_FIELDS: readonly BudgetField[] = ['cpuBytes', 'gpuBytes'];
export interface LeaseRecord {
  readonly leaseId: string;
  readonly retention: ResourceRetention;
  readonly requiredTier: StableResidencyTier;
}
export interface ResourceRecord {
  readonly volumeId: string;
  readonly assetId: AssetId;
  readonly geometricDigest: string;
  readonly plan: VolumeIngestionPlan;
  readonly sequence: number;
  readonly leases: Map<string, LeaseRecord>;
  tier: AssetResidencyTier;
  priorityRank: number;
  requiredTier: StableResidencyTier;
  byteSizeRAM?: number;
  byteSizeVRAM?: number;
  measurement: ResidencyMeasurementState;
}
export interface EvictionContext {
  readonly evictedVolumeIds: string[];
  readonly settlements: ResourceSettlement[];
}
/** Which budget axis a stable tier competes for, or `null` if non-physical. */
export function budgetFieldForTier(tier: StableResidencyTier): BudgetField | null {
  if (tier === 'cpu-cached') {
    return 'cpuBytes';
  }
  if (tier === 'gpu-ready' || tier === 'gpu-resident') {
    return 'gpuBytes';
  }
  return null;
}
/** Bytes a target tier would occupy, when the backend reported them. */
export function bytesForTier(
  measurement: ResidencyMeasurement,
  tier: StableResidencyTier,
): number | undefined {
  const field = budgetFieldForTier(tier);
  return field === null ? undefined : field === 'cpuBytes' ? measurement.byteSizeRAM : measurement.byteSizeVRAM;
}
/** Declared ceiling for an axis, or `undefined` when unbounded. */
export function declaredBudget(
  budget: ResourceBudget | undefined,
  field: BudgetField,
): number | undefined {
  if (budget === undefined) {
    return undefined;
  }
  return field === 'cpuBytes' ? budget.cpuBytes : budget.gpuBytes;
}
/** Fails closed on a malformed budget before any state is stored. */
export function assertValidBudget(budget: ResourceBudget | undefined): void {
  if (budget === undefined) {
    return;
  }
  for (const field of BUDGET_FIELDS) {
    const value = budget[field];
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new ResidencyError(
        RESIDENCY_ERROR_CODES.invalidBudget,
        `Resource budget field '${field}' must be a finite non-negative integer, received ${String(value)}.`,
      );
    }
  }
}
export function describeCause(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function settlementOf(
  resource: ResourceRecord,
  disposition: ResourceSettlement['disposition'],
  requiredTier: StableResidencyTier,
  message?: string,
): ResourceSettlement {
  return message === undefined
    ? { volumeId: resource.volumeId, disposition, tier: resource.tier, requiredTier }
    : { volumeId: resource.volumeId, disposition, tier: resource.tier, requiredTier, message };
}
/** Registration order; deterministic for snapshots and acquisition. */
export function registrationOrder(resources: Map<string, ResourceRecord>): ResourceRecord[] {
  return [...resources.values()].sort((a, b) => a.sequence - b.sequence);
}
/** Eviction order: lowest declared priority first, then oldest sequence. */
export function evictionOrder(resources: Map<string, ResourceRecord>): ResourceRecord[] {
  return [...resources.values()].sort((a, b) =>
    a.priorityRank === b.priorityRank ? a.sequence - b.sequence : a.priorityRank - b.priorityRank,
  );
}
/** Backend measurement is advisory: a throw becomes "unknown", never a guess. */
export function measureSafely(
  backend: VolumeResidencyBackend,
  plan: VolumeIngestionPlan,
  tier: StableResidencyTier,
): ResidencyMeasurement {
  try {
    return backend.measure(plan, tier);
  } catch {
    return {};
  }
}
/** Re-reads the current tier's bytes, or leaves non-physical tiers untouched. */
export function applyMeasurement(backend: VolumeResidencyBackend, resource: ResourceRecord): void {
  if (!isPhysicalTier(resource.tier)) {
    return;
  }
  const measurement = measureSafely(backend, resource.plan, resource.tier);
  resource.byteSizeRAM = measurement.byteSizeRAM;
  resource.byteSizeVRAM = measurement.byteSizeVRAM;
  resource.measurement =
    measurement.byteSizeRAM !== undefined || measurement.byteSizeVRAM !== undefined
      ? 'measured'
      : 'unavailable';
}
/** Projected axis usage if `resource` reaches `needed` bytes. */
export function projectedUsage(
  resources: Iterable<ResourceRecord>,
  resource: ResourceRecord,
  needed: number,
): number {
  const field = budgetFieldForTier(resource.requiredTier);
  if (field === null) {
    return 0;
  }
  let total = 0;
  for (const other of resources) {
    const bytes = field === 'cpuBytes' ? other.byteSizeRAM : other.byteSizeVRAM;
    if (bytes !== undefined) {
      total += bytes;
    }
  }
  const current = field === 'cpuBytes' ? resource.byteSizeRAM : resource.byteSizeVRAM;
  return total - (current ?? 0) + needed;
}
function markEvicted(resource: ResourceRecord): void {
  resource.tier = 'evicted';
  resource.byteSizeRAM = undefined;
  resource.byteSizeVRAM = undefined;
  resource.measurement = 'unavailable';
}
/**
 * Per-volume release only. An ambiguous `false` is resolved through
 * `listAcquiredVolumeIds`; a throw leaves residency unconfirmed.
 */
export function attemptEviction(
  backend: VolumeResidencyBackend,
  resource: ResourceRecord,
): { confirmed: boolean; settlement?: ResourceSettlement } {
  let released: boolean;
  try {
    released = backend.release(resource.volumeId);
  } catch (error) {
    return {
      confirmed: false,
      settlement: settlementOf(
        resource,
        'eviction-failed',
        resource.requiredTier,
        `Backend release threw: ${describeCause(error)}. Residency left at '${resource.tier}'.`,
      ),
    };
  }
  if (released) {
    markEvicted(resource);
    return { confirmed: true };
  }
  let present: boolean;
  try {
    present = backend.listAcquiredVolumeIds().includes(resource.volumeId);
  } catch (error) {
    return {
      confirmed: false,
      settlement: settlementOf(
        resource,
        'enumeration-failed',
        resource.requiredTier,
        `Backend release reported absent but enumeration threw: ${describeCause(error)}. Residency left at '${resource.tier}'.`,
      ),
    };
  }
  if (present) {
    return {
      confirmed: false,
      settlement: settlementOf(
        resource,
        'eviction-failed',
        resource.requiredTier,
        `Backend release reported absent but '${resource.volumeId}' is still enumerated; residency left at '${resource.tier}'.`,
      ),
    };
  }
  markEvicted(resource);
  return { confirmed: false };
}
export function recordEviction(
  backend: VolumeResidencyBackend,
  resource: ResourceRecord,
  context: EvictionContext,
): void {
  const outcome = attemptEviction(backend, resource);
  if (outcome.confirmed) {
    context.evictedVolumeIds.push(resource.volumeId);
  } else if (outcome.settlement !== undefined) {
    context.settlements.push(outcome.settlement);
  }
}
/** Frees zero-lease resources, lowest priority first, until the axis fits. */
export function makeRoom(
  backend: VolumeResidencyBackend,
  resources: Map<string, ResourceRecord>,
  resource: ResourceRecord,
  needed: number,
  ceiling: number,
  context: EvictionContext,
): void {
  let guard = resources.size + 1;
  while (guard > 0 && projectedUsage(resources.values(), resource, needed) > ceiling) {
    guard -= 1;
    const candidate = evictionOrder(resources).find(
      (candidateResource) =>
        candidateResource.volumeId !== resource.volumeId &&
        candidateResource.leases.size === 0 &&
        isPhysicalTier(candidateResource.tier),
    );
    if (candidate === undefined) {
      return;
    }
    recordEviction(backend, candidate, context);
    if (isPhysicalTier(candidate.tier)) {
      return;
    }
  }
}
export function leaseSnapshot(lease: LeaseRecord, volumeId: string): ResourceLeaseSnapshot {
  return {
    leaseId: lease.leaseId,
    volumeId,
    assetId: lease.retention.plan.assetId,
    priority: lease.retention.demand.priority,
    requiredTier: lease.requiredTier,
  };
}
export function resourceSnapshot(resource: ResourceRecord): ResourceResidencySnapshot {
  return {
    volumeId: resource.volumeId,
    assetId: resource.assetId,
    geometricDigest: resource.geometricDigest,
    tier: resource.tier,
    ...(resource.byteSizeRAM === undefined ? {} : { byteSizeRAM: resource.byteSizeRAM }),
    ...(resource.byteSizeVRAM === undefined ? {} : { byteSizeVRAM: resource.byteSizeVRAM }),
    measurement: resource.measurement,
    leases: [...resource.leases.values()]
      .sort((a, b) => a.leaseId.localeCompare(b.leaseId))
      .map((lease) => leaseSnapshot(lease, resource.volumeId)),
  };
}
export function leaseSnapshots(resources: Map<string, ResourceRecord>): ResourceLeaseSnapshot[] {
  const snapshots: ResourceLeaseSnapshot[] = [];
  for (const resource of registrationOrder(resources)) {
    for (const lease of resource.leases.values()) {
      snapshots.push(leaseSnapshot(lease, resource.volumeId));
    }
  }
  return snapshots.sort((a, b) => a.leaseId.localeCompare(b.leaseId));
}
