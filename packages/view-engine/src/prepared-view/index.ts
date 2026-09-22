/**
 * @nuclear/view-engine — prepared-view subsystem barrel (P4.2).
 *
 * Re-exports the Node-safe assembly and registry core: typed fail-closed
 * errors, `assemblePreparedView` / `boundAssetIds`, and the identity-
 * preserving `PreparedViewRegistry`. No React, DOM, Cornerstone, figure-engine
 * or resource-residency code lives here.
 */
export * from './errors.js';
export * from './assemble.js';
export * from './registry.js';
export * from './provenance-correlation.js';
