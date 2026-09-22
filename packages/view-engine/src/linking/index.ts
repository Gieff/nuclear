/**
 * @nuclear/view-engine — linking subsystem barrel (C3 / P4.0.1).
 *
 * Re-exports the Node-safe co-reference eligibility check and its typed,
 * fail-closed errors. No React, DOM, Cornerstone or resource-residency code
 * lives here; P4.4 wires this into the public link API.
 */
export * from './errors.js';
export * from './co-reference.js';
