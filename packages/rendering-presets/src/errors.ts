/**
 * @nuclear/rendering-presets — typed, fail-closed preset refusals.
 *
 * Presets are declarative and never silently clinical: a violated guard must
 * surface a named code instead of producing a plausible-looking curve.
 */

export const PRESET_ERROR_CODES = {
  invalidSlider: 'PRESET_INVALID_SLIDER',
  invalidRange: 'PRESET_INVALID_RANGE',
  invalidGamma: 'PRESET_INVALID_GAMMA',
  invalidMode: 'PRESET_INVALID_MODE',
  invalidMinOpacity: 'PRESET_INVALID_MIN_OPACITY',
  invalidPreset: 'PRESET_INVALID_PRESET',
} as const;

export type PresetErrorCode =
  (typeof PRESET_ERROR_CODES)[keyof typeof PRESET_ERROR_CODES];

export class PresetError extends Error {
  readonly code: PresetErrorCode;

  constructor(code: PresetErrorCode, message: string) {
    super(message);
    this.name = 'PresetError';
    this.code = code;
  }
}
