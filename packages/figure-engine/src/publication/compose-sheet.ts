/**
 * @nuclear/figure-engine — pure flattened sheet compositor (P5.6, ADR-015).
 *
 * Places raster panel layers at their physical sheet rectangles and produces one
 * flattened RGBA8 sheet raster, ready for the `EncoderPort` (PNG/TIFF). Pure and
 * Node-safe: no DOM, no WebGL, no `node:zlib`. The compositor **never resamples**
 * a layer: a raster whose pixel dimensions differ from its physical destination
 * at the plan DPI is refused (ADR-015, no upscale).
 *
 * Physical validation is shared with the hybrid PDF builder via
 * `composition-validation.ts`, so a hand-built/mutated plan cannot bypass the
 * no-resampling/containment rules on either export path.
 *
 * Editorial vector/text rasterization into this raster is a follow-up sub-slice;
 * this v1 composites raster layers over a background.
 */

import type { FigurePanelId, FigureSheetId } from '@nuclear/shared-types';

import { assertValidCompositionPlan, validateCompositionLayer, validatePlan } from './composition-validation.js';
import type { PixelDimensions } from './units.js';

export interface CompositionRectMm {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

/** One raster panel placed on the sheet at a physical rectangle. */
export interface CompositionRasterLayer {
  readonly panelId: FigurePanelId;
  readonly rectMm: CompositionRectMm;
  readonly pixelDimensions: PixelDimensions;
  /** Row-major RGBA8 bytes; length must equal `width * height * 4`. */
  readonly rgba: Uint8Array;
}

export interface PublicationCompositionPlan {
  readonly sheetId: FigureSheetId;
  readonly sheetSizeMm: readonly [number, number];
  readonly dpi: number;
  /** Sheet raster dimensions; must equal `sheetSizeMm` at `dpi`. */
  readonly pixelDimensions: PixelDimensions;
  /** Opaque background, `#rrggbb`. */
  readonly backgroundColor: string;
  readonly layers: readonly CompositionRasterLayer[];
}

export interface PublicationSheetRaster {
  readonly pixelDimensions: PixelDimensions;
  readonly rgba: Uint8Array;
}

/**
 * Flattens the plan into one RGBA8 sheet raster. Refuses
 * `FIGURE_COMPOSITION_INVALID` for an inconsistent plan or a layer that does not
 * fit, is not a valid RGBA buffer, or would require resampling.
 */
export function composeSheetRgba(plan: PublicationCompositionPlan): PublicationSheetRaster {
  const { width, height, background } = validatePlan(plan);
  const sheet = new Uint8Array(width * height * 4);
  const [backgroundR, backgroundG, backgroundB] = background;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    sheet[offset] = backgroundR;
    sheet[offset + 1] = backgroundG;
    sheet[offset + 2] = backgroundB;
    sheet[offset + 3] = 255;
  }

  for (const [layerIndex, layer] of plan.layers.entries()) {
    const { xPx, yPx, width: layerWidth, height: layerHeight } = validateCompositionLayer(
      layer,
      layerIndex,
      plan.dpi,
      width,
      height,
    );

    for (let row = 0; row < layerHeight; row += 1) {
      for (let column = 0; column < layerWidth; column += 1) {
        const source = (row * layerWidth + column) * 4;
        const destination = ((yPx + row) * width + (xPx + column)) * 4;
        const alpha = layer.rgba[source + 3];
        if (alpha === 0) {
          continue;
        }
        if (alpha === 255) {
          sheet[destination] = layer.rgba[source];
          sheet[destination + 1] = layer.rgba[source + 1];
          sheet[destination + 2] = layer.rgba[source + 2];
          sheet[destination + 3] = 255;
          continue;
        }
        const inverse = 255 - alpha;
        sheet[destination] = Math.round((layer.rgba[source] * alpha + sheet[destination] * inverse) / 255);
        sheet[destination + 1] = Math.round((layer.rgba[source + 1] * alpha + sheet[destination + 1] * inverse) / 255);
        sheet[destination + 2] = Math.round((layer.rgba[source + 2] * alpha + sheet[destination + 2] * inverse) / 255);
        sheet[destination + 3] = 255;
      }
    }
  }

  return { pixelDimensions: [width, height], rgba: sheet };
}

/**
 * Fail-closed physical validation of a composition plan **and all of its raster
 * layers** (shape, RGBA8 length, no resampling at the plan DPI, sheet
 * containment) without rasterizing. Reused by the hybrid PDF request builder
 * (P5.7) so a hand-built/mutated plan cannot bypass the no-resampling invariant
 * on the PDF export path; refuses `FIGURE_COMPOSITION_INVALID` exactly as
 * `composeSheetRgba` would.
 */
export function assertPublicationCompositionPlan(plan: PublicationCompositionPlan): void {
  assertValidCompositionPlan(plan);
}
