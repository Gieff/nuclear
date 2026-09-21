/**
 * NuClear P3.3-B — real Cornerstone residency evidence.
 *
 * The controlled WebGL 2 harness bundles `fixtures/residency-entry.ts`, which
 * starts the real adapter, builds the real Cornerstone residency backend and
 * drives the pure `ResourceManager` over the real `cache`. These tests assert
 * the physical outcomes the manager reports: shared volumes stay resident until
 * the last lease releases, eviction leaves no residual cache entry, reload
 * reconstructs the same `volumeId`, a fusion isolates CT from PET, and every
 * non-online availability refuses without creating a live volume.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';

import { createRendererHarness } from './fixtures/renderer-harness.mjs';

const RESIDENCY_ENTRY_PATH = fileURLToPath(new URL('./fixtures/residency-entry.ts', import.meta.url));

type FixtureName = 'ct-axial' | 'pt-axial';

interface FixtureFiles {
  fixture: Record<string, unknown>;
  pixels: Record<string, unknown>;
  expectedGeometry: Record<string, unknown>;
}

interface ResidencyAck {
  ok?: boolean;
  name?: string;
  code?: string;
  message?: string;
  volumeId?: string;
  reloadedVolumeId?: string;
  tier?: string;
  ctTier?: string;
  petTier?: string;
  cacheVolumeIds?: string[];
  residualCacheVolumeIds?: string[];
  acquired?: boolean;
  released?: boolean;
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

async function callProbe(
  page: Page,
  name: string,
  value: unknown,
  state?: string,
): Promise<ResidencyAck> {
  return page.evaluate(
    ({
      probeName,
      probeValue,
      probeState,
    }: {
      probeName: string;
      probeValue: unknown;
      probeState?: string;
    }) => {
      const scope = globalThis as unknown as {
        __nuclearResidencyProbe?: Record<string, (v: unknown, s?: string) => unknown>;
      };
      const probe = scope.__nuclearResidencyProbe;
      if (!probe) {
        throw new Error('__nuclearResidencyProbe is not installed');
      }
      return probe[probeName](probeValue, probeState);
    },
    { probeName: name, probeValue: value, probeState: state },
  ) as Promise<ResidencyAck>;
}

function describeAck(ack: ResidencyAck): string {
  return `${ack.name ?? ''} ${ack.code ?? ''} ${ack.message ?? ''}`.trim();
}

describe('NuClear P3.3-B — Cornerstone residency backend', () => {
  it('1. two consumers share one real volume and eviction waits for both releases', async () => {
    const harness = await createRendererHarness({ entryPath: RESIDENCY_ENTRY_PATH });
    try {
      const ack = await callProbe(harness.page, 'share', readFixture('ct-axial'));
      assert.equal(ack.ok, true, describeAck(ack));
      assert.equal(ack.tier, 'gpu-ready', 'one live lease must keep the volume staged');
      assert.deepEqual(ack.cacheVolumeIds, [ack.volumeId], 'the shared volume must stay cached');
      assert.deepEqual(ack.residualCacheVolumeIds, [], 'the second release must evict it');
      assert.equal(ack.released, true, 'the second release must confirm eviction');
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('2. reload after confirmed eviction yields the same volumeId cached again', async () => {
    const harness = await createRendererHarness({ entryPath: RESIDENCY_ENTRY_PATH });
    try {
      const ack = await callProbe(harness.page, 'reload', readFixture('ct-axial'));
      assert.equal(ack.ok, true, describeAck(ack));
      assert.equal(ack.acquired, true, 'the first demand must reach gpu-ready');
      assert.equal(ack.released, true, 'eviction must be confirmed');
      assert.deepEqual(ack.residualCacheVolumeIds, [], 'eviction must leave no residual entry');
      assert.equal(ack.reloadedVolumeId, ack.volumeId, 'the reloaded volumeId must be identical');
      assert.deepEqual(ack.cacheVolumeIds, [ack.volumeId], 'the cache must hold the reloaded volume');
      assert.equal(ack.tier, 'gpu-ready');
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('3. a fusion evicts CT only and leaves PET resident', async () => {
    const harness = await createRendererHarness({ entryPath: RESIDENCY_ENTRY_PATH });
    try {
      const ack = await callProbe(harness.page, 'fusion', {
        ct: readFixture('ct-axial'),
        pet: readFixture('pt-axial'),
      });
      assert.equal(ack.ok, true, describeAck(ack));
      assert.equal(ack.ctTier, 'evicted');
      assert.equal(ack.petTier, 'gpu-ready');
      assert.equal(ack.cacheVolumeIds?.length, 1, 'only the PET volume may remain cached');
      assert.equal(
        ack.cacheVolumeIds?.some((id) => id.includes('pt-axial')),
        true,
        'PET must remain cache-resident',
      );
      assert.equal(
        ack.cacheVolumeIds?.some((id) => id.includes('ct-axial')),
        false,
        'CT must be evicted',
      );
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('4. missing, mismatch and offline-cached refuse and leave the cache empty', async () => {
    const harness = await createRendererHarness({ entryPath: RESIDENCY_ENTRY_PATH });
    try {
      const files = readFixture('ct-axial');
      for (const state of ['missing', 'mismatch', 'offline-cached'] as const) {
        const ack = await callProbe(harness.page, 'availability', files, state);
        assert.equal(ack.ok, false, `availability '${state}' must fail closed`);
        assert.equal(ack.code, 'RESIDENCY_SOURCE_UNAVAILABLE');
        assert.deepEqual(ack.cacheVolumeIds, [], `availability '${state}' must not create a volume`);
      }
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });
});
