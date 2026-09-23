/**
 * @nuclear/figure-engine — publication target and output spec construction
 * (P5.2, ADR-014 D3/D4/D5).
 *
 * Target and output specs are derived mechanically from the resolved render
 * mode and the requested format; they are never accepted verbatim from the
 * caller. A live request gets a temporary high-resolution target dimensioned
 * from the sheet millimetres and DPI (`never-resize-live-canvas`); an offline
 * request gets a cached-preview target that forbids resampling. Format always
 * follows the output contract (hybrid vector PDF vs flattened raster).
 *
 * Pure and Node-safe: no DOM, no WebGL, no Cornerstone.
 */

import type {
  PublicationOutputSpec,
  PublicationRenderTargetSpec,
  SheetSizeMm,
} from '@nuclear/shared-types';

import { computeSheetPixels } from './panel-raster.js';

export type PublicationRenderMode = 'live-medical' | 'offline-cached-preview';
export type PublicationOutputFormat = 'tiff' | 'png' | 'pdf';

/**
 * Builds the publication render target. Live requests render at the sheet
 * physical size and requested DPI; offline requests consume the approved cached
 * raster and never resample it (ADR-009 / ADR-014 D3).
 */
export function buildPublicationTarget(
  mode: PublicationRenderMode,
  sheetSizeMm: SheetSizeMm,
  dpi: number,
  colorProfile: string,
  alpha: 'opaque' | 'preserve',
): PublicationRenderTargetSpec {
  if (mode === 'live-medical') {
    return {
      kind: 'temporary-high-resolution',
      pixelDimensions: computeSheetPixels(sheetSizeMm, dpi),
      dpi,
      colorProfile,
      alpha,
      liveCanvasPolicy: 'never-resize-live-canvas',
    };
  }
  return {
    kind: 'cached-preview',
    colorProfile,
    resampling: 'forbidden',
    liveCanvasPolicy: 'never-resize-live-canvas',
  };
}

/**
 * Builds the output spec. A PDF is always hybrid (raster medical panel +
 * native vector editorial layers); TIFF/PNG are flattened rasters. An offline
 * output is flagged `cached-preview` with `resampling: 'forbidden'`.
 */
export function buildPublicationOutput(
  format: PublicationOutputFormat,
  mode: PublicationRenderMode,
): PublicationOutputSpec {
  if (mode === 'live-medical') {
    if (format === 'pdf') {
      return {
        format: 'pdf',
        composition: 'hybrid',
        medicalLayer: 'live-high-resolution-raster',
        editorialLayer: 'native-vector',
        medicalContentSource: 'live-medical',
        preserveTypography: true,
        preserveAnnotations: true,
      };
    }
    return {
      format,
      composition: 'raster',
      medicalLayer: 'live-high-resolution-raster',
      editorialLayer: 'raster',
      medicalContentSource: 'live-medical',
    };
  }

  if (format === 'pdf') {
    return {
      format: 'pdf',
      composition: 'hybrid',
      medicalLayer: 'cached-preview-raster',
      editorialLayer: 'native-vector',
      medicalContentSource: 'cached-preview',
      resampling: 'forbidden',
      preserveTypography: true,
      preserveAnnotations: true,
    };
  }
  return {
    format,
    composition: 'raster',
    medicalLayer: 'cached-preview-raster',
    editorialLayer: 'raster',
    medicalContentSource: 'cached-preview',
    resampling: 'forbidden',
  };
}
