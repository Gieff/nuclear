/**
 * @nuclear/figure-engine — ADR-016 editorial annotation mapping (P5.7 follow-up
 * c). Internal module: not re-exported from the package barrel.
 *
 * Maps the frozen `FigureAnnotation` kinds to native `PublicationVectorLayer`s
 * for the supported subset, and fails closed with a typed
 * `FIGURE_PDF_DOCUMENT_INVALID` (ADR-016 OD-7j) for everything the ratified
 * A-set does not cover: arrows, scalebars, measurements, bold/unsupported fonts,
 * dashed/dotted styles and patient-space text/ROI shapes. Pure and Node-safe.
 */

import type { ComposerPanel, FigureAnnotation, PatientAnnotationAnchor } from '@nuclear/shared-types';

import {
  asArray,
  asColorField,
  asNonNegativeFinite,
  asPairField,
  asPositiveField,
  asPositivePairField,
  asTriple,
  assertPanelUnrotated,
  assertSingleLine,
  assertSupportedFont,
  linearStyle,
  rectanglePolygonMm,
  type EditorialFontContext,
  type EditorialPanelResolution,
} from './editorial-mapping-support.js';
import { panelContentToSheet } from './sheet-placement.js';
import {
  projectPatientAnnotation,
  projectPatientPointToSheet,
  type PatientAnnotationProjectionInput,
} from './patient-projection.js';
import { asRecord, asRotationDeg, fail } from './pdf-validation-primitives.js';
import { pointsToMm } from './pdf-units.js';
import type { PublicationVectorLayer } from './pdf-document.js';

export interface MappingContext {
  readonly font: EditorialFontContext;
  readonly panelById: ReadonlyMap<string, ComposerPanel>;
  readonly resolutions: ReadonlyMap<string, EditorialPanelResolution>;
}

function panelForAnchor(anchor: unknown, context: MappingContext, path: string): ComposerPanel {
  const anchorRecord = asRecord(anchor, `${path}.anchor`);
  const panelId = anchorRecord.panelId;
  if (typeof panelId !== 'string' || panelId.length === 0) {
    fail(`${path} anchor must carry a panelId`);
  }
  const panel = context.panelById.get(panelId);
  if (panel === undefined) {
    fail(`${path} anchor panel '${panelId}' is not part of the figure sheet`);
  }
  return panel;
}

function resolveSheet2d(
  space: string,
  point: unknown,
  anchor: unknown,
  context: MappingContext,
  path: string,
): readonly [number, number] {
  if (space === 'sheet') {
    if (asRecord(anchor, `${path}.anchor`).kind !== 'sheet') {
      fail(`${path} sheet coordinate space requires a sheet anchor (ADR-016 OD-7j)`);
    }
    return asPairField(point, path);
  }
  if (space === 'panel-content') {
    if (asRecord(anchor, `${path}.anchor`).kind !== 'panel-content') {
      fail(`${path} panel-content coordinate space requires a panel-content anchor (ADR-016 OD-7j)`);
    }
    const layout = panelForAnchor(anchor, context, path).layout;
    assertPanelUnrotated(layout, path);
    return panelContentToSheet(layout, asPairField(point, path));
  }
  fail(`${path} patient-space 2D mapping is not supported; use a sheet or panel-content anchor`);
}

function mapLine(
  annotation: Extract<FigureAnnotation, { kind: 'line' | 'arrow' }>,
  index: number,
  context: MappingContext,
): PublicationVectorLayer | undefined {
  const path = `annotations[${index}]`;
  if (annotation.kind !== 'line') {
    fail(`${path} arrow annotations are not supported: the arrowhead geometry is not ratified (ADR-016 OD-7f)`);
  }
  const strokeColor = asColorField(annotation.strokeColor, `${path}.strokeColor`);
  const strokeWidthMm = asPositiveField(annotation.strokeWidthMm, `${path}.strokeWidthMm`);
  const endpoints = asArray(annotation.endpoints, `${path}.endpoints`);
  if (endpoints.length !== 2) {
    fail(`${path}.endpoints must be exactly two points`);
  }
  const [rawFrom, rawTo] = endpoints as readonly [unknown, unknown];

  if (annotation.coordinateSpace !== 'patient') {
    return {
      kind: 'line',
      fromMm: resolveSheet2d(annotation.coordinateSpace, rawFrom, annotation.anchor, context, `${path}.endpoints[0]`),
      toMm: resolveSheet2d(annotation.coordinateSpace, rawTo, annotation.anchor, context, `${path}.endpoints[1]`),
      strokeColor,
      strokeWidthMm,
      placement: 'above-medical',
    };
  }

  const anchor = asRecord(annotation.anchor, `${path}.anchor`);
  if (anchor.kind !== 'patient') {
    fail(`${path} patient coordinate space requires a patient anchor`);
  }
  const panel = panelForAnchor(anchor, context, path);
  const resolution = context.resolutions.get(panel.id);
  if (resolution === undefined) {
    fail(`${path} has no resolved MedicalViewState for panel '${panel.id}'`);
  }
  const projectionInput: PatientAnnotationProjectionInput = {
    anchor: anchor as unknown as PatientAnnotationAnchor,
    availability: resolution.availability,
    state: resolution.state,
    framing: panel.framing,
    layout: panel.layout,
  };
  const projection = projectPatientAnnotation(projectionInput);
  if (!projection.visible) {
    return undefined;
  }
  return {
    kind: 'line',
    fromMm: projectPatientPointToSheet(projectionInput, asTriple(rawFrom, `${path}.endpoints[0]`)),
    toMm: projectPatientPointToSheet(projectionInput, asTriple(rawTo, `${path}.endpoints[1]`)),
    strokeColor,
    strokeWidthMm,
    opacity: projection.opacity,
    placement: 'above-medical',
  };
}

function mapText(
  annotation: Extract<FigureAnnotation, { kind: 'text' | 'panel-letter' }>,
  index: number,
  context: MappingContext,
): PublicationVectorLayer {
  const path = `annotations[${index}]`;
  const typography = asRecord(annotation.typography, `${path}.typography`);
  assertSupportedFont(typography.fontFamily, context.font, `${path}.typography`);
  if (typography.weight !== 'normal') {
    fail(`${path}.typography.weight '${String(typography.weight)}' is not supported; no bold Inter face is vendored (ADR-016 OD-7e)`);
  }
  const text = annotation.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    fail(`${path}.text must be a non-blank string`);
  }
  assertSingleLine(text, `${path}.text`);
  if (annotation.coordinateSpace === 'patient') {
    fail(`${path} patient-anchored text boxes are not supported: the box orientation is unratified (ADR-016 OD-7e)`);
  }
  const fontSizePt = asPositiveField(typography.fontSizePt, `${path}.typography.fontSizePt`);
  const color = asColorField(typography.color, `${path}.typography.color`);
  const box = asRecord(annotation.box, `${path}.box`);
  const sizeMm = asPositivePairField(box.sizeMm, `${path}.box.sizeMm`);
  const paddingMm = asNonNegativeFinite(box.paddingMm, `${path}.box.paddingMm`);
  const maxWidthMm = sizeMm[0] - 2 * paddingMm;
  const maxHeightMm = sizeMm[1] - 2 * paddingMm;
  if (maxWidthMm <= 0 || maxHeightMm <= 0) {
    fail(`${path}.box padding leaves no positive text box`);
  }
  const topLeft = resolveSheet2d(annotation.coordinateSpace, annotation.position, annotation.anchor, context, `${path}.position`);
  const ascentMm = pointsToMm(context.font.ascentRatio * fontSizePt);
  return {
    kind: 'text',
    text,
    originMm: [topLeft[0] + paddingMm, topLeft[1] + paddingMm + ascentMm],
    fontSizePt,
    color,
    maxWidthMm,
    maxHeightMm,
    placement: 'above-medical',
  };
}

function mapRoi(
  annotation: Extract<FigureAnnotation, { kind: 'circle' | 'ellipse' | 'rectangle' }>,
  index: number,
  context: MappingContext,
): PublicationVectorLayer {
  const path = `annotations[${index}]`;
  const geometry = asRecord(annotation.geometry, `${path}.geometry`);
  const space = geometry.coordinateSpace;
  if (typeof space !== 'string') {
    fail(`${path}.geometry.coordinateSpace must be a string`);
  }
  if (space === 'patient') {
    fail(`${path} patient-anchored ROI shapes are not supported: the ROI plane orientation is not ratified (ADR-016 OD-7g residual)`);
  }
  const style = linearStyle(annotation, path);

  if (annotation.kind === 'circle' || annotation.kind === 'ellipse') {
    const center = resolveSheet2d(space, geometry.center, annotation.anchor, context, `${path}.geometry.center`);
    const radiiMm =
      annotation.kind === 'circle'
        ? ((): readonly [number, number] => {
            const radius = asPositiveField(geometry.radiusMm, `${path}.geometry.radiusMm`);
            return [radius, radius];
          })()
        : asPositivePairField(geometry.radiiMm, `${path}.geometry.radiiMm`);
    const rotationDeg = annotation.kind === 'circle' ? 0 : asRotationDeg(geometry.rotationDeg, `${path}.geometry.rotationDeg`);
    return { kind: 'ellipse', centerMm: center, radiiMm, rotationDeg, ...style, placement: 'above-medical' };
  }

  const origin = resolveSheet2d(space, geometry.origin, annotation.anchor, context, `${path}.geometry.origin`);
  const sizeMm = asPositivePairField(geometry.sizeMm, `${path}.geometry.sizeMm`);
  const rotationDeg = asRotationDeg(geometry.rotationDeg, `${path}.geometry.rotationDeg`);
  return { kind: 'polygon', pointsMm: rectanglePolygonMm(origin, sizeMm, rotationDeg), ...style, placement: 'above-medical' };
}

/** Maps one annotation kind; undefined means "emit nothing" (hidden patient). */
export function mapAnnotation(
  annotation: FigureAnnotation,
  index: number,
  context: MappingContext,
): PublicationVectorLayer | undefined {
  switch (annotation.kind) {
    case 'line':
    case 'arrow':
      return mapLine(annotation, index, context);
    case 'text':
    case 'panel-letter':
      return mapText(annotation, index, context);
    case 'circle':
    case 'ellipse':
    case 'rectangle':
      return mapRoi(annotation, index, context);
    case 'scale-bar':
      fail(`annotations[${index}] scale-bar is not supported: tick/label geometry is unratified (ADR-016 OD-7h)`);
      return undefined;
    case 'measurement':
      fail(`annotations[${index}] measurement is not supported: tick/number geometry is unratified (ADR-016 OD-7h)`);
      return undefined;
    default:
      fail(`annotations[${index}] kind '${String((annotation as { kind?: unknown }).kind)}' is not supported`);
      return undefined;
  }
}
