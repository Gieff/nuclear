/**
 * NuClear P3.4-B.2.2.2.3 — viewport-global property divergence refusal.
 *
 * Cornerstone's `BaseVolumeViewport.setProperties` applies `invert` and
 * `interpolationType` viewport-globally (it writes `viewportProperties.invert`
 * and calls `setInterpolationType` with no `volumeId`; only `voiRange` and
 * `colormap` are per-volume). A multi-layer plan whose layers disagree cannot
 * be applied per-layer faithfully, so the pure compiler must refuse it by name
 * instead of silently letting the last layer win. A homogeneous plan (and any
 * single-layer plan) is unaffected.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FUSION_VOLUME_IDS,
  PET_BINDINGS,
  VIEW_APPLICATION_ERROR_CODES,
  compileMedicalViewApplication,
  expectCode,
  mockFusionView,
} from './fixtures/view-application-fixtures.ts';
import type { FusionState } from './fixtures/view-application-fixtures.ts';

const fusionState = mockFusionView as FusionState;
const [baseLayer, overlayLayer] = fusionState.composition.layers;

/** Rebuilds the fixture fusion with substituted layer presentations. */
function fusionWithLayers(
  layers: FusionState['composition']['layers'],
): FusionState {
  return {
    ...fusionState,
    composition: { mode: 'fusion', blend: 'alpha', layers },
  };
}

describe('NuClear P3.4-B.2.2.2.3 — viewport-global layer property divergence', () => {
  it('22. a fusion whose base and overlay differ on invert refuses with VIEW_PER_LAYER_PROPERTY_UNSUPPORTED naming invert and both values', () => {
    const error = expectCode(
      () =>
        compileMedicalViewApplication({
          state: fusionWithLayers([
            { ...baseLayer, presentation: { ...baseLayer.presentation, invert: true } },
            overlayLayer,
          ]),
          volumeIds: FUSION_VOLUME_IDS,
          petBindings: PET_BINDINGS,
        }),
      VIEW_APPLICATION_ERROR_CODES.perLayerPropertyUnsupported,
    );
    assert.ok(error.message.includes('invert'), error.message);
    assert.ok(error.message.includes('true'), error.message);
    assert.ok(error.message.includes('false'), error.message);
  });

  it('23. a fusion whose base and overlay differ on interpolationType refuses with VIEW_PER_LAYER_PROPERTY_UNSUPPORTED naming interpolationType and both values', () => {
    const error = expectCode(
      () =>
        compileMedicalViewApplication({
          state: fusionWithLayers([
            { ...baseLayer, presentation: { ...baseLayer.presentation, interpolation: 'nearest' } },
            overlayLayer,
          ]),
          volumeIds: FUSION_VOLUME_IDS,
          petBindings: PET_BINDINGS,
        }),
      VIEW_APPLICATION_ERROR_CODES.perLayerPropertyUnsupported,
    );
    assert.ok(error.message.includes('interpolationType'), error.message);
    assert.ok(error.message.includes('nearest'), error.message);
    assert.ok(error.message.includes('linear'), error.message);
  });

  it('24. the homogeneous fixture fusion still compiles every layer (control)', () => {
    const plan = compileMedicalViewApplication({
      state: fusionState,
      volumeIds: FUSION_VOLUME_IDS,
      petBindings: PET_BINDINGS,
    });
    assert.equal(plan.layers.length, 2);
    for (const layer of plan.layers) {
      assert.equal(layer.properties.invert, false);
      assert.equal(layer.properties.interpolationType, 'linear');
    }
  });
});
