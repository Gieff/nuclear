/**
 * @nuclear/medical-engine — pure, Node-safe temporary high-resolution
 * `RenderTarget` dimensioning and fail-closed spec validation (P3.5-A,
 * ADR-009).
 *
 * The physical pixel requirement is derived from the output size in millimetres
 * and the target DPI: `pixels = round(mm / 25.4 * dpi)`. This module owns the
 * formula, the spec/consistent-dimension validation and the plan retargeting;
 * it imports no `@cornerstonejs/core`, touches no DOM and allocates no GPU
 * resource. The browser half (`renderer/temporary-render-target.ts`) consumes
 * exactly these exports.
 *
 * Rounding is half-up and implemented with plain arithmetic so this module
 * performs no floating-point library call (P2.5 integrity gate). Every
 * non-finite, non-positive or non-integer input is a typed refusal; nothing is
 * defaulted, clamped or inferred.
 */

import type { TemporaryRenderTargetSpec } from '@nuclear/shared-types';

import type { ViewApplicationPlan } from './types.js';

export const RENDER_TARGET_ERROR_CODES = {
  specInvalid: 'RENDER_TARGET_SPEC_INVALID',
  dimensionsMismatch: 'RENDER_TARGET_DIMENSIONS_MISMATCH',
  allocationFailed: 'RENDER_TARGET_ALLOCATION_FAILED',
  disposalFailed: 'RENDER_TARGET_DISPOSAL_FAILED',
} as const;

export type RenderTargetErrorCode =
  (typeof RENDER_TARGET_ERROR_CODES)[keyof typeof RENDER_TARGET_ERROR_CODES];

export class RenderTargetError extends Error {
  readonly code: RenderTargetErrorCode;

  constructor(code: RenderTargetErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'RenderTargetError';
    this.code = code;
  }
}

export type RenderTargetPixelDimensions = readonly [number, number];
export type RenderTargetSizeMm = readonly [number, number];

/** Exact millimetres-per-inch constant of the ratified publication formula. */
export const MM_PER_INCH = 25.4;

function refuse(code: RenderTargetErrorCode, message: string, cause?: unknown): never {
  throw new RenderTargetError(code, message, cause);
}

/** True only for a finite, strictly positive number. */
function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** True only for a finite, strictly positive integer pixel count. */
function isPositiveInteger(value: number): boolean {
  return Number.isFinite(value) && value > 0 && Number.isInteger(value);
}

/**
 * Rounds half-up for positive inputs without a floating-point library call.
 * `value - (value % 1)` is the floor for a finite positive value.
 */
function roundHalfUp(value: number): number {
  const base = value - (value % 1);
  return value % 1 >= 0.5 ? base + 1 : base;
}

/**
 * Computes the target pixel dimensions as `round(mm / 25.4 * dpi)` per axis.
 * Refuses `RENDER_TARGET_SPEC_INVALID` when either millimetre value or the DPI
 * is non-finite/non-positive, or when the computed result is not a positive
 * finite integer.
 */
export function computeRenderTargetPixelDimensions(
  sizeMm: RenderTargetSizeMm,
  dpi: number,
): RenderTargetPixelDimensions {
  if (!isPositiveFinite(sizeMm[0]) || !isPositiveFinite(sizeMm[1])) {
    refuse(
      RENDER_TARGET_ERROR_CODES.specInvalid,
      `temporary render target size [${String(sizeMm[0])}, ${String(sizeMm[1])}] mm must be finite and strictly positive; a non-physical size cannot be converted to pixels`,
    );
  }
  if (!isPositiveFinite(dpi)) {
    refuse(
      RENDER_TARGET_ERROR_CODES.specInvalid,
      `temporary render target dpi ${String(dpi)} must be finite and strictly positive; a non-physical density cannot be converted to pixels`,
    );
  }

  const width = roundHalfUp((sizeMm[0] / MM_PER_INCH) * dpi);
  const height = roundHalfUp((sizeMm[1] / MM_PER_INCH) * dpi);
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    refuse(
      RENDER_TARGET_ERROR_CODES.specInvalid,
      `temporary render target computed ${String(width)}x${String(height)} px from ${sizeMm[0]}x${sizeMm[1]} mm at ${dpi} dpi; the result must be a positive finite integer, so the request is refused rather than rounded or clamped`,
    );
  }

  return [width, height];
}

/**
 * Validates a `TemporaryRenderTargetSpec` against the physical size and DPI it
 * claims to describe. Refuses `RENDER_TARGET_SPEC_INVALID` for the wrong kind,
 * non-positive/non-integer pixel dimensions, an invalid DPI, a policy other
 * than `never-resize-live-canvas`, an unknown alpha mode or a blank colour
 * profile; refuses `RENDER_TARGET_DIMENSIONS_MISMATCH` when the declared pixels
 * differ from the dimensions computed for the declared size and DPI.
 */
export function validateTemporaryRenderTargetSpec(
  spec: TemporaryRenderTargetSpec,
  sizeMm: RenderTargetSizeMm,
): void {
  if (spec.kind !== 'temporary-high-resolution') {
    refuse(
      RENDER_TARGET_ERROR_CODES.specInvalid,
      `render target kind '${String(spec.kind)}' is not 'temporary-high-resolution'; only a temporary high-resolution target is dimensioned and rendered here`,
    );
  }

  const dimensions = spec.pixelDimensions;
  if (!isPositiveInteger(dimensions[0]) || !isPositiveInteger(dimensions[1])) {
    refuse(
      RENDER_TARGET_ERROR_CODES.specInvalid,
      `temporary render target pixelDimensions [${String(dimensions[0])}, ${String(dimensions[1])}] must be positive finite integers`,
    );
  }

  if (!isPositiveFinite(spec.dpi)) {
    refuse(
      RENDER_TARGET_ERROR_CODES.specInvalid,
      `temporary render target dpi ${String(spec.dpi)} must be finite and strictly positive`,
    );
  }

  if (spec.liveCanvasPolicy !== 'never-resize-live-canvas') {
    refuse(
      RENDER_TARGET_ERROR_CODES.specInvalid,
      `temporary render target liveCanvasPolicy '${String(spec.liveCanvasPolicy)}' is not 'never-resize-live-canvas'; publication rendering never resizes the live interactive canvas`,
    );
  }

  if (spec.alpha !== 'opaque' && spec.alpha !== 'preserve') {
    refuse(
      RENDER_TARGET_ERROR_CODES.specInvalid,
      `temporary render target alpha '${String(spec.alpha)}' is neither 'opaque' nor 'preserve'`,
    );
  }

  if (typeof spec.colorProfile !== 'string' || spec.colorProfile.trim().length === 0) {
    refuse(
      RENDER_TARGET_ERROR_CODES.specInvalid,
      'temporary render target colorProfile must be a non-blank string; a blank profile cannot be certified',
    );
  }

  const expected = computeRenderTargetPixelDimensions(sizeMm, spec.dpi);
  if (dimensions[0] !== expected[0] || dimensions[1] !== expected[1]) {
    refuse(
      RENDER_TARGET_ERROR_CODES.dimensionsMismatch,
      `temporary render target declares ${dimensions[0]}x${dimensions[1]} px but ${sizeMm[0]}x${sizeMm[1]} mm at ${spec.dpi} dpi computes to ${expected[0]}x${expected[1]} px; the declared pixel dimensions do not describe the declared physical target`,
    );
  }
}

/**
 * Copies a compiled plan verbatim except for `transforms.viewportSizePx`, which
 * is set to the target's computed pixel dimensions: the target is a different
 * physical surface, so the interactive pixel size cannot apply. `patientToViewPlane`
 * and `viewPlaneToViewport` are carried verbatim and never recomputed
 * (ADR-009 decision 3). Refuses `RENDER_TARGET_SPEC_INVALID` for
 * non-positive/non-integer target dimensions.
 */
export function deriveTemporaryRenderTargetPlan(
  plan: ViewApplicationPlan,
  pixelDimensions: RenderTargetPixelDimensions,
): ViewApplicationPlan {
  if (!isPositiveInteger(pixelDimensions[0]) || !isPositiveInteger(pixelDimensions[1])) {
    refuse(
      RENDER_TARGET_ERROR_CODES.specInvalid,
      `temporary render target plan cannot be derived for pixelDimensions [${String(pixelDimensions[0])}, ${String(pixelDimensions[1])}]; target dimensions must be positive finite integers`,
    );
  }

  const viewportSizePx: RenderTargetPixelDimensions = [
    pixelDimensions[0],
    pixelDimensions[1],
  ];

  return {
    ...plan,
    transforms: {
      ...plan.transforms,
      viewportSizePx,
    },
  };
}
