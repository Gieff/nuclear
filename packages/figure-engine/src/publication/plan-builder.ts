/**
 * @nuclear/figure-engine — publication composition plan builder (P5.6).
 *
 * Maps the semantic figure (`FigureSheet` + `PanelLayoutState`/`PanelFramingState`
 * in mm) and the P5.5 high-resolution panel rasters into a deterministic
 * `PublicationCompositionPlan` (physical sheet pixels), ready for
 * `composeSheetRgba` and the `EncoderPort`. Pure and Node-safe: no DOM, no
 * WebGL, no `node:zlib`, no third-party encoder; structural validation (typed
 * refusals, never a bare `TypeError`) lives in `plan-builder-validation.ts`.
 *
 * Deliberately fail-closed where a semantic is not yet ratified: the raster
 * covers the panel **content aperture** (`framing.contentSizeMm`); until the
 * placement of that aperture *inside* a larger panel opening is ratified
 * (tracked as a follow-up decision in the Phase 5 plan), the builder requires
 * the panel size (`layout.sizeMm`) to equal the aperture, and a non-zero panel
 * rotation is refused (ADR-014 OD-2).
 */

import type { ComposerPanel, FigureSheet } from '@nuclear/shared-types';

import type { CompositionRasterLayer, PublicationCompositionPlan } from './compose-sheet.js';
import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import { refuse } from './guards.js';
import { assertPanelWithinSheet, orderPanelsByZ } from './layout.js';
import { computePanelContentPixels, computeSheetPixels } from './panel-raster.js';
import {
  asFinitePositive,
  decodeBase64,
  parseBackground,
  readCompositionSheet,
  readPanelRasters,
} from './plan-builder-validation.js';
import type { PublicationPanelRaster } from './render-port.js';

export interface BuildPublicationCompositionPlanInput {
  readonly figureSheet: FigureSheet;
  /** Exactly one raster per sheet panel, matched by `panelId` (P5.5 output). */
  readonly panelRasters: readonly PublicationPanelRaster[];
  readonly dpi: number;
  /** Opaque background, `#rrggbb`. */
  readonly backgroundColor: string;
}

function samePair(left: readonly number[], right: readonly number[]): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function rasterHasExpectedSize(raster: PublicationPanelRaster, expected: readonly [number, number]): boolean {
  return raster.pixelDimensions[0] === expected[0] && raster.pixelDimensions[1] === expected[1];
}

/**
 * Builds the flattened-sheet composition plan. Refuses
 * `FIGURE_COMPOSITION_INVALID` for a panel/raster mismatch, a raster whose
 * dimensions differ from its physical aperture at the DPI (no resampling), an
 * aperture/panel size mismatch, or an extra raster; rotation and containment
 * refusals propagate from `layout.ts`.
 */
export function buildPublicationCompositionPlan(
  input: BuildPublicationCompositionPlanInput,
): PublicationCompositionPlan {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      'composition plan input must be a plain object',
    );
  }
  const source = input as unknown as Record<string, unknown>;
  const sheet = readCompositionSheet(source.figureSheet);
  const rasters = readPanelRasters(source.panelRasters);
  const dpi = asFinitePositive(source.dpi, 'dpi');
  const backgroundColor = parseBackground(source.backgroundColor);

  const orderedPanels = orderPanelsByZ(sheet.panels as unknown as readonly ComposerPanel[]);
  const layers: CompositionRasterLayer[] = [];
  const used = new Set<string>();

  for (const [index, panel] of orderedPanels.entries()) {
    const path = `panels[${index}]`;
    const aperturePixels = computePanelContentPixels(panel.framing, dpi);
    if (!samePair(panel.framing.contentSizeMm, panel.layout.sizeMm)) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
        `${path} content aperture [${panel.framing.contentSizeMm.join(', ')}] mm must equal the panel size [${panel.layout.sizeMm.join(', ')}] mm; aperture-inside-panel placement is not yet ratified`,
      );
    }
    const rect = assertPanelWithinSheet(panel.layout, sheet.sizeMm);

    const raster = rasters.get(panel.id);
    if (raster === undefined) {
      refuse(FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid, `panel '${panel.id}' has no rendered raster`);
    }
    if (!rasterHasExpectedSize(raster, aperturePixels)) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
        `panel '${panel.id}' raster ${raster.pixelDimensions.join('x')} px must equal its ${panel.framing.contentSizeMm.join('x')} mm aperture at ${dpi} dpi (${aperturePixels.join('x')} px); resampling is refused`,
      );
    }
    const rgba = decodeBase64(raster.rgbaBase64, `panel '${panel.id}' rgbaBase64`);
    const expectedBytes = aperturePixels[0] * aperturePixels[1] * 4;
    if (rgba.length !== expectedBytes || raster.byteLength !== expectedBytes) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
        `panel '${panel.id}' raster must carry ${expectedBytes} RGBA8 bytes (decoded ${rgba.length}, declared ${String(raster.byteLength)})`,
      );
    }

    used.add(panel.id);
    layers.push({
      panelId: panel.id,
      rectMm: { xMm: rect.xMm, yMm: rect.yMm, widthMm: rect.widthMm, heightMm: rect.heightMm },
      pixelDimensions: [aperturePixels[0], aperturePixels[1]],
      rgba,
    });
  }

  if (used.size !== rasters.size) {
    const unused = [...rasters.keys()].filter((panelId) => !used.has(panelId));
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      `unused panel raster(s) ${unused.join(', ')}; supply exactly one raster per sheet panel`,
    );
  }

  return {
    sheetId: sheet.id,
    sheetSizeMm: sheet.sizeMm,
    dpi,
    pixelDimensions: computeSheetPixels(sheet.sizeMm, dpi),
    backgroundColor,
    layers,
  };
}
