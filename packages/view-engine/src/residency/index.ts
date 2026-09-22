/**
 * @nuclear/view-engine — residency subsystem barrel (P4.7).
 *
 * Re-exports the Node-safe demand projection: the contracts (`types`), the
 * fail-closed `ResidencyProjectionError`, the pure `projectResourceRetentionRequests`
 * / `resourceLeaseIdFor` seam and `reconcileResourceDemand`. The `internal/`
 * helpers stay private (as with every other view-engine subsystem).
 */
export * from './types.js';
export * from './errors.js';
export { projectResourceRetentionRequests, resourceLeaseIdFor } from './project.js';
export { reconcileResourceDemand } from './reconcile.js';
