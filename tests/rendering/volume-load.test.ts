/**
 * NuClear P3.2 — real Cornerstone volume load from committed CT/PT fixtures.
 *
 * The controlled WebGL 2 harness bundles `fixtures/volume-entry.ts`, which
 * imports the real adapter and the real Node-safe planner. The Node test only
 * ships the raw fixture JSON and compares the Cornerstone-observed result with
 * the committed worker geometry. No geometry is re-derived here.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';

import { createRendererHarness } from './fixtures/renderer-harness.mjs';

const VOLUME_ENTRY_PATH = fileURLToPath(new URL('./fixtures/volume-entry.ts', import.meta.url));

/**
 * Cornerstone's `indexToWorld` uses gl-matrix Float32 matrices, while the
 * worker emits float64 LPS values, so exact decimal equality is not defensible.
 * 1e-6 mm is four orders of magnitude below the fixture's 0.5 mm spacing.
 */
const WORKER_WORLD_TOLERANCE_MM = 1e-6;

type FixtureName = 'ct-axial' | 'pt-axial';

interface FixtureFiles {
  fixture: Record<string, unknown>;
  pixels: Record<string, unknown>;
  expectedGeometry: Record<string, unknown>;
}

interface VolumeEvidence {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  declaredScalarDataDomain?: string;
  volumeId?: string;
  scalarLength?: number;
  cornerDimensions?: number[];
  cornerSpacing?: number[];
  cornerOrigin?: number[];
  cornerDirection?: number[];
  sliceOneWorld?: number[];
  firstCornerWorld?: number[];
  lastCornerWorld?: number[];
  worldBounds?: number[];
  firstScalar?: number;
  lastScalar?: number;
  metadata?: {
    BitsAllocated: number;
    BitsStored: number;
    PixelRepresentation: number;
    SamplesPerPixel: number;
    PixelSpacing: number[];
    ImageOrientationPatient: number[];
  };
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

/** Decodes the committed payload to compare Cornerstone's scalars exactly. */
function expectedScalars(pixels: Record<string, unknown>): number[] {
  const bytes = Buffer.from(String(pixels.values), 'base64');
  const dtype = String(pixels.dtype);
  const out: number[] = [];
  if (dtype === 'int16') {
    for (let i = 0; i < bytes.length / 2; i += 1) out.push(bytes.readInt16LE(i * 2));
  } else if (dtype === 'float32') {
    for (let i = 0; i < bytes.length / 4; i += 1) out.push(bytes.readFloatLE(i * 4));
  } else {
    throw new Error(`unsupported fixture dtype '${dtype}'`);
  }
  return out;
}

interface WorkerGeometry {
  dimensions: number[];
  spacing: number[];
  origin: number[];
  direction: number[];
  sliceNormal: number[];
  slicePositionsLpsMm: number[][];
  bounds: { min: number[]; max: number[] };
  geometricDigest: string;
}

function workerGeometry(files: FixtureFiles): WorkerGeometry {
  return files.expectedGeometry.geometry as unknown as WorkerGeometry;
}

async function loadVolume(page: Page, files: FixtureFiles): Promise<VolumeEvidence> {
  return page.evaluate((input: unknown) => {
    const scope = globalThis as unknown as {
      __nuclearVolumeProbe?: { load(value: unknown): unknown };
    };
    const probe = scope.__nuclearVolumeProbe;
    if (!probe) {
      throw new Error('__nuclearVolumeProbe is not installed');
    }
    return probe.load(input);
  }, files) as Promise<VolumeEvidence>;
}

function assertNear(actual: number[] | undefined, expected: number[], label: string): void {
  assert.ok(actual, `${label}: missing`);
  assert.equal(actual.length, expected.length, `${label}: arity`);
  for (let i = 0; i < expected.length; i += 1) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= WORKER_WORLD_TOLERANCE_MM,
      `${label}[${i}]: ${actual[i]} != ${expected[i]} (tolerance ${WORKER_WORLD_TOLERANCE_MM} mm)`,
    );
  }
}

async function assertFixtureVolumeLoads(name: FixtureName, domain: string): Promise<void> {
  const files = readFixture(name);
  const geometry = workerGeometry(files);
  const expected = expectedScalars(files.pixels);
  const assetId = String(files.fixture.assetId);

  const harness = await createRendererHarness({ entryPath: VOLUME_ENTRY_PATH });
  try {
    const result = await loadVolume(harness.page, files);
    assert.equal(result.ok, true, `volume load failed: ${result.name ?? ''} ${result.code ?? ''} ${result.message ?? ''}`);

    // The declared radiometric domain is the P3.4 bridge; SUV is not converted here.
    assert.equal(result.declaredScalarDataDomain, domain);
    assert.equal(result.volumeId, `nuclear-volume:${assetId}:${geometry.geometricDigest}`);
    assert.equal(result.scalarLength, 48, 'scalar length must equal the fixture voxel count');

    // Cornerstone must expose exactly the worker geometry, with no adjustment.
    assert.deepEqual(result.cornerDimensions, geometry.dimensions);
    assert.deepEqual(result.cornerSpacing, geometry.spacing);
    assert.deepEqual(result.cornerOrigin, geometry.origin);
    assert.deepEqual(result.cornerDirection, [...geometry.direction, ...geometry.sliceNormal]);

    // Worker -> world through Cornerstone's own transform: normalized slice order.
    assertNear(result.sliceOneWorld, geometry.slicePositionsLpsMm[1], 'slice 1 world');
    assertNear(result.firstCornerWorld, geometry.bounds.min, 'first outer corner');
    assertNear(result.lastCornerWorld, geometry.bounds.max, 'last outer corner');
    assertNear(
      [result.worldBounds![0], result.worldBounds![2], result.worldBounds![4]],
      geometry.bounds.min,
      'world bounds min',
    );
    assertNear(
      [result.worldBounds![1], result.worldBounds![3], result.worldBounds![5]],
      geometry.bounds.max,
      'world bounds max',
    );

    // Scalar samples are the committed payload exactly (no rescale, no SUV).
    assert.equal(result.firstScalar, expected[0]);
    assert.equal(result.lastScalar, expected[expected.length - 1]);

    assert.equal(result.metadata?.SamplesPerPixel, files.pixels.samplesPerPixel);
    assert.equal(result.metadata?.BitsAllocated, files.pixels.bitsAllocated);
    assert.deepEqual(result.metadata?.ImageOrientationPatient, geometry.direction);

    assert.deepEqual(harness.pageErrors, []);
    assert.deepEqual(harness.consoleErrors, []);
  } finally {
    await harness.close();
  }
}

describe('NuClear P3.2 — Cornerstone volume loading', () => {
  it('loads the CT fixture with worker geometry, rescaled-HU domain and exact scalars', async () => {
    await assertFixtureVolumeLoads('ct-axial', 'rescaled-hu');
  });

  it('loads the PT fixture with rescaled-Bq/mL domain and exact Bq/mL scalars', async () => {
    await assertFixtureVolumeLoads('pt-axial', 'rescaled-bqml');
  });

  it('fails closed when the same volumeId is loaded twice', async () => {
    const harness = await createRendererHarness({ entryPath: VOLUME_ENTRY_PATH });
    try {
      const result = await harness.page.evaluate((input: unknown) => {
        const scope = globalThis as unknown as {
          __nuclearVolumeProbe?: { loadDuplicate(value: unknown): unknown };
        };
        return scope.__nuclearVolumeProbe?.loadDuplicate(input);
      }, readFixture('ct-axial'));
      const ack = result as { ok?: boolean; code?: string; message?: string };
      assert.equal(ack.ok, false, 'a duplicate volumeId must be refused');
      assert.equal(ack.code, 'VOLUME_PAYLOAD_INVALID');
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('releases a loaded volume and fails closed on an unknown id', async () => {
    const harness = await createRendererHarness({ entryPath: VOLUME_ENTRY_PATH });
    try {
      const probeCall = (method: 'release', argument: string) =>
        harness.page.evaluate(
          ({ name, value }: { name: string; value: string }) => {
            const scope = globalThis as unknown as {
              __nuclearVolumeProbe?: Record<string, (arg: string) => unknown>;
            };
            return scope.__nuclearVolumeProbe?.[name]?.(value);
          },
          { name: method, value: argument },
        );

      const files = readFixture('ct-axial');
      const loaded = await loadVolume(harness.page, files);
      assert.equal(loaded.ok, true);
      const volumeId = String(loaded.volumeId);

      const released = (await probeCall('release', volumeId)) as { ok?: boolean };
      assert.equal(released.ok, true, 'releaseVolume must remove a known volume');
      const again = (await probeCall('release', volumeId)) as { ok?: boolean; code?: string };
      assert.equal(again.ok, false, 'releasing an unknown volume must fail closed');
      assert.equal(again.code, 'VOLUME_PAYLOAD_INVALID');
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });
});
