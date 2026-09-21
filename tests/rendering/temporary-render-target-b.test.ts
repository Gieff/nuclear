/**
 * NuClear P3.5-B — real-harness temporary high-resolution RenderTarget evidence.
 *
 * One fresh controlled WebGL 2 harness page per test. Covers the P3.5-B
 * acceptance evidence the P3.5-A smoke left out: 300 DPI native dimensions,
 * ordinary/target render equivalence from the same state, full live-canvas
 * invariance (element, canvas, aspect ratio, full camera, blend mode, actor
 * count and per-layer properties) plus immutable plan/state inputs, allocation
 * failure without fallback, and disposal after an apply refusal. No
 * byte-identical RGBA is required: dimensions, non-emptiness, provenance and
 * value invariants only.
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
import type {
  TargetEquivalenceAck,
  TargetFailureAck,
  TargetSnapshotAck,
} from './fixtures/target-probe-types.ts';

const DPI_300_PIXELS = 945 * 945;

describe('NuClear P3.5-B — temporary high-resolution RenderTarget evidence', () => {
  it('1. renders 8cm x 8cm at 300 DPI as a native 945x945 raster with a non-empty buffer and no residual temporary engine', async () => {
    const harness = await createRendererHarness({ entryPath: TARGET_ENTRY_PATH });
    try {
      const ack = await callTargetProbe(harness.page, 'captureTargetAtDpi', [
        { ct: readFixture('ct-axial'), widthMm: 80, heightMm: 80, dpi: 300 },
      ]);
      assert.equal(ack.ok, true, describeTargetAck(ack));

      const descriptor = ack.descriptor;
      assert.ok(descriptor !== undefined, 'a successful target capture must return a descriptor');

      assert.deepEqual(ack.pixelDimensions, [945, 945]);
      assert.equal(ack.dpi, 300);
      assert.deepEqual(descriptor.pixelSize, [945, 945]);
      assert.equal(descriptor.raster.width, 945);
      assert.equal(descriptor.raster.height, 945);
      assert.equal(descriptor.raster.byteLength, DPI_300_PIXELS * 4);
      assert.equal(descriptor.raster.format, 'rgba8');
      assert.ok(descriptor.raster.nonEmptyPixelCount > 0, 'the 300 DPI raster must not be empty');

      assert.equal(descriptor.provenance.layers.length, 1);
      const [layer] = descriptor.provenance.layers;
      assert.equal(layer.modality, 'ct');
      assert.equal(layer.paletteName, 'Grayscale');
      assert.equal(layer.scalarDataDomain, 'rescaled-hu');

      assert.equal(
        ack.targetEngineRegisteredAfter,
        false,
        'the temporary engine must be unregistered after a successful capture',
      );
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('2. the temporary target reuses the ordinary capture state, proving JSON-equal provenance on the same CT plan', async () => {
    const harness = await createRendererHarness({ entryPath: TARGET_ENTRY_PATH });
    try {
      const ack = (await callTargetProbe(harness.page, 'captureEquivalence', [
        { ct: readFixture('ct-axial') },
      ])) as unknown as TargetEquivalenceAck;
      assert.equal(ack.ok, true, `${ack.name ?? ''} ${ack.code ?? ''} ${ack.message ?? ''}`.trim());

      const { ordinary, target } = ack;
      assert.ok(ordinary !== undefined, 'the ordinary capture must return a descriptor');
      assert.ok(target !== undefined, 'the temporary target must return a descriptor');
      if (ordinary === undefined || target === undefined) {
        throw new Error('unreachable: descriptors asserted above');
      }

      // The same state/presets/provenance, target retargets only the pixel size.
      assert.deepEqual(target.provenance, ordinary.provenance);
      assert.equal(target.provenance.viewId, ordinary.provenance.viewId);
      assert.equal(target.provenance.blendMode, ordinary.provenance.blendMode);
      assert.deepEqual(target.provenance.appliedOrientation, ordinary.provenance.appliedOrientation);
      assert.deepEqual(
        target.provenance.layers.map((entry) => ({
          assetId: entry.assetId,
          modality: entry.modality,
          role: entry.role,
          paletteName: entry.paletteName,
          scalarDataDomain: entry.scalarDataDomain,
          voiRange: entry.voiRange,
        })),
        ordinary.provenance.layers.map((entry) => ({
          assetId: entry.assetId,
          modality: entry.modality,
          role: entry.role,
          paletteName: entry.paletteName,
          scalarDataDomain: entry.scalarDataDomain,
          voiRange: entry.voiRange,
        })),
      );

      assert.deepEqual(ordinary.pixelSize, [512, 512]);
      assert.deepEqual(target.pixelSize, [945, 945]);
      assert.equal(target.raster.width, 945);
      assert.equal(target.raster.height, 945);
      assert.equal(target.raster.byteLength, DPI_300_PIXELS * 4);
      assert.equal(target.raster.format, 'rgba8');
      assert.ok(target.raster.nonEmptyPixelCount > 0, 'the target raster must not be empty');
      assert.ok(ordinary.raster.nonEmptyPixelCount > 0, 'the ordinary raster must not be empty');

      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('3. a full live snapshot is value-identical before and after the target export and the live plan/state inputs are unchanged', async () => {
    const harness = await createRendererHarness({ entryPath: TARGET_ENTRY_PATH });
    try {
      const ack = await callTargetProbe(harness.page, 'captureTargetAtDpi', [
        { ct: readFixture('ct-axial'), widthMm: 80, heightMm: 80, dpi: 300 },
      ]);
      assert.equal(ack.ok, true, describeTargetAck(ack));

      const before = ack.liveBefore;
      const after = ack.liveAfter;
      assert.ok(before !== undefined, 'the probe must report the live snapshot before the export');
      assert.ok(after !== undefined, 'the probe must report the live snapshot after the export');
      if (before === undefined || after === undefined) {
        throw new Error('unreachable: snapshots asserted above');
      }

      assert.deepEqual(after, before);
      assert.deepEqual(before.elementSizePx, [512, 512]);
      assert.deepEqual(before.canvasSizePx, [512, 512]);
      assert.deepEqual(before.aspectRatio, [1, 1]);
      assert.equal(before.actorCount, 1);
      assert.equal(before.layers.length, 1);
      const [layer] = before.layers;
      assert.equal(layer.colormapName, 'Grayscale');
      assert.deepEqual(layer.voiRange, { lower: -1000, upper: 1000 });
      assert.equal(layer.invert, false);
      assert.equal(layer.interpolationType, 1);
      assert.ok(
        Object.keys(before.camera).length >= 5,
        'the full getCamera() snapshot must carry its camera fields',
      );

      assert.deepEqual(ack.livePlanAfter, ack.livePlanBefore);
      assert.deepEqual(ack.liveStateAfter, ack.liveStateBefore);

      const snapAck = (await callTargetProbe(
        harness.page,
        'snapshotLive',
        [],
      )) as unknown as TargetSnapshotAck;
      assert.equal(snapAck.ok, true, `${snapAck.name ?? ''} ${snapAck.code ?? ''}`.trim());
      assert.deepEqual(snapAck.snapshot, before);

      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('4. an unavailable temporary host fails closed as RENDER_TARGET_ALLOCATION_FAILED with no raster, no fallback and no registered engine', async () => {
    const harness = await createRendererHarness({ entryPath: TARGET_ENTRY_PATH });
    try {
      const ack = (await callTargetProbe(harness.page, 'targetFailure', [
        { ct: readFixture('ct-axial'), scenario: 'allocation' },
      ])) as unknown as TargetFailureAck;
      assert.equal(ack.ok, false, 'the allocation scenario must fail closed');
      assert.equal(ack.name, 'RenderTargetError', describeTargetAck(ack));
      assert.equal(ack.code, 'RENDER_TARGET_ALLOCATION_FAILED', describeTargetAck(ack));
      assert.ok(ack.message.length > 0, 'the refusal must carry an actionable message');
      assert.match(ack.message, /no fallback/i);
      assert.equal(ack.descriptor, undefined, 'an allocation failure must never return a raster');
      assert.equal(ack.engineRegisteredAfter, false, 'no temporary engine may remain registered');
      assert.equal(ack.containerCountAfter, 0, 'no temporary container may remain in the DOM');
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('5. an apply refusal after the temporary engine started disposes the temporary engine and container with no leak', async () => {
    const harness = await createRendererHarness({ entryPath: TARGET_ENTRY_PATH });
    try {
      const ack = (await callTargetProbe(harness.page, 'targetFailure', [
        { ct: readFixture('ct-axial'), scenario: 'apply-refused' },
      ])) as unknown as TargetFailureAck;
      assert.equal(ack.ok, false, 'the apply-refused scenario must fail closed');
      assert.equal(ack.name, 'ViewApplicationError', describeTargetAck(ack));
      assert.equal(ack.code, 'VIEW_VOLUME_NOT_RESIDENT', describeTargetAck(ack));
      assert.equal(ack.descriptor, undefined, 'a refused apply must never return a raster');
      assert.equal(ack.engineRegisteredAfter, false, 'the temporary engine must be disposed');
      assert.equal(ack.containerCountAfter, 0, 'the temporary container must be removed');
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });
});
