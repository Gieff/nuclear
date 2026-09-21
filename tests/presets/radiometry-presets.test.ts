/**
 * NuClear P3.4-A — declarative PET/CT radiometry presets.
 *
 * Pure Node: no DOM, no WebGL, no Cornerstone. Exercises the spec §2–§5
 * formulas, the piecewise control points, the clamp/floor behaviour and every
 * fail-closed guard with typed `PresetError` codes.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  CANONICAL_PET_FUSION_EXPONENT,
  CT_PRESET_SOFT_TISSUE,
  PET_TRANSFER_MODES,
  PRESET_ERROR_CODES,
  PresetError,
  ctVoiRange,
  getFusionOpacity,
  getPETOpacityMapping,
} = await import('../../packages/rendering-presets/src/index.ts');

/** Named tolerance for the canonical power/mid-point curves. */
const TOLERANCE = 1e-12;

function expectPresetCode(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof PresetError, `expected PresetError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    return true;
  });
}

describe('NuClear P3.4-A — fusion opacity curve (spec §2)', () => {
  it('1. exponent is the canonical 0.42 and endpoint slider values map to 0 and 1', () => {
    assert.equal(CANONICAL_PET_FUSION_EXPONENT, 0.42);
    assert.equal(getFusionOpacity(0), 0);
    assert.equal(getFusionOpacity(100), 1);
  });

  it('2. slider 50 maps to 0.5^0.42 within 1e-12', () => {
    assert.ok(Math.abs(getFusionOpacity(50) - Math.pow(0.5, 0.42)) <= TOLERANCE);
  });

  it('3. opacity is monotonically non-decreasing across the slider domain', () => {
    let previous = -1;
    for (let slider = 0; slider <= 100; slider += 5) {
      const current = getFusionOpacity(slider);
      assert.ok(current >= previous, `expected monotonicity at slider ${slider}`);
      previous = current;
    }
  });

  it('4. rejects -1, 101 and NaN with PRESET_INVALID_SLIDER', () => {
    for (const slider of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectPresetCode(() => getFusionOpacity(slider), PRESET_ERROR_CODES.invalidSlider);
    }
  });
});

describe('NuClear P3.4-A — PET opacity mapping (spec §3)', () => {
  it('5. highlighted mode emits the exact spec control points', () => {
    const mapping = getPETOpacityMapping(0, 8, 0, 1, 'highlighted');
    assert.deepEqual(mapping, [
      { value: 0, opacity: 0 },
      { value: 0.64, opacity: 0 },
      { value: 2, opacity: 0.6 },
      { value: 8, opacity: 1 },
    ]);
  });

  it('6. alpha mode emits the exact spec control points', () => {
    const mapping = getPETOpacityMapping(0, 8, 0, 1, 'alpha');
    assert.equal(mapping.length, 4);
    assert.deepEqual(mapping[0], { value: 0, opacity: 0 });
    assert.ok(Math.abs(mapping[1].value - 0.12) <= TOLERANCE);
    assert.ok(Math.abs(mapping[1].opacity - 0.45 * Math.pow(0.5, 1)) <= TOLERANCE);
    assert.ok(Math.abs(mapping[2].value - 4) <= TOLERANCE);
    assert.ok(Math.abs(mapping[2].opacity - Math.pow(0.5, 1)) <= TOLERANCE);
    assert.deepEqual(mapping[3], { value: 8, opacity: 1 });
  });

  it('7. segments are monotonic in value with non-decreasing opacity', () => {
    for (const mode of PET_TRANSFER_MODES) {
      const mapping = getPETOpacityMapping(1, 11, 0, 1, mode);
      for (let index = 0; index < mapping.length; index += 1) {
        if (index > 0) {
          assert.ok(mapping[index].value > mapping[index - 1].value, `${mode} value order`);
          assert.ok(mapping[index].opacity >= mapping[index - 1].opacity, `${mode} opacity order`);
        }
      }
    }
  });

  it('8. gamma=2 lowers the alpha mid/step opacities to 0.5^2 and 0.45*0.5^2', () => {
    const mapping = getPETOpacityMapping(0, 8, 0, 2, 'alpha');
    assert.ok(Math.abs(mapping[1].opacity - 0.45 * Math.pow(0.5, 2)) <= TOLERANCE);
    assert.ok(Math.abs(mapping[2].opacity - Math.pow(0.5, 2)) <= TOLERANCE);
  });

  it('9. every output opacity is clamped to [0, 1]', () => {
    for (const mode of PET_TRANSFER_MODES) {
      for (const gamma of [0.5, 1, 2, 10]) {
        const mapping = getPETOpacityMapping(0, 8, 0, gamma, mode);
        for (const point of mapping) {
          assert.ok(point.opacity >= 0 && point.opacity <= 1, `${mode}/${gamma} opacity range`);
        }
      }
    }
  });

  it('10. minOpacity floors every control point', () => {
    const mapping = getPETOpacityMapping(0, 8, 0.5, 1, 'highlighted');
    for (const point of mapping) {
      assert.ok(point.opacity >= 0.5, 'minOpacity must floor every opacity');
    }
    assert.equal(mapping[0].opacity, 0.5, 'the zero baseline is floored by minOpacity');
  });

  it('11. rejects upper<=lower, NaN, gamma<=0, unknown mode and minOpacity outside [0,1]', () => {
    expectPresetCode(
      () => getPETOpacityMapping(5, 5, 0, 1, 'highlighted'),
      PRESET_ERROR_CODES.invalidRange,
    );
    expectPresetCode(
      () => getPETOpacityMapping(0, Number.NaN, 0, 1, 'highlighted'),
      PRESET_ERROR_CODES.invalidRange,
    );
    expectPresetCode(
      () => getPETOpacityMapping(Number.NaN, 8, 0, 1, 'highlighted'),
      PRESET_ERROR_CODES.invalidRange,
    );
    expectPresetCode(
      () => getPETOpacityMapping(0, 8, Number.NaN, 1, 'highlighted'),
      PRESET_ERROR_CODES.invalidMinOpacity,
    );
    expectPresetCode(
      () => getPETOpacityMapping(0, 8, 0, 0, 'highlighted'),
      PRESET_ERROR_CODES.invalidGamma,
    );
    expectPresetCode(
      () => getPETOpacityMapping(0, 8, 0, Number.NaN, 'highlighted'),
      PRESET_ERROR_CODES.invalidGamma,
    );
    expectPresetCode(
      // The type forbids it; the runtime guard must still fail closed.
      () => getPETOpacityMapping(0, 8, 0, 1, 'rainbow' as never),
      PRESET_ERROR_CODES.invalidMode,
    );
    expectPresetCode(
      () => getPETOpacityMapping(0, 8, -0.1, 1, 'highlighted'),
      PRESET_ERROR_CODES.invalidMinOpacity,
    );
    expectPresetCode(
      () => getPETOpacityMapping(0, 8, 1.1, 1, 'highlighted'),
      PRESET_ERROR_CODES.invalidMinOpacity,
    );
  });
});

describe('NuClear P3.4-A — CT Soft Tissue preset (spec §5)', () => {
  it('12. declares id ct-soft-tissue with W400/L40 and a [-160, 240] VOI range', () => {
    assert.equal(CT_PRESET_SOFT_TISSUE.id, 'ct-soft-tissue');
    assert.equal(CT_PRESET_SOFT_TISSUE.windowWidth, 400);
    assert.equal(CT_PRESET_SOFT_TISSUE.windowCenter, 40);
    assert.deepEqual(ctVoiRange(CT_PRESET_SOFT_TISSUE), [-160, 240]);
  });

  it('13. fails closed on a non-positive or non-finite window width', () => {
    expectPresetCode(
      () => ctVoiRange({ id: 'ct-zero', windowWidth: 0, windowCenter: 40 }),
      PRESET_ERROR_CODES.invalidPreset,
    );
    expectPresetCode(
      () => ctVoiRange({ id: 'ct-negative', windowWidth: -400, windowCenter: 40 }),
      PRESET_ERROR_CODES.invalidPreset,
    );
    expectPresetCode(
      () => ctVoiRange({ id: 'ct-nan', windowWidth: Number.NaN, windowCenter: 40 }),
      PRESET_ERROR_CODES.invalidPreset,
    );
    expectPresetCode(
      () => ctVoiRange({ id: 'ct-center-nan', windowWidth: 400, windowCenter: Number.NaN }),
      PRESET_ERROR_CODES.invalidPreset,
    );
  });
});
