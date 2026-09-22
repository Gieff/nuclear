/**
 * @nuclear/view-engine — resource-demand projection contracts (P4.7).
 *
 * The view engine declares demand; `medical-engine` owns physical residency.
 * A `ResourceRetentionRequest` is the semantic projection of one active,
 * visible `ViewSlot` demand: it carries the stable, caller-owned lease id and
 * the projected `ResourceDemand`, but **no** physical volume-ingestion plan.
 *
 * The physical plan is deliberately absent here: the ingestion-plan type is
 * not part of the `@nuclear/medical-engine` public surface, so the caller
 * injects a `ResourceRetentionBuilder` that attaches the plan and availability
 * and returns a full `ResourceRetention`. The view engine never names the plan
 * type and never implements residency policy (ADR-010 §6).
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type { ResourceDemand, ViewSlot, ViewSlotId } from '@nuclear/shared-types';
import type { ResourceManager, ResourceRetention } from '@nuclear/medical-engine';

/** Visibility of a slot in the current layout. Missing slot id => hidden. */
export type SlotVisibility = 'visible' | 'hidden';

/** One active slot's declared demand, projected with a stable lease id. */
export interface ResourceRetentionRequest {
  readonly leaseId: string;
  readonly slotId: ViewSlotId;
  readonly demand: ResourceDemand;
}

/**
 * Caller-supplied seam that attaches the physical plan + availability to a
 * projected request. It must return a retention whose `leaseId` and `demand`
 * match the request exactly; `reconcileResourceDemand` validates this
 * fail-closed before any `ResourceManager` mutation.
 */
export type ResourceRetentionBuilder = (request: ResourceRetentionRequest) => ResourceRetention;

/** Pure projection input: the slots plus their visibility in the layout. */
export interface ProjectResourceRetentionRequestsInput {
  readonly slots: readonly ViewSlot[];
  /** Missing slot id => hidden. */
  readonly visibility: ReadonlyMap<ViewSlotId, SlotVisibility>;
}

/** Reconcile input: the projection plus the manager and the builder seam. */
export interface ReconcileResourceDemandInput extends ProjectResourceRetentionRequestsInput {
  readonly manager: ResourceManager;
  readonly buildRetention: ResourceRetentionBuilder;
}
