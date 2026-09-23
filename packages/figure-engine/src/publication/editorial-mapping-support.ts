/**
 * @nuclear/figure-engine — support helpers for the ADR-016 editorial mapping
 * (P5.7 follow-up c). Internal module: not re-exported from the package barrel.
 *
 * Pure and Node-safe. Every rejection is a typed `FIGURE_PDF_DOCUMENT_INVALID`
 * (ADR-016 OD-7j), never a bare `TypeError`; no geometry is invented and no
 * unsupported font/style/space is substituted.
 */

import type {
  AssetAvailabilityStatus,
  ComposerPanel,
  FigureAnnotation,
  MedicalViewState,
} from '@nuclear/shared-types';

import { fail, asRecord, asColor, asPositiveFinite, asFinitePair, asPositivePair } from './pdf-validation-primitives.js';

export interface EditorialFontContext {
  /** The single embedded family accepted by the mapping (case-insensitive). */
  readonly family: string;
  /** Ascent as a fraction of the em, from the embedded font's metrics. */
  readonly ascentRatio: number;
}

export interface EditorialPanelResolution {
  readonly panelId: ComposerPanel['id'];
  readonly availability: AssetAvailabilityStatus['state'];
  readonly state: MedicalViewState;
}

/** Generic array reader that refuses non-arrays with the editorial code. */
export function asArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    fail(`${path} must be an array`);
  }
  return value;
}

export function asNonNegativeFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${path} must be a finite number ≥ 0`);
  }
  return value;
}

export function asTriple(value: unknown, path: string): readonly [number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number' ||
    typeof value[2] !== 'number' ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1]) ||
    !Number.isFinite(value[2])
  ) {
    fail(`${path} must be three finite numbers`);
  }
  return [value[0], value[1], value[2]];
}

export function readFontContext(value: unknown): EditorialFontContext {
  const record = asRecord(value, 'font');
  const family = record.family;
  if (typeof family !== 'string' || family.trim().length === 0) {
    fail('font.family must be a non-blank string');
  }
  const ascentRatio = asPositiveFinite(record.ascentRatio, 'font.ascentRatio');
  return Object.freeze({ family, ascentRatio });
}

export function readFigureSheet(value: unknown): {
  panels: readonly ComposerPanel[];
  annotations: readonly FigureAnnotation[];
} {
  const record = asRecord(value, 'figureSheet');
  const panels = asArray(record.panels, 'figureSheet.panels');
  const annotations = asArray(record.annotations, 'figureSheet.annotations');
  return {
    panels: panels as readonly ComposerPanel[],
    annotations: annotations as readonly FigureAnnotation[],
  };
}

/**
 * Structural guard for one panel so `orderPanelsByZ`/the decoration reader never
 * surface a bare `TypeError` on a malformed panel (OD-7j).
 */
export function readPanelStructure(value: unknown, index: number): ComposerPanel {
  const panel = asRecord(value, `figureSheet.panels[${index}]`);
  const id = panel.id;
  if (typeof id !== 'string' || id.length === 0) {
    fail(`figureSheet.panels[${index}].id must be a non-blank string`);
  }
  const layout = asRecord(panel.layout, `panel '${id}'.layout`);
  // Validate the pairs at the mapping boundary so a malformed layout is a typed
  // OD-7j refusal before `panelSheetRectMm` ever destructures it.
  asFinitePair(layout.positionMm, `panel '${id}'.layout.positionMm`);
  asPositivePair(layout.sizeMm, `panel '${id}'.layout.sizeMm`);
  asRecord(panel.decoration, `panel '${id}'.decoration`);
  // `framing` is consumed by the patient projection path; guard it here so a
  // missing framing is a typed refusal, never a downstream `TypeError`.
  asRecord(panel.framing, `panel '${id}'.framing`);
  return panel as unknown as ComposerPanel;
}

/** Refuses embedded line separators: multi-line layout is not ratified (OD-7e). */
export function assertSingleLine(text: string, path: string): void {
  if (/[\n\r\f\u000B\u0085\u2028\u2029]/.test(text)) {
    fail(
      `${path} contains a line separator; multi-line text layout is not ratified (ADR-016 OD-7e), so it is refused rather than using a library default line height`,
    );
  }
}

export function readResolutions(
  value: unknown,
): ReadonlyMap<string, EditorialPanelResolution> {
  const resolutions = new Map<string, EditorialPanelResolution>();
  if (value === undefined) {
    return resolutions;
  }
  for (const [index, item] of asArray(value, 'resolutions').entries()) {
    const record = asRecord(item, `resolutions[${index}]`);
    const panelId = record.panelId;
    if (typeof panelId !== 'string' || panelId.length === 0) {
      fail(`resolutions[${index}].panelId must be a non-blank string`);
    }
    const state = record.state;
    if (state === undefined || typeof state !== 'object' || state === null) {
      fail(`resolutions[${index}].state must be a resolved MedicalViewState`);
    }
    const availability = record.availability;
    if (typeof availability !== 'string') {
      fail(`resolutions[${index}].availability must be an AssetAvailabilityStatus state`);
    }
    resolutions.set(panelId, Object.freeze({
      panelId: panelId as EditorialPanelResolution['panelId'],
      availability: availability as AssetAvailabilityStatus['state'],
      state: state as MedicalViewState,
    }));
  }
  return resolutions;
}

/** Refuses any family other than the single embedded one (ADR-016 OD-7d/7e). */
export function assertSupportedFont(family: unknown, font: EditorialFontContext, path: string): void {
  if (
    typeof family !== 'string' ||
    family.trim().toLowerCase() !== font.family.trim().toLowerCase()
  ) {
    fail(
      `${path} fontFamily '${String(family)}' is not the embedded '${font.family}' (ADR-016 OD-7d/OD-7e); a second face is not vendored, so it is refused rather than substituted`,
    );
  }
}

/** Panel-content mappings require an unrotated panel so boxes/radii stay axis-aligned. */
export function assertPanelUnrotated(layout: { readonly rotationDeg?: unknown }, path: string): void {
  if (layout.rotationDeg !== 0) {
    fail(
      `${path} requires panel rotationDeg === 0; a rotated panel-content mapping is not ratified (ADR-014 OD-2)`,
    );
  }
}

export function asColorField(value: unknown, path: string): string {
  return asColor(value, path);
}

/** Shared fill/stroke resolution for line and ROI annotations (OD-7f/OD-7g). */
export function linearStyle(annotation: FigureAnnotation, path: string): {
  fillColor?: string;
  strokeColor?: string;
  strokeWidthMm?: number;
} {
  const fillColor = annotation.fillColor === undefined ? undefined : asColor(annotation.fillColor, `${path}.fillColor`);
  const strokeColor = annotation.strokeColor === undefined ? undefined : asColor(annotation.strokeColor, `${path}.strokeColor`);
  if (fillColor === undefined && strokeColor === undefined) {
    fail(`${path} requires fillColor or strokeColor`);
  }
  const strokeWidthMm = annotation.strokeWidthMm === undefined ? undefined : asPositiveFinite(annotation.strokeWidthMm, `${path}.strokeWidthMm`);
  if (strokeColor !== undefined && strokeWidthMm === undefined) {
    fail(`${path}.strokeWidthMm is required when strokeColor is set`);
  }
  return {
    ...(fillColor === undefined ? {} : { fillColor }),
    ...(strokeColor === undefined ? {} : { strokeColor }),
    ...(strokeWidthMm === undefined ? {} : { strokeWidthMm }),
  };
}

export function asPositiveField(value: unknown, path: string): number {
  return asPositiveFinite(value, path);
}

export function asPairField(value: unknown, path: string): readonly [number, number] {
  return asFinitePair(value, path);
}

export function asPositivePairField(value: unknown, path: string): readonly [number, number] {
  return asPositivePair(value, path);
}

/** Four convex corners of a rotated rectangle (OD-7g: clockwise y-down about the centre). */
export function rectanglePolygonMm(
  originMm: readonly [number, number],
  sizeMm: readonly [number, number],
  rotationDeg: number,
): readonly (readonly [number, number])[] {
  const centerX = originMm[0] + sizeMm[0] / 2;
  const centerY = originMm[1] + sizeMm[1] / 2;
  const theta = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const local: readonly (readonly [number, number])[] = [
    [-sizeMm[0] / 2, -sizeMm[1] / 2],
    [sizeMm[0] / 2, -sizeMm[1] / 2],
    [sizeMm[0] / 2, sizeMm[1] / 2],
    [-sizeMm[0] / 2, sizeMm[1] / 2],
  ];
  return local.map(([lx, ly]) => [centerX + lx * cos - ly * sin, centerY + lx * sin + ly * cos]);
}
