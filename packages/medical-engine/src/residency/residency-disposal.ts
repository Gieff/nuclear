/**
 * @nuclear/medical-engine — internal terminal resource disposal (P3.3-B).
 *
 * Disposal is deliberately NOT eviction policy: it releases every resource
 * that still occupies a physical tier (`cpu-cached`/`gpu-ready`/
 * `gpu-resident`), including resources pinned by a live lease. It reuses the
 * per-volume `attemptEviction`/`recordEviction` path supplied by
 * `residency-budget.ts`; there is no global purge and no backend-wide call.
 *
 * Pure Node: no `@cornerstonejs/core`, no DOM.
 */
import {
  evictionOrder,
  recordEviction,
  type EvictionContext,
  type ResourceRecord,
} from './residency-budget.js';
import { isPhysicalTier } from './residency-tier.js';
import type { ResourceSettlement, VolumeResidencyBackend } from './residency-types.js';

/** Outcome of one terminal disposal pass over the tracked resources. */
export interface DisposalOutcome {
  readonly evictedVolumeIds: readonly string[];
  readonly settlements: readonly ResourceSettlement[];
  /** The `eviction-failed`/`enumeration-failed` settlements, if any. */
  readonly failures: readonly ResourceSettlement[];
}

/**
 * Releases every physical resource in deterministic eviction order.
 *
 * A `false` release is resolved through `listAcquiredVolumeIds` exactly as in
 * selective eviction, so a genuinely absent volume is never reported as a
 * failure and a throw is never mistaken for success. Eviction records are
 * appended to `context`; only the records produced by this pass are returned.
 */
export function disposeResources(
  backend: VolumeResidencyBackend,
  resources: Map<string, ResourceRecord>,
  context: EvictionContext,
): DisposalOutcome {
  const evictionsBefore = context.evictedVolumeIds.length;
  const settlementsBefore = context.settlements.length;
  for (const resource of evictionOrder(resources)) {
    if (isPhysicalTier(resource.tier)) {
      recordEviction(backend, resource, context);
    }
  }
  const evictedVolumeIds = context.evictedVolumeIds.slice(evictionsBefore);
  const settlements = context.settlements.slice(settlementsBefore);
  const failures = settlements.filter(
    (settlement) =>
      settlement.disposition === 'eviction-failed' ||
      settlement.disposition === 'enumeration-failed',
  );
  return { evictedVolumeIds, settlements, failures };
}
