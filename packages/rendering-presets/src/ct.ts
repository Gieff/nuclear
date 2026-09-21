/**
 * @nuclear/rendering-presets — CT base-volume window presets (spec §5).
 *
 * Only the ratified Soft Tissue preset (W400 / L40) is declared. No other
 * clinical window is inferred or defaulted: callers declare their own
 * `CtWindowPreset`.
 */

import { PRESET_ERROR_CODES, PresetError } from './errors.js';

export interface CtWindowPreset {
  readonly id: string;
  readonly windowWidth: number;
  readonly windowCenter: number;
}

/** Spec §5 default CT preset: Soft Tissue, Window 400 / Level 40. */
export const CT_PRESET_SOFT_TISSUE = {
  id: 'ct-soft-tissue',
  windowWidth: 400,
  windowCenter: 40,
} as const satisfies CtWindowPreset;

/**
 * Computes the VOI range `[center - width / 2, center + width / 2]` for a
 * declared CT preset. Fails closed on a non-finite center or a non-finite /
 * non-positive window width.
 */
export function ctVoiRange(preset: CtWindowPreset): readonly [number, number] {
  const width = preset.windowWidth;
  const center = preset.windowCenter;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(center)) {
    throw new PresetError(
      PRESET_ERROR_CODES.invalidPreset,
      `CT preset '${preset.id}' must declare a finite center and a finite positive window width, received width=${String(width)}, center=${String(center)}`,
    );
  }
  return [center - width / 2, center + width / 2];
}
