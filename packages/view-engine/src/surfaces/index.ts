/**
 * @nuclear/view-engine — surfaces subsystem barrel (P4.6).
 *
 * Re-exports the Node-safe surface core: the contracts (`types`), the
 * fail-closed `SurfaceError`, the identity/lifecycle `ViewportSurfaceRegistry`
 * and the pure `SurfaceLayoutManager`. The `internal/` helpers stay private
 * (as with every other view-engine subsystem).
 */
export * from './types.js';
export * from './errors.js';
export * from './registry.js';
export * from './layout.js';
