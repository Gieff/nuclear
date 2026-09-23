/**
 * @nuclear/figure-engine — OD-2 Panel Content Space ↔ Figure Sheet Space with
 * rotation about the panel centre, positive clockwise in `y-down` sheet
 * coordinates (ADR-014 OD-2, ratified 2026-09-23).
 *
 * ```text
 * centre = sizeMm / 2
 * R(θ)   = [[cos θ, -sin θ], [sin θ, cos θ]]
 * sheet  = positionMm + R(θ)·(p - centre) + centre
 * ```
 *
 * The origin/sign are ratified, but the current contract cannot distinguish an
 * editorial container from a medical panel: these primitives expose the
 * ratified transform for editorial content, while the **medical**
 * placement/containment path (`layout.ts`, `panelSheetRectMm`) deliberately
 * keeps refusing `rotationDeg !== 0`.
 *
 * Pure and Node-safe: no DOM, no WebGL, no Cornerstone.
 */

import type { PanelContentPointMm, PanelLayoutState, SheetPointMm } from '@nuclear/shared-types';

import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import { isPositiveFinite, refuse } from './guards.js';

function isFinitePair(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  );
}

function assertLayoutTransformInputs(layout: PanelLayoutState): void {
  if (!isFinitePair(layout.positionMm)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.layoutInvalid,
      `panel position [${String(layout.positionMm?.[0])}, ${String(layout.positionMm?.[1])}] mm must be a pair of finite values`,
    );
  }
  const size = layout.sizeMm;
  if (!Array.isArray(size) || size.length !== 2 || !isPositiveFinite(size[0]) || !isPositiveFinite(size[1])) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.layoutInvalid,
      `panel size [${String(size?.[0])}, ${String(size?.[1])}] mm must be a pair of finite positive values`,
    );
  }
  if (typeof layout.rotationDeg !== 'number' || !Number.isFinite(layout.rotationDeg)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.layoutInvalid,
      `panel rotationDeg ${String(layout.rotationDeg)} must be finite`,
    );
  }
}

function assertFinitePoint(point: readonly [number, number], label: string): void {
  if (!isFinitePair(point)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.layoutInvalid,
      `${label} must be a pair of finite millimetre values`,
    );
  }
}

/** Panel-local centre `sizeMm / 2`, in millimetres (the OD-2 rotation origin). */
export function panelLocalCenterMm(layout: PanelLayoutState): readonly [number, number] {
  assertLayoutTransformInputs(layout);
  return [layout.sizeMm[0] / 2, layout.sizeMm[1] / 2];
}

/**
 * Panel Content Space -> Figure Sheet Space (ADR-014 OD-2). This is the
 * ratified pure primitive and accepts any finite `rotationDeg`; it does not by
 * itself authorize a rotated **medical** panel (see the module header).
 */
export function panelContentToSheet(
  layout: PanelLayoutState,
  point: PanelContentPointMm,
): SheetPointMm {
  assertLayoutTransformInputs(layout);
  assertFinitePoint(point, 'panel content point');

  const theta = (layout.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const [centerX, centerY] = panelLocalCenterMm(layout);
  const dx = point[0] - centerX;
  const dy = point[1] - centerY;

  return [
    layout.positionMm[0] + centerX + dx * cos - dy * sin,
    layout.positionMm[1] + centerY + dx * sin + dy * cos,
  ];
}

/** Inverse of {@link panelContentToSheet}: Figure Sheet Space -> Panel Content Space (mm). */
export function sheetToPanelContent(
  layout: PanelLayoutState,
  point: SheetPointMm,
): PanelContentPointMm {
  assertLayoutTransformInputs(layout);
  assertFinitePoint(point, 'sheet point');

  const theta = (layout.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const [centerX, centerY] = panelLocalCenterMm(layout);
  const dx = point[0] - layout.positionMm[0] - centerX;
  const dy = point[1] - layout.positionMm[1] - centerY;

  // Inverse rotation R(-θ): [[cos, sin], [-sin, cos]].
  return [centerX + dx * cos + dy * sin, centerY - dx * sin + dy * cos];
}
