/**
 * @nuclear/view-engine — shared-state subsystem barrel (P4.3).
 *
 * Re-exports the Node-safe shared-state core: contracts, typed fail-closed
 * errors, the `SharedStateGroup` holder, the projection helper and the
 * `SharedStateGroupRegistry`. The `@internal` commit/current primitives in
 * `group.ts` are deliberately NOT re-exported: they are the private holder
 * mutation surface and must stay inside the package.
 */
export * from './types.js';
export * from './errors.js';
export { SharedStateGroup } from './group.js';
export * from './project.js';
export * from './registry.js';
