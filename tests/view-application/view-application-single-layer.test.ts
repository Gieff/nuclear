/**
 * NuClear P3.4-B.2.1 — pure `MedicalViewState` → Cornerstone application plan.
 *
 * Single-layer CT/PET compilation, palette resolution, volume binding and the
 * Cornerstone interpolation mapping. Split from the original suite without
 * changing test names, assertions or semantics.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CORNERSTONE_INTERPOLATION_TYPES,
  CT_VOLUME_IDS,
  NO_BINDINGS,
  PET_BINDINGS,
  PET_VOLUME_IDS,
  PaletteResolutionError,
  SUV_FACTOR,
  TOLERANCE,
  VIEW_APPLICATION_ERROR_CODES,
  compileMedicalViewApplication,
  expectCode,
  mockMedicalView,
  mockPetAsset,
  mockPetView,
  resolveViewColormapName,
  toCornerstoneInterpolationType,
} from './fixtures/view-application-fixtures.ts';

describe('NuClear P3.4-B.2.1 — single-layer view application', () => {
  it('1. a single CT view compiles VOI, the gray→Grayscale preset name, opacity, invert and interpolation, and a COMPOSITE slice', () => {
    assert.equal(resolveViewColormapName('gray'), 'Grayscale');
    const plan = compileMedicalViewApplication({
      state: mockMedicalView,
      volumeIds: CT_VOLUME_IDS,
      petBindings: NO_BINDINGS,
    });
    assert.equal(plan.viewId, 'view-ct');
    assert.equal(plan.layers.length, 1);
    const [layer] = plan.layers;
    assert.equal(layer.assetId, 'asset-ct');
    assert.equal(layer.volumeId, 'volume-ct');
    assert.equal(layer.role, 'base');
    assert.deepEqual(layer.properties.voiRange, { lower: -1000, upper: 1000 });
    assert.deepEqual(layer.properties.colormap, { name: 'Grayscale', opacity: 1 });
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
      () =>
        compileMedicalViewApplication({
          state: mockPetView,
          volumeIds: PET_VOLUME_IDS,
          petBindings: NO_BINDINGS,
        }),
      VIEW_APPLICATION_ERROR_CODES.petBindingRequired,
    );
  });

  it('3. a single PET view converts suvRange [0, 8] to [0, 8 / suvFactor] within 1e-12 and resolves dicom-pet to PET', () => {
    const plan = compileMedicalViewApplication({
      state: mockPetView,
      volumeIds: PET_VOLUME_IDS,
      petBindings: PET_BINDINGS,
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
      () => compileMedicalViewApplication({ state, volumeIds: CT_VOLUME_IDS, petBindings: NO_BINDINGS }),
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
        () => compileMedicalViewApplication({ state, volumeIds: CT_VOLUME_IDS, petBindings: NO_BINDINGS }),
        VIEW_APPLICATION_ERROR_CODES.colormapUnknown,
      );
    }
  });
});

describe('NuClear P3.4-B.2.1 — volume binding and palette cause', () => {
  it('11. an unbound assetId refuses with VIEW_VOLUME_NOT_BOUND', () => {
    expectCode(
      () =>
        compileMedicalViewApplication({
          state: mockMedicalView,
          volumeIds: new Map(),
          petBindings: NO_BINDINGS,
        }),
      VIEW_APPLICATION_ERROR_CODES.volumeNotBound,
    );
  });

  it('12. an unknown dicom-* id refuses with VIEW_COLORMAP_UNKNOWN and preserves the typed cause', () => {
    const state = {
      ...mockMedicalView,
      presentation: { ...mockMedicalView.presentation, colormapId: 'dicom-nope' },
    };
    const error = expectCode(
      () => compileMedicalViewApplication({ state, volumeIds: CT_VOLUME_IDS, petBindings: NO_BINDINGS }),
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
