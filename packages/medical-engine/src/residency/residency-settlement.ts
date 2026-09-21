/**
 * @nuclear/medical-engine — internal per-resource settlement (P3.3-A).
 *
 * Extracted verbatim from `ResourceManager` so the facade stays within the
 * source-size gate. Pure Node: no `@cornerstonejs/core`, no DOM. The
 * dispositions, messages and budget semantics are byte-for-byte the same as
 * the former private method, including `budget-unverified`.
 */
import {
  applyMeasurement,
  budgetFieldForTier,
  bytesForTier,
  declaredBudget,
  makeRoom,
  measureSafely,
  projectedUsage,
  settlementOf,
  type EvictionContext,
  type ResourceRecord,
} from './residency-budget.js';
import { residencyRank, tierRank } from './residency-tier.js';
import type {
  ResourceBudget,
  ResourceSettlement,
  StableResidencyTier,
  VolumeResidencyBackend,
} from './residency-types.js';

/**
 * Attempts to acquire `resource` at its required tier.
 *
 * Fail-closed: a declared budget with no backend measurement acquires honestly
 * but is reported `budget-unverified`, never `resident`. A loader throw is
 * reported `loader-failed` with the volume identity preserved; a partial
 * acquisition is `deferred`; an unmeetable budget is `budget-exhausted`.
 */
export function settleResource(
  backend: VolumeResidencyBackend,
  resources: Map<string, ResourceRecord>,
  budget: ResourceBudget | undefined,
  resource: ResourceRecord,
  context: EvictionContext,
): ResourceSettlement {
  const required = resource.requiredTier;
  if (residencyRank(resource.tier) >= tierRank(required)) {
    applyMeasurement(backend, resource);
    return settlementOf(resource, 'resident', required);
  }
  const field = budgetFieldForTier(required);
  if (field === null) {
    applyMeasurement(backend, resource);
    return settlementOf(resource, 'resident', required);
  }
  const measurement = measureSafely(backend, resource.plan, required);
  const needed = bytesForTier(measurement, required);
  const ceiling = declaredBudget(budget, field);
  // A declared budget with no backend measurement is not enforceable: acquire honestly, but never claim verified residency.
  const budgetUnverified = ceiling !== undefined && needed === undefined;
  if (ceiling !== undefined && needed !== undefined) {
    makeRoom(backend, resources, resource, needed, ceiling, context);
    if (projectedUsage(resources.values(), resource, needed) > ceiling) {
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
    achieved = backend.acquire(resource.plan, required);
  } catch (error) {
    return settlementOf(
      resource,
      'loader-failed',
      required,
      `Backend acquire threw: ${error instanceof Error ? error.message : String(error)}. Volume identity preserved at '${resource.tier}'.`,
    );
  }
  resource.tier = achieved;
  applyMeasurement(backend, resource);
  if (tierRank(achieved) < tierRank(required)) {
    return settlementOf(resource, 'deferred', required, `Backend reached only '${achieved}' for required '${required}'; the volume is partially resident.`);
  }
  if (budgetUnverified) {
    return settlementOf(resource, 'budget-unverified', required, `Declared budget field '${field}' is set but the residency backend exposes no '${field}' measurement for '${required}'; '${resource.volumeId}' was acquired without a verifiable budget guarantee, which is not proof of sufficiency.`);
  }
  return settlementOf(resource, 'resident', required);
}
