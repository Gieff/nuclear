/**
 * @nuclear/figure-engine — publication subsystem barrel (P5.1–P5.4).
 *
 * Re-exports the Node-safe publication core: typed fail-closed errors, the
 * physical mm <-> pixel units, panel/sheet raster dimensioning, figure-sheet
 * placement, provenance equality and `PublicationRenderRequest` assembly. No
 * React, DOM, Cornerstone or `medical-engine` runtime import lives here
 * (ADR-014 D1/D2).
 */

export * from './errors.js';
export * from './units.js';
export * from './panel-raster.js';
export * from './framing.js';
export * from './layout.js';
export * from './sheet-placement.js';
export * from './annotation-policy.js';
export * from './patient-projection.js';
export * from './render-port.js';
export * from './render-orchestrator.js';
export * from './encode-port.js';
export * from './compose-sheet.js';
export * from './plan-builder.js';
export * from './pdf-units.js';
export * from './pdf-document.js';
export * from './editorial-mapping.js';
export * from './provenance.js';
export * from './targets.js';
export * from './request-types.js';
export * from './request.js';
