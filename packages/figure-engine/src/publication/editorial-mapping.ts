/**
 * @nuclear/figure-engine — ADR-016 editorial `FigureSheet` → native PDF vector
 * mapping (P5.7 follow-up c, ratified A-set).
 *
 * Pure and Node-safe: it consumes only the frozen contracts and the ratified
 * transforms (`panelSheetRectMm`, `panelContentToSheet` OD-2,
 * `projectPatientAnnotation`/`projectPatientPointToSheet` OD-4/OD-5). It emits
 * only native `PublicationVectorLayer`s in sheet millimetres, in the OD-7a
 * paint order, and **invents no geometry**: panel backgrounds, solid borders,
 * labels/captions, text/panel-letter boxes, `line` annotations (sheet,
 * panel-content, patient) and sheet/panel-content ROI ellipses/polygons are
 * mapped; arrows, scalebars, measurements, dashed/dotted borders, bold or
 * unsupported fonts, patient-space text/ROI shapes and any malformed input are
 * typed `FIGURE_PDF_DOCUMENT_INVALID` refusals (OD-7j). Annotation mapping lives
 * in `editorial-mapping-annotations.ts`.
 */

import type { ComposerPanel, FigureAnnotation, FigureSheet } from '@nuclear/shared-types';

import { orderPanelsByZ, panelSheetRectMm } from './layout.js';
import { panelContentToSheet } from './sheet-placement.js';
import { mapAnnotation, type MappingContext } from './editorial-mapping-annotations.js';
import {
  asColorField,
  asPairField,
  asPositiveField,
  assertPanelUnrotated,
  assertSingleLine,
  assertSupportedFont,
  readFigureSheet,
  readFontContext,
  readPanelStructure,
  readResolutions,
  type EditorialFontContext,
  type EditorialPanelResolution,
} from './editorial-mapping-support.js';
import { asRecord, fail } from './pdf-validation-primitives.js';
import type { PublicationVectorLayer } from './pdf-document.js';

export type { EditorialFontContext, EditorialPanelResolution } from './editorial-mapping-support.js';

export interface BuildEditorialVectorLayersInput {
  readonly figureSheet: FigureSheet;
  readonly font: EditorialFontContext;
  /** Resolved medical state per panel, required only for patient annotations. */
  readonly resolutions?: readonly EditorialPanelResolution[];
}

/** Panel background/border/label/caption → OD-7a ordered vector layers. */
function mapPanelDecorations(
  panel: ComposerPanel,
  context: MappingContext,
  below: PublicationVectorLayer[],
  borders: PublicationVectorLayer[],
  labels: PublicationVectorLayer[],
): void {
  const path = `panel '${panel.id}'`;
  const layout = panel.layout;
  const decoration = asRecord(panel.decoration, `${path}.decoration`);
  assertPanelUnrotated(layout, path);
  const rectMm = panelSheetRectMm(layout);

  if (decoration.background !== undefined) {
    below.push({
      kind: 'rect',
      rectMm,
      fillColor: asColorField(decoration.background, `${path}.decoration.background`),
      placement: 'below-medical',
    });
  }

  if (decoration.border !== undefined) {
    const border = asRecord(decoration.border, `${path}.decoration.border`);
    if (border.style !== 'none') {
      if (border.style !== 'solid') {
        fail(`${path}.decoration.border.style '${String(border.style)}' is not supported; only 'solid'/'none' are ratified (ADR-016 OD-7c)`);
      }
      borders.push({
        kind: 'rect',
        rectMm,
        borderColor: asColorField(border.color, `${path}.decoration.border.color`),
        borderWidthMm: asPositiveField(border.widthMm, `${path}.decoration.border.widthMm`),
        placement: 'above-medical',
      });
    }
  }

  for (const key of ['label', 'caption'] as const) {
    const value = decoration[key];
    if (value === undefined) {
      continue;
    }
    const label = asRecord(value, `${path}.decoration.${key}`);
    const text = label.text;
    if (typeof text !== 'string' || text.trim().length === 0) {
      fail(`${path}.decoration.${key}.text must be a non-blank string`);
    }
    assertSingleLine(text, `${path}.decoration.${key}.text`);
    assertSupportedFont(label.fontFamily, context.font, `${path}.decoration.${key}`);
    labels.push({
      kind: 'text',
      text,
      originMm: panelContentToSheet(layout, asPairField(label.position, `${path}.decoration.${key}.position`)),
      fontSizePt: asPositiveField(label.fontSizePt, `${path}.decoration.${key}.fontSizePt`),
      color: asColorField(label.color, `${path}.decoration.${key}.color`),
      placement: 'above-medical',
    });
  }
}

/**
 * Maps a `FigureSheet` to native vector layers in the OD-7a paint order:
 * panel backgrounds, then borders, then annotations (array order), then
 * labels/captions. Rasters are painted by the adapter between the
 * `'below-medical'` and `'above-medical'` layers. Fail-closed (OD-7j).
 */
export function buildEditorialVectorLayers(
  input: BuildEditorialVectorLayersInput,
): readonly PublicationVectorLayer[] {
  const record = input as unknown as Record<string, unknown>;
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    fail('editorial mapping input must be a plain object');
  }
  const sheet = readFigureSheet(record.figureSheet);
  const font = readFontContext(record.font);
  const resolutions = readResolutions(record.resolutions);

  const orderedPanels = orderPanelsByZ(sheet.panels.map((panel, index) => readPanelStructure(panel, index)));
  const panelById = new Map<string, ComposerPanel>(orderedPanels.map((panel) => [panel.id, panel]));
  const context: MappingContext = { font, panelById, resolutions };

  const below: PublicationVectorLayer[] = [];
  const borders: PublicationVectorLayer[] = [];
  const labels: PublicationVectorLayer[] = [];
  for (const panel of orderedPanels) {
    mapPanelDecorations(panel, context, below, borders, labels);
  }

  const annotations: PublicationVectorLayer[] = [];
  for (const [index, annotation] of sheet.annotations.entries()) {
    // A null/primitive annotation entry must be a typed refusal, not a
    // `TypeError` when `mapAnnotation` reads `.kind`.
    const entry = asRecord(annotation, `figureSheet.annotations[${index}]`);
    const layer = mapAnnotation(entry as unknown as FigureAnnotation, index, context);
    if (layer !== undefined) {
      annotations.push(layer);
    }
  }

  return Object.freeze([...below, ...borders, ...annotations, ...labels]);
}
