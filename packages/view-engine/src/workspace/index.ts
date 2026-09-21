/**
 * @nuclear/view-engine — workspace subsystem barrel (P4.1).
 *
 * Re-exports the Node-safe workspace core: typed errors, the logical
 * `ViewSlotRegistry` (four `ViewGroup`s of four roles, 16 slots) and the
 * serializable `ImagingWorkspace` study/asset registry. No React, DOM,
 * Cornerstone, figure-engine or resource-residency code lives here.
 */
export * from './errors.js';
export * from './value-integrity.js';
export * from './view-slot-registry.js';
export * from './imaging-workspace.js';
