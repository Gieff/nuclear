/**
 * NuClear P3.4-C.3 — capture/restore round-trip and per-view isolation.
 *
 * The controlled WebGL 2 harness bundles `fixtures/capture-entry.ts`. These
 * tests assert that an applied compiled plan survives a JSON serialize/restore
 * onto a fresh adapter + viewport with source binding, camera, presentation,
 * projection, composition and coordinate transforms preserved (no fallback
 * substitution), and that two independent `MedicalViewState`s captured on two
 * viewports do not contaminate each other even though `invert`/
 * `interpolationType` are viewport-global and palettes are registered globally.
 */

import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import { createRendererHarness } from './fixtures/renderer-harness.mjs';
import {
  assertNear,
  readExpectedQuantitation,
  readFixture,
} from './fixtures/application-test-support.ts';
import { CAPTURE_ENTRY_PATH, callCaptureProbe, describeCaptureAck } from './fixtures/capture-test-support.ts';
import type {
  CaptureIsolationAck,
  CaptureRoundTripAck,
  CaptureRun,
} from './fixtures/capture-probe-types.ts';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const { suvRangeToBqml } = await import(
  '../../packages/medical-engine/src/radiometry/pet-binding.ts'
);

/** Committed declared SUV window for the isolation PET view. */
const SUV_RANGE = [0, 8] as const;
/** Named round-trip tolerance for the applied read-back comparison. */
const ROUND_TRIP_TOLERANCE = 1e-6;

function requireRun(run: CaptureRun | undefined, label: string): CaptureRun {
  assert.ok(run !== undefined, `${label} must be present`);
  return run;
}

function assertVectorNear(
  actual: readonly number[],
  expected: readonly number[],
  label: string,
): void {
  assert.equal(actual.length, expected.length, `${label}: arity`);
  for (let index = 0; index < expected.length; index += 1) {
    assertNear(actual[index], expected[index], ROUND_TRIP_TOLERANCE, `${label}[${index}]`);
  }
}

describe('NuClear P3.4-C.3 — capture round-trip and per-view isolation', () => {
  it('captures and restores the applied state within the named tolerance', async () => {
    const harness = await createRendererHarness({ entryPath: CAPTURE_ENTRY_PATH });
    try {
      const ack = await callCaptureProbe<CaptureRoundTripAck>(
        harness.page,
        'captureRoundTrip',
        [readFixture('ct-axial')],
      );
      assert.equal(ack.ok, true, describeCaptureAck(ack));
      assert.ok((ack.serializedLength ?? 0) > 0, 'the state+plan must be serialized through JSON');
      const first = requireRun(ack.first, 'first run');
      const second = requireRun(ack.second, 'second run');

      // Serialized identity: source binding, composition, presentation,
      // projection, spatial state and coordinate transforms after round-trip.
      assert.equal(JSON.stringify(second.plan), JSON.stringify(first.plan));
      assert.equal(
        JSON.stringify(second.descriptor.provenance),
        JSON.stringify(first.descriptor.provenance),
      );
      assert.deepEqual(second.descriptor.pixelSize, first.descriptor.pixelSize);
      assert.equal(second.descriptor.raster.format, first.descriptor.raster.format);
      assert.deepEqual(second.descriptor.renderer, first.descriptor.renderer);

      // Applied read-back within the named tolerance.
      assert.equal(second.applied.viewId, first.applied.viewId);
      assert.equal(second.applied.blendMode, first.applied.blendMode);
      assert.deepEqual(second.applied.volumeIds, first.applied.volumeIds);
      assert.equal(second.applied.layers.length, first.applied.layers.length);
      for (let index = 0; index < first.applied.layers.length; index += 1) {
        const before = first.applied.layers[index];
        const after = second.applied.layers[index];
        assert.equal(after.assetId, before.assetId);
        assert.equal(after.volumeId, before.volumeId);
        assertNear(
          after.properties.voiRange.lower,
          before.properties.voiRange.lower,
          ROUND_TRIP_TOLERANCE,
          `layer[${index}].voiRange.lower`,
        );
        assertNear(
          after.properties.voiRange.upper,
          before.properties.voiRange.upper,
          ROUND_TRIP_TOLERANCE,
          `layer[${index}].voiRange.upper`,
        );
        assert.equal(after.properties.colormap.name, before.properties.colormap.name);
        assert.equal(after.properties.invert, before.properties.invert);
      }
      assertVectorNear(
        second.applied.requestedOrientation.viewPlaneNormal,
        first.applied.requestedOrientation.viewPlaneNormal,
        'requestedOrientation.viewPlaneNormal',
      );
      assertVectorNear(
        second.applied.requestedOrientation.viewUp,
        first.applied.requestedOrientation.viewUp,
        'requestedOrientation.viewUp',
      );
      assertVectorNear(
        second.applied.camera.viewPlaneNormal,
        first.applied.camera.viewPlaneNormal,
        'camera.viewPlaneNormal',
      );
      assertVectorNear(
        second.applied.camera.viewUp,
        first.applied.camera.viewUp,
        'camera.viewUp',
      );

      // No fallback substitution: the second run binds the same source.
      const firstLayer = first.descriptor.provenance.layers[0];
      const secondLayer = second.descriptor.provenance.layers[0];
      assert.equal(secondLayer.assetId, firstLayer.assetId);
      assert.equal(secondLayer.volumeId, firstLayer.volumeId);

      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('two independent views do not contaminate each other', async () => {
    const harness = await createRendererHarness({ entryPath: CAPTURE_ENTRY_PATH });
    try {
      const suvFactor = readExpectedQuantitation('pt-axial-coreg').suvFactor;
      const ack = await callCaptureProbe<CaptureIsolationAck>(
        harness.page,
        'captureIsolation',
        [{ ct: readFixture('ct-axial'), pet: readFixture('pt-axial-coreg'), suvFactor }],
      );
      assert.equal(ack.ok, true, describeCaptureAck(ack));
      const a = requireRun(ack.a, 'view A');
      const b = requireRun(ack.b, 'view B');
      assert.deepEqual(ack.actorCounts, [1, 1]);

      // A: declared CT single view, no preset default substituted.
      const aLayer = a.descriptor.provenance.layers[0];
      assert.equal(aLayer.assetId, 'fixture.volume.ct-axial');
      assert.equal(aLayer.modality, 'ct');
      assert.equal(aLayer.paletteName, 'Grayscale');
      assert.equal(aLayer.scalarDataDomain, 'rescaled-hu');
      assert.deepEqual(aLayer.voiRange, { lower: -1000, upper: 1000 });
      assert.equal(a.applied.layers[0].properties.invert, false);
      assert.equal(a.applied.layers[0].properties.interpolationType, 1);

      // B: declared PET single view, its own palette/VOI/global properties.
      const bLayer = b.descriptor.provenance.layers[0];
      assert.equal(bLayer.assetId, 'fixture.volume.pt-axial-coreg');
      assert.equal(bLayer.modality, 'pet');
      assert.equal(bLayer.paletteName, 'PET');
      assert.equal(bLayer.scalarDataDomain, 'rescaled-bqml');
      const [lower, upper] = suvRangeToBqml([SUV_RANGE[0], SUV_RANGE[1]], suvFactor);
      assertNear(bLayer.voiRange.lower, lower, ROUND_TRIP_TOLERANCE, 'B voiRange.lower');
      assertNear(bLayer.voiRange.upper, upper, ROUND_TRIP_TOLERANCE, 'B voiRange.upper');
      assert.equal(b.applied.layers[0].properties.invert, true);
      assert.equal(b.applied.layers[0].properties.interpolationType, 0);

      // Distinct sources and no cross-view default substitution.
      assert.notEqual(aLayer.volumeId, bLayer.volumeId);
      assert.equal(aLayer.voiRange.upper, 1000);
      assert.notDeepEqual(bLayer.voiRange, { lower: -1000, upper: 1000 });
      assert.ok(bLayer.voiRange.upper !== -1000, 'B must not reuse the CT voiRange');

      // Each capture succeeded with its own palette and a non-empty raster.
      assert.ok(a.descriptor.raster.nonEmptyPixelCount > 0, 'A raster must not be empty');
      assert.ok(b.descriptor.raster.nonEmptyPixelCount > 0, 'B raster must not be empty');
      assert.deepEqual(a.descriptor.pixelSize, [512, 512]);
      assert.deepEqual(b.descriptor.pixelSize, [512, 512]);

      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });
});
