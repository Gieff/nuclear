/**
 * NuClear P3.2.1 — typed local-volume construction failure and residual cleanup.
 *
 * Drives the real `CornerstoneRendererAdapter.loadVolume` in the controlled
 * WebGL 2 harness while the browser entry substitutes the local-volume
 * constructor with a throwing implementation. Proves that a Cornerstone
 * construction failure becomes `VOLUME_CONSTRUCTION_FAILED`, that the original
 * cause is preserved, and that the binding removes any residual cache entry.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';

import { createRendererHarness } from './fixtures/renderer-harness.mjs';

const VOLUME_ENTRY_PATH = fileURLToPath(new URL('./fixtures/volume-entry.ts', import.meta.url));

type FixtureName = 'ct-axial' | 'pt-axial';

interface FixtureFiles {
  fixture: Record<string, unknown>;
  pixels: Record<string, unknown>;
  expectedGeometry: Record<string, unknown>;
}

interface ConstructionAck {
  ok?: boolean;
  name?: string;
  code?: string;
  message?: string;
  causeMessage?: string;
  residualCached?: boolean;
  registeredDuringInjection?: boolean;
}

function readJson(path: URL): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function readFixture(name: FixtureName): FixtureFiles {
  const dir = new URL(`./fixtures/volumes/${name}/`, import.meta.url);
  return {
    fixture: readJson(new URL('fixture.json', dir)),
    pixels: readJson(new URL('pixels.json', dir)),
    expectedGeometry: readJson(new URL('expected-geometry.json', dir)),
  };
}

function inject(page: Page, method: string, files: FixtureFiles): Promise<ConstructionAck> {
  return page.evaluate(
    ({ name, value }: { name: string; value: unknown }) => {
      const scope = globalThis as unknown as {
        __nuclearVolumeProbe?: Record<string, (input: unknown) => unknown>;
      };
      const probe = scope.__nuclearVolumeProbe;
      if (!probe) {
        throw new Error('__nuclearVolumeProbe is not installed');
      }
      return probe[name](value);
    },
    { name: method, value: files },
  ) as Promise<ConstructionAck>;
}

describe('NuClear P3.2.1 — typed construction failures', () => {
  it('maps a createLocalVolume failure to VOLUME_CONSTRUCTION_FAILED with the cause preserved', async () => {
    const harness = await createRendererHarness({ entryPath: VOLUME_ENTRY_PATH });
    try {
      const ack = await inject(harness.page, 'loadWithThrowingConstruction', readFixture('ct-axial'));
      assert.equal(ack.ok, false);
      assert.equal(ack.name, 'VolumeIngestionError');
      assert.equal(ack.code, 'VOLUME_CONSTRUCTION_FAILED');
      assert.match(String(ack.causeMessage), /injected failure: createLocalVolume refused the payload/);
      assert.equal(ack.residualCached, false, 'no residual cache entry may remain');
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('removes a volume registered before the construction failure', async () => {
    const harness = await createRendererHarness({ entryPath: VOLUME_ENTRY_PATH });
    try {
      const ack = await inject(harness.page, 'loadWithResidualConstruction', readFixture('ct-axial'));
      assert.equal(ack.ok, false);
      assert.equal(ack.code, 'VOLUME_CONSTRUCTION_FAILED');
      assert.equal(ack.registeredDuringInjection, true, 'the injected constructor must register a volume');
      assert.equal(ack.residualCached, false, 'the binding must remove the residual cache entry');
      assert.match(
        String(ack.causeMessage),
        /injected failure: createLocalVolume registered the volume then failed/,
      );
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });
});
