/**
 * NuClear P3.4-B.2.1 — pure `MedicalViewState` → Cornerstone application plan.
 *
 * Fusion composition, projection mapping and the per-asset PET binding map
 * (P3.4-B.2.1.1). Split from the original suite without changing test names,
 * assertions or semantics.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CT_VOLUME_IDS,
  FUSION_VOLUME_IDS,
  FIRST_BINDING_ONLY,
  NO_BINDINGS,
  PET_BINDINGS,
  PET_VOLUME_IDS,
  SECOND_BINDING_ONLY,
  SECOND_SUV_FACTOR,
  SUV_FACTOR,
  TOLERANCE,
  TWO_PET_BINDINGS,
  TWO_PET_VOLUME_IDS,
  VIEW_APPLICATION_ERROR_CODES,
  compileMedicalViewApplication,
  expectCode,
  getFusionOpacity,
  getPETOpacityMapping,
  mockCtAsset,
  mockFusionView,
  mockMedicalView,
  mockPetAsset,
  mockPetView,
  secondPetAsset,
  suvRangeToBqml,
  twoPetFusionState,
} from './fixtures/view-application-fixtures.ts';
import type { FusionState } from './fixtures/view-application-fixtures.ts';
import type { FusionOverlayLayer, MedicalViewState } from '../../packages/shared-types/src/index.js';

describe('NuClear P3.4-B.2.1 — fusion application (ADR-006)', () => {
  it('6. a fusion view applies a CT base and a PET overlay whose opacity is getFusionOpacity(50) and whose mapping is getPETOpacityMapping', () => {
    const plan = compileMedicalViewApplication({
      state: mockFusionView,
      volumeIds: FUSION_VOLUME_IDS,
      petBindings: PET_BINDINGS,
    });
    assert.equal(plan.layers.length, 2);
    const [base, overlay] = plan.layers;

    assert.equal(base.assetId, mockCtAsset.id);
    assert.equal(base.role, 'base');
    assert.deepEqual(base.properties.voiRange, { lower: -160, upper: 240 });
    assert.deepEqual(base.properties.colormap, { name: 'Grayscale', opacity: 1 });
    assert.equal(base.properties.invert, false);
    assert.equal(base.properties.interpolationType, 'linear');

    const expectedRange = suvRangeToBqml([0, 8], SUV_FACTOR);
    assert.equal(overlay.assetId, mockPetAsset.id);
    assert.equal(overlay.role, 'overlay');
    assert.deepEqual(overlay.properties.voiRange, {
      lower: expectedRange[0],
      upper: expectedRange[1],
    });
    assert.equal(overlay.properties.colormap.name, 'PET');
    assert.ok(
      Math.abs(overlay.properties.colormap.opacity - getFusionOpacity(50)) <= TOLERANCE,
    );
    assert.ok(
      Math.abs(overlay.properties.colormap.opacity - 0.5 ** 0.42) <= TOLERANCE,
    );
    assert.deepEqual(
      overlay.properties.colormap.opacityMapping,
      getPETOpacityMapping(expectedRange[0], expectedRange[1], 0, 1, 'highlighted'),
    );
  });

  it('7. a fusion PET overlay without an ADR-005 binding refuses with VIEW_PET_BINDING_REQUIRED', () => {
    expectCode(
      () =>
        compileMedicalViewApplication({
          state: mockFusionView,
          volumeIds: FUSION_VOLUME_IDS,
          petBindings: NO_BINDINGS,
        }),
      VIEW_APPLICATION_ERROR_CODES.petBindingRequired,
    );
  });

  it('8. a PET layer declaring both voi and suvRange, or neither, refuses with VIEW_STATE_INVALID', () => {
    const [baseLayer, overlayLayer] = (mockFusionView as FusionState).composition.layers;
    const withPresentation = (presentation: FusionOverlayLayer['presentation']): MedicalViewState => ({
      ...(mockFusionView as FusionState),
      composition: {
        mode: 'fusion',
        blend: 'alpha',
        layers: [baseLayer, { ...overlayLayer, presentation }],
      },
    });
    for (const presentation of [
      { ...overlayLayer.presentation, voi: [0, 8] as const },
      { ...overlayLayer.presentation, suvRange: undefined },
    ]) {
      expectCode(
        () =>
          compileMedicalViewApplication({
            state: withPresentation(presentation),
            volumeIds: FUSION_VOLUME_IDS,
            petBindings: PET_BINDINGS,
          }),
        VIEW_APPLICATION_ERROR_CODES.stateInvalid,
      );
    }
  });
});

describe('NuClear P3.4-B.2.1 — projection mapping', () => {
  it('9. MIP, MinIP and Average map to their blend mode and preserve the slab', () => {
    const expectations = [
      ['MIP', 'MAXIMUM_INTENSITY_BLEND'],
      ['MinIP', 'MINIMUM_INTENSITY_BLEND'],
      ['Average', 'AVERAGE_INTENSITY_BLEND'],
    ] as const;
    for (const [mode, blendMode] of expectations) {
      const state = { ...mockMedicalView, projection: { mode, slabThicknessMm: 12 } };
      const plan = compileMedicalViewApplication({ state, volumeIds: CT_VOLUME_IDS, petBindings: NO_BINDINGS });
      assert.equal(plan.projection.mode, mode);
      assert.equal(plan.projection.blendMode, blendMode);
      assert.equal(plan.projection.slabThicknessMm, 12);
    }
  });

  it('10. a non-slice projection without a finite positive slab refuses with VIEW_PROJECTION_INVALID', () => {
    for (const slabThicknessMm of [
      undefined,
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const state = { ...mockMedicalView, projection: { mode: 'MIP' as const, slabThicknessMm } };
      expectCode(
        () => compileMedicalViewApplication({ state, volumeIds: CT_VOLUME_IDS, petBindings: NO_BINDINGS }),
        VIEW_APPLICATION_ERROR_CODES.projectionInvalid,
      );
    }
  });
});

describe('NuClear P3.4-B.2.1 — per-asset PET binding map', () => {
  it('14. a two-PET fusion applies each overlay its own suvFactor, colormap opacity and opacity mapping', () => {
    const plan = compileMedicalViewApplication({
      state: twoPetFusionState,
      volumeIds: TWO_PET_VOLUME_IDS,
      petBindings: TWO_PET_BINDINGS,
    });
    assert.equal(plan.layers.length, 3);
    const [base, first, second] = plan.layers;

    assert.equal(base.assetId, mockCtAsset.id);
    assert.deepEqual(base.properties.voiRange, { lower: -160, upper: 240 });

    const firstRange = suvRangeToBqml([0, 8], SUV_FACTOR);
    const secondRange = suvRangeToBqml([0, 8], SECOND_SUV_FACTOR);
    assert.equal(first.assetId, mockPetAsset.id);
    assert.equal(second.assetId, secondPetAsset.id);
    assert.deepEqual(first.properties.voiRange, {
      lower: firstRange[0],
      upper: firstRange[1],
    });
    assert.deepEqual(second.properties.voiRange, {
      lower: secondRange[0],
      upper: secondRange[1],
    });
    assert.ok(
      Math.abs(second.properties.voiRange.upper - 2 * first.properties.voiRange.upper) <=
        TOLERANCE,
      `expected the second upper bound to be twice the first, got ${second.properties.voiRange.upper} vs ${first.properties.voiRange.upper}`,
    );
    assert.notEqual(
      first.properties.voiRange.upper,
      second.properties.voiRange.upper,
      'the two overlays must not share one suvFactor',
    );

    assert.equal(first.properties.colormap.name, 'PET');
    assert.equal(second.properties.colormap.name, 'PET');
    assert.ok(
      Math.abs(first.properties.colormap.opacity - getFusionOpacity(50)) <= TOLERANCE,
    );
    assert.ok(
      Math.abs(second.properties.colormap.opacity - getFusionOpacity(80)) <= TOLERANCE,
    );
    assert.notEqual(
      first.properties.colormap.opacity,
      second.properties.colormap.opacity,
      'opacity must be computed per overlay',
    );

    assert.deepEqual(
      first.properties.colormap.opacityMapping,
      getPETOpacityMapping(firstRange[0], firstRange[1], 0, 1, 'highlighted'),
    );
    assert.deepEqual(
      second.properties.colormap.opacityMapping,
      getPETOpacityMapping(secondRange[0], secondRange[1], 0, 0.5, 'alpha'),
    );
  });

  it('15. a two-PET fusion whose map is missing only the second overlay refuses VIEW_PET_BINDING_REQUIRED naming that asset', () => {
    const error = expectCode(
      () =>
        compileMedicalViewApplication({
          state: twoPetFusionState,
          volumeIds: TWO_PET_VOLUME_IDS,
          petBindings: FIRST_BINDING_ONLY,
        }),
      VIEW_APPLICATION_ERROR_CODES.petBindingRequired,
    );
    assert.ok(
      error.message.includes(secondPetAsset.id),
      `expected the refusal to name '${secondPetAsset.id}', got '${error.message}'`,
    );
  });

  it('16. a single PET layer whose asset has no entry never falls back to another asset binding', () => {
    const error = expectCode(
      () =>
        compileMedicalViewApplication({
          state: mockPetView,
          volumeIds: PET_VOLUME_IDS,
          petBindings: SECOND_BINDING_ONLY,
        }),
      VIEW_APPLICATION_ERROR_CODES.petBindingRequired,
    );
    assert.ok(
      error.message.includes(mockPetAsset.id),
      `expected the refusal to name '${mockPetAsset.id}', got '${error.message}'`,
    );
    assert.ok(
      !error.message.includes(`'${secondPetAsset.id}'`),
      `the refusal must not name the unrelated asset '${secondPetAsset.id}'`,
    );
  });
});
