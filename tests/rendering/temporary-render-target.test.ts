/**
 * NuClear P3.5-A — real browser temporary high-resolution RenderTarget smoke.
 *
 * The controlled WebGL 2 harness bundles `fixtures/target-entry.ts`, which
 * keeps an ordinary live 512×512 adapter with the committed `ct-axial` applied
 * and captures the same state at 8 cm × 8 cm / 600 DPI through the real
 * `captureTemporaryRenderTarget`. These tests assert the native 1890×1890
 * raster, its provenance and renderer facts, and that the live canvas, element
 * size, camera and actor count are unchanged. The full negative/invariance
 * matrix belongs to P3.5-B.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRendererHarness } from './fixtures/renderer-harness.mjs';
import { readFixture } from './fixtures/application-test-support.ts';
import {
  TARGET_ENTRY_PATH,
  callTargetProbe,
  describeTargetAck,
} from './fixtures/target-test-support.ts';

const TARGET_PIXELS = 1890 * 1890;

describe('NuClear P3.5-A — temporary high-resolution RenderTarget', () => {
  it('1. captures the applied CT state at 8cm x 8cm / 600 DPI on a native 1890x1890 target and leaves the live canvas invariant', async () => {
    const harness = await createRendererHarness({ entryPath: TARGET_ENTRY_PATH });
    try {
      const ack = await callTargetProbe(harness.page, 'captureTarget', [
        { ct: readFixture('ct-axial'), widthMm: 80, heightMm: 80, dpi: 600 },
      ]);
      assert.equal(ack.ok, true, describeTargetAck(ack));

      const descriptor = ack.descriptor;
      assert.ok(descriptor !== undefined, 'a successful target capture must return a descriptor');

      assert.deepEqual(ack.pixelDimensions, [1890, 1890]);
      assert.equal(ack.dpi, 600);
      assert.deepEqual(descriptor.pixelSize, [1890, 1890]);
      assert.equal(descriptor.raster.width, 1890);
      assert.equal(descriptor.raster.height, 1890);
      assert.equal(descriptor.raster.byteLength, TARGET_PIXELS * 4);
      assert.equal(descriptor.raster.format, 'rgba8');
      assert.ok(descriptor.raster.nonEmptyPixelCount > 0, 'the target raster must not be empty');
      assert.ok(
        typeof ack.elapsedMs === 'number' && ack.elapsedMs > 0,
        'the probe must report a positive capture duration',
      );

      assert.equal(descriptor.provenance.layers.length, 1);
      const [layer] = descriptor.provenance.layers;
      assert.equal(layer.paletteName, 'Grayscale');
      assert.equal(layer.scalarDataDomain, 'rescaled-hu');

      assert.equal(descriptor.renderer.softwareRasterizer, true);

      // The live interactive surface is never resized, re-camerad or mutated.
      assert.deepEqual(ack.liveElementBefore, [512, 512]);
      assert.deepEqual(ack.liveCanvasBefore, [512, 512]);
      assert.deepEqual(ack.liveElementAfter, ack.liveElementBefore);
      assert.deepEqual(ack.liveCanvasAfter, ack.liveCanvasBefore);
      assert.deepEqual(ack.liveCameraAfter, ack.liveCameraBefore);
      assert.equal(ack.liveActorCountAfter, ack.liveActorCountBefore);

      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });
});
