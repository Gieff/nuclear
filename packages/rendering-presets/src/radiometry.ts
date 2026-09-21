/**
 * @nuclear/rendering-presets — PET fusion opacity curve and transfer function.
 *
 * Implements PET_CT_FUSION_RADIOMETRY_SPEC.md §2–§4 verbatim. The two
 * transfer modes (`highlighted`, `alpha`) are piecewise-linear, clamped to
 * `[0, 1]` and floored by a caller-declared `minOpacity`. No PET colormap or
 * PET display range is defaulted here: those remain caller-declared inputs.
 */

import { PRESET_ERROR_CODES, PresetError } from './errors.js';

/** Canonical PACS fusion power curve exponent (spec §2). */
export const CANONICAL_PET_FUSION_EXPONENT = 0.42;

/** Supported PET opacity-merge methods (spec §3). */
export const PET_TRANSFER_MODES = ['highlighted', 'alpha'] as const;

export type PetTransferMode = (typeof PET_TRANSFER_MODES)[number];

/**
 * One generic piecewise-linear opacity control point. Field names mirror
 * Cornerstone's `OpacityMapping { value, opacity }` without importing
 * Cornerstone, and the value semantics are declared by the owning preset.
 */
export interface OpacityPoint {
  readonly value: number;
  readonly opacity: number;
}

/** PET opacity control point; retained alias of the generic `OpacityPoint`. */
export type PetOpacityPoint = OpacityPoint;

/** Minimum admissible scalar span for a piecewise opacity mapping. */
export const MIN_OPACITY_SPAN = 1e-3;

/**
 * Maps the interactive blend slider `s ∈ [0, 100]` to the overall PET volume
 * opacity `(s / 100)^0.42`. Fails closed outside the slider domain.
 */
export function getFusionOpacity(sliderPercent: number): number {
  if (
    !Number.isFinite(sliderPercent) ||
    sliderPercent < 0 ||
    sliderPercent > 100
  ) {
    throw new PresetError(
      PRESET_ERROR_CODES.invalidSlider,
      `fusion slider must be a finite number in [0, 100], received ${String(sliderPercent)}; clamp the caller value before requesting an opacity`,
    );
  }
  return Math.pow(sliderPercent / 100, CANONICAL_PET_FUSION_EXPONENT);
}

function isPetTransferMode(mode: string): mode is PetTransferMode {
  return (PET_TRANSFER_MODES as readonly string[]).includes(mode);
}

function clampOpacity(raw: number, minOpacity: number): number {
  const clamped = Math.min(1, Math.max(0, raw));
  return Math.max(minOpacity, clamped);
}

/**
 * Builds the PET opacity mapping for the declared scalar `[lower, upper]`
 * range (already converted to the volume's transport domain).
 *
 * `minOpacity` defaults to `0`; `gamma` defaults to `1.0` and `mode` to
 * `highlighted` per spec §4 / §3 Mode A. Every refusal is a typed
 * `PresetError`; no corrupt or unverified curve is ever returned.
 */
export function getPETOpacityMapping(
  lower: number,
  upper: number,
  minOpacity = 0,
  gamma = 1,
  mode: PetTransferMode = 'highlighted',
): readonly PetOpacityPoint[] {
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || !(upper > lower)) {
    throw new PresetError(
      PRESET_ERROR_CODES.invalidRange,
      `PET opacity range must be finite with upper > lower, received lower=${String(lower)}, upper=${String(upper)}`,
    );
  }
  const span = upper - lower;
  if (span < MIN_OPACITY_SPAN) {
    throw new PresetError(
      PRESET_ERROR_CODES.invalidRange,
      `PET opacity range span ${String(span)} (lower=${String(lower)}, upper=${String(upper)}) is below the minimum ${String(MIN_OPACITY_SPAN)}; a degenerate span is refused, not clamped, because clamping would place control points outside the declared range`,
    );
  }
  if (!Number.isFinite(gamma) || !(gamma > 0)) {
    throw new PresetError(
      PRESET_ERROR_CODES.invalidGamma,
      `PET gamma must be a finite number strictly greater than 0, received ${String(gamma)}`,
    );
  }
  if (
    !Number.isFinite(minOpacity) ||
    minOpacity < 0 ||
    minOpacity > 1
  ) {
    throw new PresetError(
      PRESET_ERROR_CODES.invalidMinOpacity,
      `PET minOpacity must be a finite number in [0, 1], received ${String(minOpacity)}`,
    );
  }
  if (!isPetTransferMode(mode)) {
    throw new PresetError(
      PRESET_ERROR_CODES.invalidMode,
      `unknown PET transfer mode '${String(mode)}'; expected one of ${PET_TRANSFER_MODES.join(', ')}`,
    );
  }

  const midOpacity = Math.pow(0.5, gamma);
  const points: PetOpacityPoint[] =
    mode === 'highlighted'
      ? [
          { value: lower, opacity: 0 },
          { value: lower + 0.08 * span, opacity: 0 },
          { value: lower + 0.25 * span, opacity: Math.max(0.6, midOpacity) },
          { value: upper, opacity: 1 },
        ]
      : [
          { value: lower, opacity: 0 },
          {
            value: lower + 0.015 * span,
            opacity: Math.max(0, 0.45 * midOpacity),
          },
          { value: lower + 0.5 * span, opacity: midOpacity },
          { value: upper, opacity: 1 },
        ];

  return points
    .map((point) => ({
      value: point.value,
      opacity: clampOpacity(point.opacity, minOpacity),
    }))
    .sort((a, b) => a.value - b.value);
}
