/**
 * NuClear 2B.3b — real worker → bridge → engine PET (`rescaled-bqml`) evidence.
 *
 * Closes the `rescaled-bqml` branch of the volume-hydration review: it spawns
 * the real Python worker, hydrates the committed synthetic PT volume over real
 * JSON-RPC, and proves the exact `rescaled-bqml` descriptor (dtype, rescale,
 * byteLength, content hash against the committed payload, correlation and
 * geometric digest) plus the exact resulting `VolumeIngestionPlan` geometry,
 * scalar domain and scalar array. It also covers the worker's fail-closed
 * fingerprint refusal and the OD-F declared-domain ↔ `valueSemantics`
 * coherence rule for the PET branch. No `view-engine`, UI or Cornerstone import
 * is involved anywhere in this chain.
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
  NUCLEAR_VOLUME_FINGERPRINT_MISMATCH,
  ScientificWorkerBridge,
  VOLUME_RELEASE_METHOD,
  WorkerProtocolError,
  buildHydratedVolumeIngestionPlan,
  mapGeometryResult,
  sha256ContentHash,
  volumeHydrationRequest,
} = await import('../../packages/medical-engine/src/index.js');
const { VolumeIngestionError } = await import(
  '../../packages/medical-engine/src/renderer/volume-errors.ts'
);

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PYTHON = join(ROOT, 'python/worker/.venv/bin/python');
const PT_DIR = join(ROOT, 'tests/rendering/fixtures/volumes/pt-axial');

interface PtFixture {
  assetId: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  frameOfReferenceUID: string;
  modality: string;
  kind: string;
  instanceCount: number;
}
interface PtFingerprint {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  instanceCount: number;
  contentDigest: string;
  geometricDigest: string;
  sopInstanceUIDsHash: string;
  totalBytes: number;
}
interface PtPixels {
  values: string;
  rescale: { slope: number; intercept: number };
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(PT_DIR, name), 'utf8')) as T;
}

function computedGeometry(): WorkerGeometryComputed {
  const mapped = mapGeometryResult(readJson<unknown>('expected-geometry.json'));
  if (mapped.status !== 'computed') throw new Error(`geometry is '${mapped.status}'`);
  return mapped;
}

function ptAsset(geometry: WorkerGeometryComputed): ImagingAsset {
  const fixture = readJson<PtFixture>('fixture.json');
  const fingerprint = readJson<PtFingerprint>('expected-fingerprint.json');
  const pixels = readJson<PtPixels>('pixels.json');
  const valueSemantics: ValueSemantics = { type: 'activity-concentration', unit: 'Bq/mL' };
  return {
    id: fixture.assetId,
    studyInstanceUID: fixture.studyInstanceUID,
    seriesInstanceUID: fixture.seriesInstanceUID,
    sourceLocator: { kind: 'local-folder', path: join(PT_DIR, 'instances') },
    sourceFingerprint: {
      studyInstanceUID: fixture.studyInstanceUID,
      seriesInstanceUID: fixture.seriesInstanceUID,
      instanceCount: fingerprint.instanceCount,
      contentDigest: fingerprint.contentDigest,
      geometricDigest: fingerprint.geometricDigest,
      sopInstanceUIDsHash: fingerprint.sopInstanceUIDsHash,
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

/**
 * The committed PT fixture stores its already-rescaled Bq/mL values as
 * little-endian float32 — exactly the representation the worker declares
 * (`scalarDataDomain: 'rescaled-bqml'`, dtype float32). The transport payload
 * must therefore be byte-identical to these committed bytes; no second rescale
 * is applied here.
 */
function committedPayload(): Buffer {
  return Buffer.from(readJson<PtPixels>('pixels.json').values, 'base64');
}

function expectedScalar(): Float32Array {
  const bytes = committedPayload();
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function newBridge(): InstanceType<typeof ScientificWorkerBridge> {
  assert.ok(existsSync(PYTHON), `worker venv python not found at ${PYTHON}`);
  return new ScientificWorkerBridge({
    command: PYTHON,
    args: ['-m', 'worker'],
    cwd: ROOT,
    requestTimeoutMs: 30_000,
    handshakeTimeoutMs: 30_000,
  });
}

async function withBridge(
  run: (bridge: InstanceType<typeof ScientificWorkerBridge>) => Promise<void>,
): Promise<void> {
  const bridge = newBridge();
  try {
    await run(bridge);
  } finally {
    await bridge.stop();
  }
}

describe('NuClear 2B.3b — real worker PT (rescaled-bqml) hydration', () => {
  it('hydrates pt-axial as rescaled-bqml and builds the plan with exact bytes', async () => {
    await withBridge(async (bridge) => {
      await bridge.start();
      const evidence = computedGeometry();
      const asset = ptAsset(evidence);
      const fixture = readJson<PtFixture>('fixture.json');
      const fingerprint = readJson<PtFingerprint>('expected-fingerprint.json');

      const hydrated = await bridge.hydrateVolume(volumeHydrationRequest(asset, evidence));
      const { descriptor, scalarData } = hydrated;

      // Declared transport format: rescaled Bq/mL float32.
      assert.equal(descriptor.dtype, 'float32');
      assert.equal(descriptor.signedness, 'not-applicable');
      assert.equal(descriptor.samplesPerPixel, 1);
      assert.equal(descriptor.scalarDataDomain, 'rescaled-bqml');
      assert.deepEqual([...descriptor.dimensions], [4, 4, 3]);
      assert.equal(descriptor.byteLength, 192);
      assert.equal(descriptor.byteLength, 48 * Float32Array.BYTES_PER_ELEMENT);
      assert.deepEqual(descriptor.rescale, { slope: 1000, intercept: 0 });

      // Exact integrity evidence against the committed payload and fingerprint.
      assert.equal(descriptor.contentHash, sha256ContentHash(committedPayload()));
      assert.equal(descriptor.geometricDigest, evidence.geometricDigest);
      assert.equal(descriptor.geometricDigest, fingerprint.geometricDigest);
      assert.equal(descriptor.correlation.studyInstanceUID, fixture.studyInstanceUID);
      assert.equal(descriptor.correlation.seriesInstanceUID, fixture.seriesInstanceUID);
      assert.equal(descriptor.correlation.instanceCount, fingerprint.instanceCount);
      assert.equal(descriptor.correlation.contentDigest, fingerprint.contentDigest);
      assert.equal(descriptor.correlation.geometricDigest, fingerprint.geometricDigest);
      assert.equal(descriptor.correlation.sopInstanceUIDsHash, fingerprint.sopInstanceUIDsHash);
      assert.equal(descriptor.correlation.frameOfReferenceUID, fixture.frameOfReferenceUID);
      assert.equal(descriptor.correlation.totalBytes, fingerprint.totalBytes);

      // Exact typed scalar values against the committed pixels fixture.
      assert.ok(scalarData instanceof Float32Array);
      assert.equal(scalarData.length, 48);
      assert.equal(scalarData[0], 100000);
      assert.equal(scalarData[47], 147000);
      assert.deepEqual([...scalarData], [...expectedScalar()]);

      const plan = buildHydratedVolumeIngestionPlan(
        asset,
        { state: 'online' },
        { supported: true, modality: 'PT', reason: null },
        evidence,
        hydrated,
      );
      assert.equal(plan.scalarData, scalarData, 'plan must carry the exact hydrated array');
      assert.equal(plan.scalarDataDomain, 'rescaled-bqml');
      assert.deepEqual([...plan.dimensions], [4, 4, 3]);
      assert.deepEqual([...plan.spacing], [0.5, 0.5, 2]);
      assert.deepEqual([...plan.origin], [0, 0, 0]);
      assert.deepEqual([...plan.direction], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
      assert.deepEqual([...plan.scalarData], [...expectedScalar()]);
      assert.equal(plan.provenance.geometricDigest, evidence.geometricDigest);
      assert.equal(plan.provenance.workerModality, 'PT');
      assert.equal(plan.volumeId, `nuclear-volume:${asset.id}:${evidence.geometricDigest}`);
      assert.equal(plan.metadata.Modality, 'PT');
      assert.equal(plan.metadata.PixelRepresentation, 0, 'float payloads use unsigned convention');

      // The bridge released the handle in `finally`.
      const release = (await bridge.request(VOLUME_RELEASE_METHOD, {
        handle: descriptor.handle,
      })) as { status: string };
      assert.equal(release.status, 'noop');
    });
  });

  it('propagates the worker fingerprint refusal closed for the PET series', async () => {
    await withBridge(async (bridge) => {
      await bridge.start();
      const evidence = computedGeometry();
      const asset = ptAsset(evidence);
      const tampered: ImagingAsset = {
        ...asset,
        sourceFingerprint: { ...asset.sourceFingerprint, contentDigest: `sha256:${'0'.repeat(64)}` },
      };
      await assert.rejects(
        bridge.hydrateVolume(volumeHydrationRequest(tampered, evidence)),
        (error: unknown) =>
          error instanceof WorkerProtocolError &&
          error.code === NUCLEAR_VOLUME_FINGERPRINT_MISMATCH &&
          error.data.reason === 'content-digest',
      );
    });
  });

  it('refuses a wrong expected SOP hash as a terminal series mismatch', async () => {
    await withBridge(async (bridge) => {
      await bridge.start();
      const evidence = computedGeometry();
      const asset = ptAsset(evidence);
      const wrong: ImagingAsset = {
        ...asset,
        sourceFingerprint: {
          ...asset.sourceFingerprint,
          sopInstanceUIDsHash: `sha256:${'0'.repeat(64)}`,
        },
      };
      await assert.rejects(
        bridge.hydrateVolume(volumeHydrationRequest(wrong, evidence)),
        (error: unknown) =>
          error instanceof WorkerProtocolError &&
          error.code === NUCLEAR_VOLUME_FINGERPRINT_MISMATCH &&
          error.data.reason === 'series',
      );
    });
  });

  it('refuses a PET plan whose valueSemantics contradict rescaled-bqml (OD-F)', async () => {
    await withBridge(async (bridge) => {
      await bridge.start();
      const evidence = computedGeometry();
      const asset = ptAsset(evidence);
      const hydrated = await bridge.hydrateVolume(volumeHydrationRequest(asset, evidence));
      const mismatched: ImagingAsset = {
        ...asset,
        valueSemantics: { type: 'hounsfield', unit: 'HU' },
      };
      assert.throws(
        () =>
          buildHydratedVolumeIngestionPlan(
            mismatched,
            { state: 'online' },
            { supported: true, modality: 'PT', reason: null },
            evidence,
            hydrated,
          ),
        (error: unknown) =>
          error instanceof VolumeIngestionError &&
          error.code === 'VOLUME_SCALAR_SEMANTICS_DISAGREEMENT',
      );
    });
  });
});
