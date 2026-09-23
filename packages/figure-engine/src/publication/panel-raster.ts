/**
 * @nuclear/figure-engine — panel and sheet publication raster dimensioning
 * (P5.1, ADR-014 D2/D3 and OD-3).
 *
 * A medical panel's publication raster covers the **content aperture**, i.e.
 * `PanelFramingState.contentSizeMm`. `contentScale` scales the medical content
 * *inside* the aperture (ADR-014 OD-3, still open) and therefore must not
 * silently change the aperture pixel requirement. The whole-sheet dimensions
 * are used for the flattened TIFF/PNG composition.
 *
 * Pure and Node-safe: no DOM, no WebGL, no Cornerstone.
 */

import type { PanelFramingState, SheetSizeMm } from '@nuclear/shared-types';

import { mmToPixels, type PhysicalSizeMm, type PixelDimensions } from './units.js';

/**
 * Publication raster dimensions required for one panel content aperture at the
 * requested DPI. Delegates the physical conversion to {@link mmToPixels}, which
 * refuses non-finite/non-positive input rather than defaulting it.
 */
export function computePanelContentPixels(
  framing: PanelFramingState,
  dpi: number,
): PixelDimensions {
  const aperture: PhysicalSizeMm = framing.contentSizeMm;
  return mmToPixels(aperture, dpi);
}

/**
 * Publication raster dimensions required for the complete figure sheet at the
 * requested DPI. Used by the flattened TIFF/PNG composition.
 */
export function computeSheetPixels(sheetSizeMm: SheetSizeMm, dpi: number): PixelDimensions {
  return mmToPixels(sheetSizeMm, dpi);
}
