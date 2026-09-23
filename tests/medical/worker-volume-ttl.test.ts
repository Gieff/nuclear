/**
 * NuClear 2B.3b — bridge hydration refuses publication-expired handles.
 *
 * Split from `worker-volume.test.ts` (Rule 02 File Length Gate): the real
 * worker → bridge integration for the ADR-013 §7 publication-anchored TTL. With
 * an injected `volumeClock` past the worker descriptor's `publishedAt +
 * ttlSeconds`, `hydrateVolume` must refuse before any byte is returned while
 * still releasing the known handle. No `view-engine` import is involved.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import type { ImagingAsset, ValueSemantics } from '../../packages/shared-types/src/index.js';
import type { WorkerGeometryComputed } from '../../packages/medical-engine/src/worker/types.ts';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const {
  ScientificWorkerBridge,
  WorkerVolumeTransportError,
  mapGeometryResult,
} = await import('../../packages/medical-engine/src/index.js');
const { volumeHydrationRequest } = await import(
  '../../packages/medical-engine/src/renderer/volume-hydration.ts'
);

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PYTHON = join(ROOT, 'python/worker/.venv/bin/python');
const CT_DIR = join(ROOT, 'tests/rendering/fixtures/volumes/ct-axial');
const TTL_SECONDS = 300;

interface CtFixture {
  assetId: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  frameOfReferenceUID: string;
  modality: string;
  kind: string;
  instanceCount: number;
}
interface CtFingerprint {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  instanceCount: number;
  contentDigest: string;
  geometricDigest: string;
  totalBytes: number;
}
interface CtPixels {
  rescale: { slope: number; intercept: number };
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(CT_DIR, name), 'utf8')) as T;
}

function computedGeometry(): WorkerGeometryComputed {
  const mapped = mapGeometryResult(readJson<unknown>('expected-geometry.json'));
  if (mapped.status !== 'computed') throw new Error(`geometry is '${mapped.status}'`);
  return mapped;
}

function ctAsset(geometry: WorkerGeometryComputed): ImagingAsset {
  const fixture = readJson<CtFixture>('fixture.json');
  const fingerprint = readJson<CtFingerprint>('expected-fingerprint.json');
  const pixels = readJson<CtPixels>('pixels.json');
  const valueSemantics: ValueSemantics = { type: 'hounsfield', unit: 'HU' };
  return {
    id: fixture.assetId,
    studyInstanceUID: fixture.studyInstanceUID,
    seriesInstanceUID: fixture.seriesInstanceUID,
    sourceLocator: { kind: 'local-folder', path: join(CT_DIR, 'instances') },
    sourceFingerprint: {
      studyInstanceUID: fixture.studyInstanceUID,
      seriesInstanceUID: fixture.seriesInstanceUID,
      instanceCount: fingerprint.instanceCount,
      contentDigest: fingerprint.contentDigest,
      geometricDigest: fingerprint.geometricDigest,
      totalBytes: fingerprint.totalBytes,
    },
    modality: fixture.modality,
    kind: fixture.kind,
    geometry: geometry.assetGeometry,
    frameOfReferenceUID: fixture.frameOfReferenceUID,
    metadata: {
      instanceCount: fixture.instanceCount,
      rescaleSlope: pixels.rescale.slope,
      rescaleIntercept: pixels.rescale.intercept,
    },
    valueSemantics,
  } as ImagingAsset;
}

describe('NuClear 2B.3b — publication-expired handle refusal', () => {
  it('refuses before bytes when the injected clock is past publishedAt + TTL', async () => {
    assert.ok(existsSync(PYTHON), `worker venv python not found at ${PYTHON}`);
    const beyond = Date.now() + TTL_SECONDS * 1000 + 60_000;
    const bridge = new ScientificWorkerBridge({
      command: PYTHON,
      args: ['-m', 'worker'],
      cwd: ROOT,
      requestTimeoutMs: 30_000,
      handshakeTimeoutMs: 30_000,
      volumeClock: () => beyond,
    });
    const released: string[] = [];
    const target = bridge as unknown as { releaseVolume: (handle: string) => Promise<void> };
    const release = target.releaseVolume.bind(bridge);
    target.releaseVolume = async (handle: string): Promise<void> => {
      released.push(handle);
      await release(handle);
    };
    try {
      await bridge.start();
      const evidence = computedGeometry();
      const asset = ctAsset(evidence);
      await assert.rejects(
        bridge.hydrateVolume(volumeHydrationRequest(asset, evidence)),
        (error: unknown) =>
          error instanceof WorkerVolumeTransportError && error.failure === 'handle-expired',
      );
      assert.equal(released.length, 1, 'the known handle must still be released');
      assert.match(released[0], /^[0-9a-f]{32}$/);
    } finally {
      await bridge.stop();
    }
  });
});
