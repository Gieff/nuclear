/**
 * @nuclear/medical-engine — residency subsystem barrel (P3.3-A).
 *
 * Re-exports the pure residency contracts, typed errors, ladder helpers,
 * budget accounting helpers and the `ResourceManager` state machine. All
 * Node-safe: no `@cornerstonejs/core`, no DOM.
 */

export * from './residency-types.js';
export * from './residency-errors.js';
export * from './residency-tier.js';
export * from './resource-manager.js';
