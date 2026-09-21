/**
 * NuClear P3.4-B.2.1 — pure `MedicalViewState` → Cornerstone application plan.
 *
 * Pure Node: no DOM, no WebGL, no Cornerstone. Proves the explicit PET/CT
 * modality decision, the ADR-005 quantitative binding, the ADR-007 `dicom-*`
 * palette resolution, the ADR-006 single-source fusion opacity, projection
 * mapping, and every fail-closed refusal.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  CORNERSTONE_INTERPOLATION_TYPES,
  VIEW_APPLICATION_ERROR_CODES,
  ViewApplicationError,
  compileMedicalViewApplication,
  toCornerstoneInterpolationType,
} = await import('../../packages/medical-engine/src/view-application/index.ts');

const { suvRangeToBqml, resolvePetQuantitationBinding } = await import(
  '../../packages/medical-engine/src/radiometry/index.ts'
);

const { PaletteResolutionError } = await import(
  '../../packages/medical-engine/src/palette/index.ts'
);

const { getFusionOpacity, getPETOpacityMapping } = await import(
  '../../packages/rendering-presets/src/index.ts'
);

import { mockCtAsset, mockPetAsset } from '../fixtures/clinical-contracts.fixture.ts';
import {
  mockFusionView,
  mockMedicalView,
  mockPetView,
} from '../fixtures/view-contracts.fixture.ts';

const SUV_FACTOR = mockPetAsset.metadata.petQuantitation?.suvFactor as number;
const TOLERANCE = 1e-12;
const petBinding = resolvePetQuantitationBinding(mockPetAsset, 'rescaled-bqml');
const CT_VOLUME_IDS = new Map([['asset-ct', 'volume-ct']]);
const PET_VOLUME_IDS = new Map([[mockPetAsset.id, 'volume-pet']]);
const FUSION_VOLUME_IDS = new Map([
  [mockCtAsset.id, 'volume-ct'],
  [mockPetAsset.id, 'volume-pet'],
]);

function expectCode(run: () => unknown, code: string): ViewApplicationError {
  let caught: ViewApplicationError | undefined;
  assert.throws(run, (error: unknown) => {
    assert.ok(
      error instanceof ViewApplicationError,
      `expected ViewApplicationError, got ${String(error)}`,
    );
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    caught = error;
    return true;
  });
  return caught as ViewApplicationError;
}

describe('NuClear P3.4-B.2.1 — single-layer view application', () => {
  it('1. a single CT view compiles VOI, gray colormap, opacity, invert and interpolation, and a COMPOSITE slice', () => {
    const plan = compileMedicalViewApplication({
      state: mockMedicalView,
      volumeIds: CT_VOLUME_IDS,
    });
    assert.equal(plan.viewId, 'view-ct');
    assert.equal(plan.layers.length, 1);
    const [layer] = plan.layers;
    assert.equal(layer.assetId, 'asset-ct');
    assert.equal(layer.volumeId, 'volume-ct');
    assert.equal(layer.role, 'base');
    assert.deepEqual(layer.properties.voiRange, { lower: -1000, upper: 1000 });
    assert.deepEqual(layer.properties.colormap, { name: 'gray', opacity: 1 });
    assert.equal(layer.properties.invert, false);
    assert.equal(layer.properties.interpolationType, 'linear');
    assert.deepEqual(plan.projection, {
      mode: 'slice',
      blendMode: 'COMPOSITE',
      slabThicknessMm: undefined,
    });
  });

  it('2. a single PET view without an ADR-005 binding refuses with VIEW_PET_BINDING_REQUIRED', () => {
    expectCode(
      () => compileMedicalViewApplication({ state: mockPetView, volumeIds: PET_VOLUME_IDS }),
      VIEW_APPLICATION_ERROR_CODES.petBindingRequired,
    );
  });

  it('3. a single PET view converts suvRange [0, 8] to [0, 8 / suvFactor] within 1e-12 and resolves dicom-pet to PET', () => {
    const plan = compileMedicalViewApplication({
      state: mockPetView,
      volumeIds: PET_VOLUME_IDS,
      petBinding,
    });
    const [layer] = plan.layers;
    assert.equal(layer.assetId, mockPetAsset.id);
    assert.equal(layer.role, 'base');
    const { lower, upper } = layer.properties.voiRange;
    assert.ok(Math.abs(lower - 0) <= TOLERANCE, `lower=${lower}`);
    assert.ok(Math.abs(upper - 8 / SUV_FACTOR) <= TOLERANCE, `upper=${upper}`);
    assert.deepEqual(layer.properties.colormap, { name: 'PET', opacity: 1 });
    assert.equal(layer.properties.colormap.opacityMapping, undefined);
  });

  it('4. a CT/generic layer without voi refuses with VIEW_STATE_INVALID', () => {
    const state = {
      ...mockMedicalView,
      presentation: { ...mockMedicalView.presentation, voi: undefined },
    };
    expectCode(
      () => compileMedicalViewApplication({ state, volumeIds: CT_VOLUME_IDS }),
      VIEW_APPLICATION_ERROR_CODES.stateInvalid,
    );
  });

  it('5. a single view with a non-gray, non-dicom colormapId refuses with VIEW_COLORMAP_UNKNOWN', () => {
    for (const colormapId of ['rainbow', '', 'pet', 'PET', 'HOT_IRON']) {
      const state = {
        ...mockMedicalView,
        presentation: { ...mockMedicalView.presentation, colormapId },
      };
      expectCode(
        () => compileMedicalViewApplication({ state, volumeIds: CT_VOLUME_IDS }),
        VIEW_APPLICATION_ERROR_CODES.colormapUnknown,
      );
    }
  });
});

describe('NuClear P3.4-B.2.1 — fusion application (ADR-006)', () => {
  it('6. a fusion view applies a CT base and a PET overlay whose opacity is getFusionOpacity(50) and whose mapping is getPETOpacityMapping', () => {
    const plan = compileMedicalViewApplication({
      state: mockFusionView,
      volumeIds: FUSION_VOLUME_IDS,
      petBinding,
    });
    assert.equal(plan.layers.length, 2);
    const [base, overlay] = plan.layers;

    assert.equal(base.assetId, mockCtAsset.id);
    assert.equal(base.role, 'base');
    assert.deepEqual(base.properties.voiRange, { lower: -160, upper: 240 });
    assert.deepEqual(base.properties.colormap, { name: 'gray', opacity: 1 });
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
        }),
      VIEW_APPLICATION_ERROR_CODES.petBindingRequired,
    );
  });

  it('8. a PET layer declaring both voi and suvRange, or neither, refuses with VIEW_STATE_INVALID', () => {
    const [baseLayer, overlayLayer] = mockFusionView.composition.layers;
    const withPresentation = (presentation: Record<string, unknown>) => ({
      ...mockFusionView,
      composition: {
        mode: 'fusion',
        blend: 'alpha',
        layers: [baseLayer, { ...overlayLayer, presentation }],
      },
    });
    for (const presentation of [
      { ...overlayLayer.presentation, voi: [0, 8] },
      { ...overlayLayer.presentation, suvRange: undefined },
    ]) {
      expectCode(
        () =>
          compileMedicalViewApplication({
            state: withPresentation(presentation),
            volumeIds: FUSION_VOLUME_IDS,
            petBinding,
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
      const plan = compileMedicalViewApplication({ state, volumeIds: CT_VOLUME_IDS });
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
      const state = { ...mockMedicalView, projection: { mode: 'MIP', slabThicknessMm } };
      expectCode(
        () => compileMedicalViewApplication({ state, volumeIds: CT_VOLUME_IDS }),
        VIEW_APPLICATION_ERROR_CODES.projectionInvalid,
      );
    }
  });
});

describe('NuClear P3.4-B.2.1 — volume binding and palette cause', () => {
  it('11. an unbound assetId refuses with VIEW_VOLUME_NOT_BOUND', () => {
    expectCode(
      () =>
        compileMedicalViewApplication({ state: mockMedicalView, volumeIds: new Map() }),
      VIEW_APPLICATION_ERROR_CODES.volumeNotBound,
    );
  });

  it('12. an unknown dicom-* id refuses with VIEW_COLORMAP_UNKNOWN and preserves the typed cause', () => {
    const state = {
      ...mockMedicalView,
      presentation: { ...mockMedicalView.presentation, colormapId: 'dicom-nope' },
    };
    const error = expectCode(
      () => compileMedicalViewApplication({ state, volumeIds: CT_VOLUME_IDS }),
      VIEW_APPLICATION_ERROR_CODES.colormapUnknown,
    );
    assert.ok(
      error.cause instanceof PaletteResolutionError,
      `expected PaletteResolutionError cause, got ${String(error.cause)}`,
    );
  });
});

describe('NuClear P3.4-B.2.1 — Cornerstone interpolation mapping', () => {
  it('13. maps the portable interpolationType to Cornerstone numeric InterpolationType (nearest=0, linear=1)', () => {
    assert.equal(CORNERSTONE_INTERPOLATION_TYPES.nearest, 0);
    assert.equal(CORNERSTONE_INTERPOLATION_TYPES.linear, 1);
    assert.equal(toCornerstoneInterpolationType('nearest'), 0);
    assert.equal(toCornerstoneInterpolationType('linear'), 1);
  });
});
