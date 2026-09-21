/**
 * NuClear P3.4-C.2 — real browser capture of the ordinary medical raster.
 *
 * The controlled WebGL 2 harness bundles `fixtures/capture-entry.ts`, which
 * starts the real adapter with `{ viewportType: 'orthographic' }`, loads and
 * applies the committed CT/PT fixtures and captures through the real
 * `captureMedicalRaster`. These tests assert the native raster, the semantic
 * provenance, the spec §6 PET transport-scalar certification and that every
 * refusal is typed and leaves the applied viewport unmodified.
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
import type { FixtureName } from './fixtures/application-test-support.ts';
import { CAPTURE_ENTRY_PATH, callCaptureProbe, describeCaptureAck } from './fixtures/capture-test-support.ts';
import type { CaptureNegativeScenario, CaptureMutationAck } from './fixtures/capture-probe-types.ts';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const { suvRangeToBqml } = await import(
  '../../packages/medical-engine/src/radiometry/pet-binding.ts'
);

/** Committed declared SUV window for the fusion overlay. */
const SUV_RANGE = [0, 8] as const;
const NATIVE_PIXELS = 512 * 512;

interface NegativeCase {
  readonly scenario: CaptureNegativeScenario;
  readonly code: string;
  readonly actorCount: number;
  readonly pet: FixtureName;
}

const NEGATIVES: readonly NegativeCase[] = [
  { scenario: 'not-applied', code: 'VIEW_VOLUME_NOT_RESIDENT', actorCount: 0, pet: 'pt-axial' },
  { scenario: 'non-neutral-camera', code: 'VIEW_CAMERA_UNSUPPORTED', actorCount: 1, pet: 'pt-axial' },
  { scenario: 'slice-position', code: 'VIEW_SLICE_POSITION_UNSUPPORTED', actorCount: 0, pet: 'pt-axial' },
  { scenario: 'for-mismatch', code: 'VIEW_FOR_MISMATCH', actorCount: 0, pet: 'pt-axial' },
  { scenario: 'invalid-transform', code: 'VIEW_TRANSFORM_INVALID', actorCount: 0, pet: 'pt-axial' },
  { scenario: 'different-for-transform', code: 'VIEW_TRANSFORM_UNSUPPORTED', actorCount: 0, pet: 'pt-axial' },
  { scenario: 'evidence-not-cached', code: 'VIEW_VOLUME_NOT_RESIDENT', actorCount: 0, pet: 'pt-axial' },
  { scenario: 'missing-resident', code: 'VIEW_VOLUME_NOT_RESIDENT', actorCount: 0, pet: 'pt-axial' },
  { scenario: 'unresolved-palette', code: 'VIEW_COLORMAP_UNKNOWN', actorCount: 0, pet: 'pt-axial' },
  { scenario: 'viewport-size-mismatch', code: 'VIEW_VIEWPORT_SIZE_MISMATCH', actorCount: 0, pet: 'pt-axial' },
  { scenario: 'zero-size-viewport', code: 'VIEW_VIEWPORT_READBACK_FAILED', actorCount: 0, pet: 'pt-axial' },
  { scenario: 'unsupported-scheme', code: 'VIEW_VOLUME_SCHEME_UNSUPPORTED', actorCount: 0, pet: 'pt-axial' },
  { scenario: 'pet-scalar-mismatch', code: 'VIEW_SCALAR_DOMAIN_UNVERIFIED', actorCount: 2, pet: 'pt-axial-coreg' },
  { scenario: 'pet-domain-mismatch', code: 'VIEW_SCALAR_DOMAIN_UNVERIFIED', actorCount: 2, pet: 'pt-axial-coreg' },
  { scenario: 'guard-order', code: 'VIEW_VOLUME_SCHEME_UNSUPPORTED', actorCount: 0, pet: 'pt-axial' },
];

describe('NuClear P3.4-C.2 — ordinary medical raster capture', () => {
  it('1. captures the applied single-CT viewport as a native 512x512 RGBA raster with full provenance', async () => {
    const harness = await createRendererHarness({ entryPath: CAPTURE_ENTRY_PATH });
    try {
      const ack = await callCaptureProbe(harness.page, 'captureCt', [readFixture('ct-axial')]);
      assert.equal(ack.ok, true, describeCaptureAck(ack));
      const descriptor = ack.descriptor;
      assert.ok(descriptor !== undefined, 'a successful capture must return a descriptor');
      assert.deepEqual(descriptor.pixelSize, [512, 512]);
      assert.equal(descriptor.raster.width, 512);
      assert.equal(descriptor.raster.height, 512);
      assert.equal(descriptor.raster.byteLength, NATIVE_PIXELS * 4);
      assert.equal(descriptor.raster.format, 'rgba8');
      assert.ok(descriptor.raster.nonEmptyPixelCount > 0, 'the raster must not be empty');
      assert.equal(descriptor.raster.nonEmptyPixelCount, NATIVE_PIXELS);
      assert.ok(descriptor.raster.rgbaBase64.length > 0, 'the raster must be base64-encoded');

      assert.equal(descriptor.provenance.viewId, 'view-ct');
      assert.equal(descriptor.provenance.layers.length, 1);
      const [layer] = descriptor.provenance.layers;
      assert.equal(layer.modality, 'ct');
      assert.equal(layer.paletteName, 'Grayscale');
      assert.equal(layer.scalarDataDomain, 'rescaled-hu');
      assert.deepEqual(layer.voiRange, { lower: -1000, upper: 1000 });
      assert.deepEqual(descriptor.provenance.appliedOrientation.viewPlaneNormal, [0, 0, 1]);
      assert.deepEqual(descriptor.provenance.appliedOrientation.viewUp, [0, 1, 0]);

      const ctTransport = ack.ctTransport;
      assert.ok(ctTransport !== undefined, 'the probe must report the real CT transport scalars');
      assert.equal(ctTransport.length, 48);
      assertNear(ctTransport.min, -24, 1e-6, 'CT transport min');
      assertNear(ctTransport.max, 23, 1e-6, 'CT transport max');
      assert.equal(ctTransport.sample[0], -24);
      assert.equal(ctTransport.sample[2], 23);

      assert.equal(descriptor.renderer.softwareRasterizer, true);
      assert.deepEqual(ack.elementSizePx, [512, 512]);
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('2. certifies the same-Frame-of-Reference CT+PET fusion Bq/mL transport scalars against the committed payload', async () => {
    const harness = await createRendererHarness({ entryPath: CAPTURE_ENTRY_PATH });
    try {
      const suvFactor = readExpectedQuantitation('pt-axial-coreg').suvFactor;
      const ack = await callCaptureProbe(harness.page, 'captureCoregFusion', [
        { ct: readFixture('ct-axial'), pet: readFixture('pt-axial-coreg'), suvFactor },
      ]);
      assert.equal(ack.ok, true, describeCaptureAck(ack));
      const descriptor = ack.descriptor;
      assert.ok(descriptor !== undefined, 'a successful capture must return a descriptor');
      assert.equal(descriptor.provenance.layers.length, 2);
      const [ctLayer, petLayer] = descriptor.provenance.layers;
      assert.equal(ctLayer.modality, 'ct');
      assert.equal(petLayer.modality, 'pet');
      assert.equal(petLayer.paletteName, 'PET');
      assert.equal(petLayer.scalarDataDomain, 'rescaled-bqml');

      const [lower, upper] = suvRangeToBqml([SUV_RANGE[0], SUV_RANGE[1]], suvFactor);
      assertNear(petLayer.voiRange.lower, lower, 1e-6, 'PET provenance voiRange.lower');
      assertNear(petLayer.voiRange.upper, upper, 1e-6, 'PET provenance voiRange.upper');

      const transport = ack.petTransport;
      assert.ok(transport !== undefined, 'the probe must report the real PET transport scalars');
      assert.equal(transport.length, 48);
      assertNear(transport.min, 200000, 1e-6, 'PET transport min');
      assertNear(transport.max, 247000, 1e-6, 'PET transport max');
      assertNear(transport.sample[0] as number, 200000, 1e-6, 'PET transport first');
      assertNear(transport.sample[2] as number, 247000, 1e-6, 'PET transport last');

      assert.equal(descriptor.renderer.softwareRasterizer, true);
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  for (const { scenario, code, actorCount, pet } of NEGATIVES) {
    it(`3.${scenario} refuses with ${code} and returns no descriptor`, async () => {
      const harness = await createRendererHarness({ entryPath: CAPTURE_ENTRY_PATH });
      try {
        const ack = await callCaptureProbe(harness.page, 'captureNegative', [
          { ct: readFixture('ct-axial'), pet: readFixture(pet) },
          scenario,
        ]);
        assert.equal(ack.ok, false, `scenario '${scenario}' must fail closed`);
        assert.equal(ack.code, code, describeCaptureAck(ack));
        assert.equal(ack.descriptor, undefined, `scenario '${scenario}' must not return a raster`);
        assert.equal(ack.actorCount, actorCount, `scenario '${scenario}' actor count`);
        assert.deepEqual(harness.pageErrors, []);
        assert.deepEqual(harness.consoleErrors, []);
      } finally {
        await harness.close();
      }
    });
  }

  it('4. a refused guard-order capture does not mutate the already-applied viewport or camera', async () => {
    const harness = await createRendererHarness({ entryPath: CAPTURE_ENTRY_PATH });
    try {
      const ack = (await callCaptureProbe(harness.page, 'captureMutation', [
        { ct: readFixture('ct-axial'), pet: readFixture('pt-axial') },
      ])) as unknown as CaptureMutationAck;
      assert.equal(ack.code, 'VIEW_VOLUME_SCHEME_UNSUPPORTED');
      assert.equal(ack.actorCountBefore, 1);
      assert.equal(ack.actorCountAfter, 1);
      assert.deepEqual(ack.cameraAfter, ack.cameraBefore);
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });
});
