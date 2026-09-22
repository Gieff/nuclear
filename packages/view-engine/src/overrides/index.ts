/**
 * @nuclear/view-engine — local-override subsystem barrel (P4.5).
 *
 * Re-exports the Node-safe override surface: the typed fail-closed
 * `OverrideError` and the pure `resolveLocalViewOverride` /
 * `ResolvedLocalView` value operation. No React, DOM, Cornerstone or
 * resource-residency code lives here.
 */
export * from './errors.js';
export * from './apply.js';
