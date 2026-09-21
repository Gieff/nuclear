/**
 * NuClear P3.4-B.2.2.5 — positive same-Frame-of-Reference CT+PET fusion.
 *
 * The committed `pt-axial-coreg` fixture shares the CT's Study and Frame of
 * Reference (its own series) with `rescaled-bqml` pixels, so no spatial
 * transform is needed or supplied. This suite loads it beside `ct-axial`,
 * compiles a real fusion `MedicalViewState` with the committed SUVbw factor
 * (read from `expected-quantitation.json` and injected into the probe) and
 * asserts the actual Cornerstone read-back. It is the real-harness complement
 * to the pure fusion compiler suite and the different-Frame-of-Reference
 * refusal in `view-application.test.ts`.
 */

import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import { createRendererHarness } from './fixtures/renderer-harness.mjs';
import {
  APPLICATION_ENTRY_PATH,
  assertNear,
  callProbe,
  describeAck,
  readExpectedQuantitation,
  readFixture,
} from './fixtures/application-test-support.ts';
import type { AppliedState } from './fixtures/application-test-support.ts';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const { CANONICAL_PET_FUSION_EXPONENT, getPETOpacityMapping } = await import(
  '../../packages/rendering-presets/src/radiometry.ts'
);
const { suvRangeToBqml } = await import(
  '../../packages/medical-engine/src/radiometry/pet-binding.ts'
);

/** Committed declared SUV window for the fusion overlay. */
const SUV_RANGE = [0, 8] as const;

describe('NuClear P3.4-B.2.2.5 — co-referenced CT+PET fusion application', () => {
  it('1. a same-Frame-of-Reference CT+PET fusion sets both actors and reads back the PET palette, range, opacity and mapping', async () => {
    const harness = await createRendererHarness({ entryPath: APPLICATION_ENTRY_PATH });
    try {
      const suvFactor = readExpectedQuantitation('pt-axial-coreg').suvFactor;
      const ack = await callProbe(harness.page, 'applyCoregFusion', [
        { ct: readFixture('ct-axial'), pet: readFixture('pt-axial-coreg'), suvFactor },
      ]);
      assert.equal(ack.ok, true, describeAck(ack));
      const applied = ack.applied as AppliedState;
      assert.equal(applied.viewId, 'view-fusion');
      assert.equal(applied.layers.length, 2);
      assert.equal(ack.actorCount, 2, 'both the CT base and the PET overlay actors must be set');
      assert.equal(applied.blendMode, 'COMPOSITE');

      const [ctLayer, petLayer] = applied.layers;
      assert.equal(ctLayer.assetId, 'fixture.volume.ct-axial');
      assert.equal(ctLayer.properties.colormap.name, 'Grayscale');
      assert.equal(petLayer.assetId, 'fixture.volume.pt-axial-coreg');
      assert.equal(petLayer.properties.colormap.name, 'PET');

      const [lower, upper] = suvRangeToBqml([SUV_RANGE[0], SUV_RANGE[1]], suvFactor);
      assertNear(petLayer.properties.voiRange.lower, lower, 1e-6, 'PET voiRange.lower');
      assertNear(petLayer.properties.voiRange.upper, upper, 1e-6, 'PET voiRange.upper');
      assertNear(
        petLayer.properties.colormap.opacity,
        Math.pow(0.5, CANONICAL_PET_FUSION_EXPONENT),
        1e-12,
        'PET fusion opacity',
      );

      const mapping = petLayer.properties.colormap.opacityMapping;
      assert.ok(
        mapping !== undefined && mapping.length > 0,
        'the fusion overlay must carry an opacity mapping',
      );
      assert.deepEqual(
        mapping,
        getPETOpacityMapping(lower, upper, 0, 1, 'highlighted'),
        'the read-back PET opacity mapping must equal getPETOpacityMapping for the committed factor',
      );

      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });
});
