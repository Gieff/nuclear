/**
 * @nuclear/figure-engine — `PanelFramingState` arithmetic (P5.3, ADR-014 OD-1
 * ratified 2026-09-23, variant A refined).
 *
 * Maps normalized Viewport Space to Panel Content Space in physical millimetres
 * and back. The ratified mapping is:
 *
 * ```text
 * u = (x - left) / (right - left)
 * v = (y - top) / (bottom - top)
 * scaledSize   = contentSizeMm × contentScale
 * panelContent = alignmentOffset(aperture, scaledSize) + contentOffsetMm + (u, v) × scaledSize
 * ```
 *
 * with `0 ≤ left < right ≤ 1` and `0 ≤ top < bottom ≤ 1`. `overflow` is a clip
 * policy applied by the compositor and is deliberately **not** part of the
 * affine map. Every non-finite/non-physical input is a typed
 * `FIGURE_FRAMING_INVALID` refusal; nothing is clamped or defaulted.
 *
 * Pure and Node-safe: no DOM, no WebGL, no Cornerstone.
 */

import type {
  NormalizedViewportCrop,
  PanelContentPointMm,
  PanelFramingState,
} from '@nuclear/shared-types';

import {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  type FigurePublicationErrorCode,
} from './errors.js';

/** A point in normalized viewport coordinates (usually within [0, 1]). */
export type NormalizedViewportPoint = readonly [number, number];
/** The scaled content footprint inside the aperture, in millimetres. */
export type ScaledContentSizeMm = readonly [number, number];

const ALIGNMENTS: readonly PanelFramingState['alignment'][] = [
  'center',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

function refuse(code: FigurePublicationErrorCode, message: string): never {
  throw new FigurePublicationError(code, message);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isFinitePair(value: unknown): value is readonly [number, number] {
  return Array.isArray(value) && value.length === 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1]);
}

function assertCrop(crop: NormalizedViewportCrop): void {
  if (!Array.isArray(crop) || crop.length !== 4 || !crop.every(isFiniteNumber)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.framingInvalid,
      'PanelFramingState.viewportCrop must be four finite numbers [left, top, right, bottom]',
    );
  }
  const [left, top, right, bottom] = crop;
  if (!(left >= 0 && right <= 1 && top >= 0 && bottom <= 1 && left < right && top < bottom)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.framingInvalid,
      `PanelFramingState.viewportCrop [${left}, ${top}, ${right}, ${bottom}] must satisfy 0 ≤ left < right ≤ 1 and 0 ≤ top < bottom ≤ 1`,
    );
  }
}

/**
 * Validates the framing fields used by the transform. Refuses
 * `FIGURE_FRAMING_INVALID` for a malformed crop, non-positive aperture or
 * scale, non-finite offset, unknown alignment or unknown overflow policy.
 */
export function assertPanelFraming(framing: PanelFramingState): void {
  assertCrop(framing.viewportCrop);
  if (!isFinitePair(framing.contentSizeMm) || !isPositiveFinite(framing.contentSizeMm[0]) || !isPositiveFinite(framing.contentSizeMm[1])) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.framingInvalid,
      'PanelFramingState.contentSizeMm must be a pair of finite positive millimetre values',
    );
  }
  if (!isPositiveFinite(framing.contentScale)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.framingInvalid,
      `PanelFramingState.contentScale ${String(framing.contentScale)} must be finite and strictly positive`,
    );
  }
  if (!isFinitePair(framing.contentOffsetMm)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.framingInvalid,
      'PanelFramingState.contentOffsetMm must be a pair of finite millimetre values',
    );
  }
  if (!ALIGNMENTS.includes(framing.alignment)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.framingInvalid,
      `PanelFramingState.alignment '${String(framing.alignment)}' is not one of ${ALIGNMENTS.join(', ')}`,
    );
  }
  if (framing.overflow !== 'clip' && framing.overflow !== 'visible') {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.framingInvalid,
      `PanelFramingState.overflow '${String(framing.overflow)}' must be 'clip' or 'visible'`,
    );
  }
}

/** The scaled content footprint `contentSizeMm × contentScale`, in millimetres. */
export function scaledContentSizeMm(framing: PanelFramingState): ScaledContentSizeMm {
  assertPanelFraming(framing);
  return [
    framing.contentSizeMm[0] * framing.contentScale,
    framing.contentSizeMm[1] * framing.contentScale,
  ];
}

/**
 * The ratified alignment offset of the scaled content inside the content
 * aperture, in millimetres (ADR-014 OD-1): `top-left [0,0]`,
 * `top-right [w−sw,0]`, `bottom-left [0,h−sh]`,
 * `bottom-right [w−sw,h−sh]`, `center [(w−sw)/2,(h−sh)/2]`, where `w,h` is the
 * aperture (`contentSizeMm`) and `sw,sh` the scaled size.
 */
export function alignmentOffsetMm(framing: PanelFramingState): PanelContentPointMm {
  assertPanelFraming(framing);
  const [apertureW, apertureH] = framing.contentSizeMm;
  const [scaledW, scaledH] = scaledContentSizeMm(framing);
  const residualW = apertureW - scaledW;
  const residualH = apertureH - scaledH;
  switch (framing.alignment) {
    case 'top-left':
      return [0, 0];
    case 'top-right':
      return [residualW, 0];
    case 'bottom-left':
      return [0, residualH];
    case 'bottom-right':
      return [residualW, residualH];
    case 'center':
      return [residualW / 2, residualH / 2];
  }
}

function assertViewportPoint(point: NormalizedViewportPoint): void {
  if (!isFinitePair(point)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.framingInvalid,
      'viewport point must be a pair of finite numbers',
    );
  }
}

function assertPanelPoint(point: PanelContentPointMm): void {
  if (!isFinitePair(point)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.framingInvalid,
      'panel content point must be a pair of finite millimetre values',
    );
  }
}

/**
 * Normalized Viewport Space -> Panel Content Space (mm), per ADR-014 OD-1.
 * Points outside the crop are mapped outside `[0, scaledSize]` (the compositor
 * applies the `overflow` clip policy); the map itself is not clamped.
 */
export function viewportToPanelContent(
  framing: PanelFramingState,
  point: NormalizedViewportPoint,
): PanelContentPointMm {
  assertPanelFraming(framing);
  assertViewportPoint(point);

  const [left, top, right, bottom] = framing.viewportCrop;
  const u = (point[0] - left) / (right - left);
  const v = (point[1] - top) / (bottom - top);
  const [scaledW, scaledH] = scaledContentSizeMm(framing);
  const [offsetX, offsetY] = alignmentOffsetMm(framing);

  return [
    offsetX + framing.contentOffsetMm[0] + u * scaledW,
    offsetY + framing.contentOffsetMm[1] + v * scaledH,
  ];
}

/** Inverse of {@link viewportToPanelContent}: Panel Content Space (mm) -> normalized Viewport Space. */
export function panelContentToViewport(
  framing: PanelFramingState,
  point: PanelContentPointMm,
): NormalizedViewportPoint {
  assertPanelFraming(framing);
  assertPanelPoint(point);

  const [left, top, right, bottom] = framing.viewportCrop;
  const [scaledW, scaledH] = scaledContentSizeMm(framing);
  const [offsetX, offsetY] = alignmentOffsetMm(framing);
  const u = (point[0] - offsetX - framing.contentOffsetMm[0]) / scaledW;
  const v = (point[1] - offsetY - framing.contentOffsetMm[1]) / scaledH;

  return [left + u * (right - left), top + v * (bottom - top)];
}
