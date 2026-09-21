/**
 * NuClear P3.4-B.2.2.2 — real Cornerstone volume viewport application.
 *
 * The controlled WebGL 2 harness bundles `fixtures/application-entry.ts`, which
 * starts the real adapter with `{ viewportType: 'orthographic' }`, loads the
 * committed CT/PT fixtures and applies real compiled plans. These tests assert
 * the actual viewport read-back (geometry, palette, opacity, blend mode,
 * orientation) and that every refusal is typed and leaves no volume set.
 *
 * The positive same-Frame-of-Reference fusion (committed `pt-axial-coreg`)
 * lives in `view-application-fusion.test.ts`; shared helpers live in
 * `fixtures/application-test-support.ts`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRendererHarness } from './fixtures/renderer-harness.mjs';
import {
  APPLICATION_ENTRY_PATH,
  assertComponentsNear,
  callProbe,
  describeAck,
  readFixture,
} from './fixtures/application-test-support.ts';
import type { AppliedState } from './fixtures/application-test-support.ts';

/** Declared MIP slab for the observed read-back test (well above Cornerstone's 0.1 mm clamp). */
const SLAB_THICKNESS_MM = 12;

const SCENARIOS: readonly { readonly scenario: string; readonly code: string }[] = [
  { scenario: 'missing-resident', code: 'VIEW_VOLUME_NOT_RESIDENT' },
  { scenario: 'evidence-not-cached', code: 'VIEW_VOLUME_NOT_RESIDENT' },
  { scenario: 'for-mismatch', code: 'VIEW_FOR_MISMATCH' },
  { scenario: 'invalid-transform', code: 'VIEW_TRANSFORM_INVALID' },
  { scenario: 'viewport-size-mismatch', code: 'VIEW_VIEWPORT_SIZE_MISMATCH' },
  { scenario: 'zero-size-viewport', code: 'VIEW_VIEWPORT_READBACK_FAILED' },
  { scenario: 'unresolved-palette', code: 'VIEW_COLORMAP_UNKNOWN' },
  { scenario: 'slice-position', code: 'VIEW_SLICE_POSITION_UNSUPPORTED' },
  { scenario: 'unsupported-scheme', code: 'VIEW_VOLUME_SCHEME_UNSUPPORTED' },
];

describe('NuClear P3.4-B.2.2.2 — Cornerstone volume viewport application', () => {
  it('1. ORTHOGRAPHIC creates a real volume viewport with the volume method surface', async () => {
    const harness = await createRendererHarness({ entryPath: APPLICATION_ENTRY_PATH });
    try {
      const ack = await callProbe(harness.page, 'viewport', []);
      assert.equal(ack.ok, true, describeAck(ack));
      assert.equal(ack.constructorName, 'VolumeViewport', 'ORTHOGRAPHIC must create a volume viewport');
      assert.equal(ack.type, 'orthographic');
      assert.equal(ack.useGenericViewport, false, 'the legacy (non-generic) viewport path is expected');
      assert.deepEqual(ack.elementSizePx, [512, 512]);
      for (const method of ['setVolumes', 'setProperties', 'setBlendMode', 'setOrientation', 'getCamera', 'getActors']) {
        assert.equal(ack.methodSurface?.[method], true, `expected method '${method}'`);
      }
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('2. the single CT built-in gray applies voiRange, Grayscale preset name, invert, linear interpolation and COMPOSITE', async () => {
    const harness = await createRendererHarness({ entryPath: APPLICATION_ENTRY_PATH });
    try {
      const ack = await callProbe(harness.page, 'applyCt', [readFixture('ct-axial')]);
      assert.equal(ack.ok, true, describeAck(ack));
      const applied = ack.applied as AppliedState;
      assert.equal(applied.viewId, 'view-ct');
      assert.equal(applied.layers.length, 1);
      assert.equal(applied.volumeIds.length, 1);
      assert.match(applied.volumeIds[0], /^nuclear-volume:fixture\.volume\.ct-axial:/);

      const [layer] = applied.layers;
      assert.deepEqual(layer.properties.voiRange, { lower: -1000, upper: 1000 });
      assert.equal(layer.properties.colormap.name, 'Grayscale');
      assert.equal(layer.properties.colormap.opacity, 1);
      assert.equal(layer.properties.invert, false);
      assert.equal(layer.properties.interpolationType, 1);
      assert.equal(applied.blendMode, 'COMPOSITE');
      assert.equal(applied.slabThicknessMm, undefined);
      assert.deepEqual(applied.requestedOrientation, {
        viewPlaneNormal: [0, 0, 1],
        viewUp: [0, 1, 0],
      });
      assertComponentsNear(applied.camera.viewPlaneNormal, [0, 0, 1], 'camera.viewPlaneNormal');
      assertComponentsNear(applied.camera.viewUp, [0, 1, 0], 'camera.viewUp');
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('3. a different-Frame-of-Reference CT+PET fusion is refused with VIEW_TRANSFORM_UNSUPPORTED despite a valid transform', async () => {
    const harness = await createRendererHarness({ entryPath: APPLICATION_ENTRY_PATH });
    try {
      const ack = await callProbe(harness.page, 'applyFusion', [
        { ct: readFixture('ct-axial'), pet: readFixture('pt-axial') },
      ]);
      assert.equal(ack.ok, false, describeAck(ack));
      assert.equal(ack.code, 'VIEW_TRANSFORM_UNSUPPORTED', describeAck(ack));
      assert.match(ack.message ?? '', /misaligned/, 'the refusal must explain the misalignment risk');
      assert.equal(ack.actorCount, 0, 'a refused fusion must not set any volume');
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  for (const { scenario, code } of SCENARIOS) {
    it(`4.${scenario} refuses with ${code} and leaves the viewport unmodified`, async () => {
      const harness = await createRendererHarness({ entryPath: APPLICATION_ENTRY_PATH });
      try {
        const ack = await callProbe(harness.page, 'negative', [
          { ct: readFixture('ct-axial'), pet: readFixture('pt-axial') },
          scenario,
        ]);
        assert.equal(ack.ok, false, `scenario '${scenario}' must fail closed`);
        assert.equal(ack.code, code, describeAck(ack));
        assert.equal(ack.actorCount, 0, `scenario '${scenario}' must not set any volume`);
        assert.deepEqual(harness.pageErrors, []);
        assert.deepEqual(harness.consoleErrors, []);
      } finally {
        await harness.close();
      }
    });
  }

  it('5. a MIP plan with a 12 mm slab applies MAXIMUM_INTENSITY_BLEND and reads the slab back from the viewport', async () => {
    const harness = await createRendererHarness({ entryPath: APPLICATION_ENTRY_PATH });
    try {
      const ack = await callProbe(harness.page, 'applyCt', [
        readFixture('ct-axial'),
        'gray',
        SLAB_THICKNESS_MM,
      ]);
      assert.equal(ack.ok, true, describeAck(ack));
      const applied = ack.applied as AppliedState;
      assert.equal(applied.blendMode, 'MAXIMUM_INTENSITY_BLEND');
      assert.equal(
        applied.slabThicknessMm,
        SLAB_THICKNESS_MM,
        'slab thickness must be observed from the viewport, not echoed from the plan',
      );
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });
});
