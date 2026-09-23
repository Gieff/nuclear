/**
 * NuClear P5.5b — real-harness evidence for the publication renderer port.
 *
 * The controlled WebGL 2 harness bundles `fixtures/publication-entry.ts`, which
 * wires a `PublicationRendererPort` implementation to the real
 * `captureTemporaryRenderTarget` and runs the whole `renderLivePublication`
 * orchestration. These tests assert a native panel-aperture raster and live
 * canvas invariance, plus fail-closed on an unavailable source.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRendererHarness } from './fixtures/renderer-harness.mjs';
import { readFixture } from './fixtures/application-test-support.ts';
import {
  PUBLICATION_ENTRY_PATH,
  callPublicationProbe,
  describePublicationAck,
} from './fixtures/publication-test-support.ts';

const PANEL_600_DPI_PIXELS = 1890 * 1890;

describe('NuClear P5.5b — live publication renderer port', () => {
  it('1. captures an 80x80 mm panel at 600 DPI through the real port and leaves the live canvas invariant', async () => {
    const harness = await createRendererHarness({ entryPath: PUBLICATION_ENTRY_PATH });
    try {
      const ack = await callPublicationProbe(harness.page, 'renderPublicationPanel', [
        { ct: readFixture('ct-axial'), widthMm: 80, heightMm: 80, dpi: 600 },
      ]);
      assert.equal(ack.ok, true, describePublicationAck(ack));

      assert.equal(ack.renderMode, 'live-medical');
      assert.equal(ack.renderStateHash, 'sha256:harness-live');
      assert.equal(ack.panels?.length, 1);

      const panel = ack.panels?.[0];
      assert.ok(panel, 'a successful render must return the panel');
      assert.equal(panel.panelId, 'panel-ct');
      assert.deepEqual(panel.pixelDimensions, [1890, 1890]);
      assert.equal(panel.byteLength, PANEL_600_DPI_PIXELS * 4);
      assert.equal(panel.colorProfile, 'srgb');

      // The live interactive surface is never resized, re-camerad or mutated.
      assert.deepEqual(ack.after?.elementSizePx, ack.before?.elementSizePx);
      assert.deepEqual(ack.after?.canvasSizePx, ack.before?.canvasSizePx);
      assert.deepEqual(ack.after?.camera, ack.before?.camera);
      assert.equal(ack.after?.actorCount, ack.before?.actorCount);
      assert.deepEqual(ack.after?.aspectRatio, ack.before?.aspectRatio);
      // The temporary target engine/container is fully disposed after the run.
      assert.equal(ack.targetContainersAfter, 0);

      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('2. fails closed on an unavailable source without capturing', async () => {
    const harness = await createRendererHarness({ entryPath: PUBLICATION_ENTRY_PATH });
    try {
      const ack = await callPublicationProbe(harness.page, 'renderPublicationPanel', [
        { ct: readFixture('ct-axial'), widthMm: 80, heightMm: 80, dpi: 600, availability: 'missing' },
      ]);
      assert.equal(ack.ok, false);
      assert.equal(ack.code, 'FIGURE_PUBLICATION_RENDER_UNAVAILABLE');
      assert.equal(ack.panels, undefined);

      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });
});
