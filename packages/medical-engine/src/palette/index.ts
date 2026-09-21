/**
 * @nuclear/medical-engine — palette subsystem barrel (P3.4-B.1.1).
 *
 * Re-exports the Node-safe, typed DICOM palette id resolver. This barrel
 * imports only `@nuclear/rendering-presets`; it never imports Cornerstone, so
 * it is safe to export from the package root.
 */

export * from './palette-resolution.js';
