/**
 * @nuclear/figure-engine — publication subsystem barrel (P5.1).
 *
 * Re-exports the Node-safe publication core: typed fail-closed errors, the
 * physical mm <-> pixel units, panel/sheet raster dimensioning and figure-sheet
 * placement. No React, DOM, Cornerstone or `medical-engine` runtime import
 * lives here (ADR-014 D1/D2).
 */

export * from './errors.js';
export * from './units.js';
export * from './panel-raster.js';
export * from './layout.js';
