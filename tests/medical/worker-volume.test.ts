/**
 * NuClear 2B.3b — real worker → bridge → engine volume hydration.
 *
 * Spawns the real Python worker, hydrates the committed synthetic CT volume over
 * real JSON-RPC, and proves the exact hash/length/fingerprint/geometricDigest and
 * the resulting `VolumeIngestionPlan` geometry and scalar data. Also covers the
 * worker's fail-closed fingerprint mismatch, OD-F scalar-domain coherence, the
 * release-after-hydration contract and a genuine cleanup failure. No `view-engine`
 * import is involved anywhere in this chain.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import type { ImagingAsset, ValueSemantics } from '../../packages/shared-types/src/index.js';
import type { WorkerGeometryComputed } from '../../packages/medical-engine/src/worker/types.ts';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const {
  DICOM_VOLUME_METHOD,
  NUCLEAR_VOLUME_CLEANUP_FAILED,
  NUCLEAR_VOLUME_FINGERPRINT_MISMATCH,
  ScientificWorkerBridge,
  VOLUME_RELEASE_METHOD,
  WorkerProtocolError,
  WorkerVolumeTransportError,
  mapGeometryResult,
  volumeRequestParams,
} = await import('../../packages/medical-engine/src/index.js');
const { VolumeIngestionError } = await import(
  '../../packages/medical-engine/src/renderer/volume-errors.ts'
);
const { buildHydratedVolumeIngestionPlan, volumeHydrationRequest } = await import(
  '../../packages/medical-engine/src/renderer/volume-hydration.ts'
);

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PYTHON = join(ROOT, 'python/worker/.venv/bin/python');
const CT_DIR = join(ROOT, 'tests/rendering/fixtures/volumes/ct-axial');

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
  sopInstanceUIDsHash: string;
  totalBytes: number;
}
interface CtPixels {
  values: string;
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

function expectedScalar(): Float32Array {
  // The committed CT fixture stores its already-rescaled HU values as int16
  // (`scalarDataDomain: 'rescaled-hu'`, slope 1 preserves them exactly). The
  // worker re-emits that same representation as the declared float32 payload, so
  // the transport payload must equal these values without any second rescale.
  const pixels = readJson<CtPixels>('pixels.json');
  const bytes = Buffer.from(pixels.values, 'base64');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const stored = new Int16Array(bytes.byteLength / 2);
  for (let index = 0; index < stored.length; index += 1) {
    stored[index] = view.getInt16(index * 2, true);
  }
  return Float32Array.from(stored);
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

async function withBridge(run: (bridge: InstanceType<typeof ScientificWorkerBridge>) => Promise<void>): Promise<void> {
  const bridge = newBridge();
  try {
    await run(bridge);
  } finally {
    await bridge.stop();
  }
}

describe('NuClear 2B.3b — raw worker → bridge → engine volume hydration', () => {
  it('advertises the additive volumeTransport capability', async () => {
    await withBridge(async (bridge) => {
      const handshake = await bridge.start();
      const capability = handshake.volumeTransport;
      assert.ok(capability, 'handshake must advertise capabilities.volumeTransport');
      assert.ok(capability.root.length > 0);
      assert.equal(capability.handleTtlSeconds, 300);
      assert.equal(capability.maxResidentPayloads, 2);
      assert.equal(capability.maxPayloadBytes, 1_073_741_824);
    });
  });

  it('hydrates the committed CT volume and builds the plan with exact bytes', async () => {
    await withBridge(async (bridge) => {
      await bridge.start();
      const evidence = computedGeometry();
      const asset = ctAsset(evidence);
      const hydrated = await bridge.hydrateVolume(volumeHydrationRequest(asset, evidence));
      const { descriptor, scalarData } = hydrated;

      assert.equal(descriptor.dtype, 'float32');
      assert.equal(descriptor.signedness, 'not-applicable');
      assert.equal(descriptor.scalarDataDomain, 'rescaled-hu');
      assert.deepEqual([...descriptor.dimensions], [4, 4, 3]);
      assert.equal(descriptor.byteLength, 192);
      assert.equal(descriptor.byteLength % 4, 0);
      assert.match(descriptor.contentHash, /^sha256:[0-9a-f]{64}$/);
      assert.equal(descriptor.geometricDigest, evidence.geometricDigest);
      assert.equal(descriptor.correlation.contentDigest, asset.sourceFingerprint.contentDigest);
      assert.equal(
        descriptor.correlation.sopInstanceUIDsHash,
        asset.sourceFingerprint.sopInstanceUIDsHash,
      );
      assert.equal(descriptor.correlation.frameOfReferenceUID, asset.frameOfReferenceUID);
      assert.deepEqual(descriptor.rescale, { slope: 1, intercept: -1024 });

      // The decoded payload matches the committed fixture scalars exactly.
      assert.ok(scalarData instanceof Float32Array);
      assert.deepEqual([...scalarData], [...expectedScalar()]);

      const plan = buildHydratedVolumeIngestionPlan(
        asset,
        { state: 'online' },
        { supported: true, modality: 'CT', reason: null },
        evidence,
        hydrated,
      );
      assert.equal(plan.scalarData, scalarData, 'plan must carry the exact hydrated array');
      assert.deepEqual([...plan.dimensions], [4, 4, 3]);
      assert.deepEqual([...plan.spacing], [0.5, 0.5, 2]);
      assert.deepEqual([...plan.origin], [0, 0, 0]);
      assert.deepEqual([...plan.direction], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
      assert.equal(plan.scalarDataDomain, 'rescaled-hu');
      assert.equal(plan.provenance.geometricDigest, evidence.geometricDigest);
      assert.equal(plan.volumeId, `nuclear-volume:${asset.id}:${evidence.geometricDigest}`);

      // The bridge released the handle in `finally`.
      const release = (await bridge.request(VOLUME_RELEASE_METHOD, {
        handle: descriptor.handle,
      })) as { status: string };
      assert.equal(release.status, 'noop');
    });
  });

  it('propagates the worker fingerprint refusal closed', async () => {
    await withBridge(async (bridge) => {
      await bridge.start();
      const evidence = computedGeometry();
      const asset = ctAsset(evidence);
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

  it('refuses an OD-F scalar-domain mismatch against asset.valueSemantics', async () => {
    await withBridge(async (bridge) => {
      await bridge.start();
      const evidence = computedGeometry();
      const asset = ctAsset(evidence);
      const hydrated = await bridge.hydrateVolume(volumeHydrationRequest(asset, evidence));
      const mismatched: ImagingAsset = {
        ...asset,
        valueSemantics: { type: 'raw-counts', unit: 'counts' },
      };
      assert.throws(
        () =>
          buildHydratedVolumeIngestionPlan(
            mismatched,
            { state: 'online' },
            { supported: true, modality: 'CT', reason: null },
            evidence,
            hydrated,
          ),
        (error: unknown) =>
          error instanceof VolumeIngestionError &&
          error.code === 'VOLUME_SCALAR_SEMANTICS_DISAGREEMENT',
      );
    });
  });

  it('surfaces a real cleanup failure and never reports it as success', async () => {
    await withBridge(async (bridge) => {
      await bridge.start();
      const evidence = computedGeometry();
      const asset = ctAsset(evidence);
      const request = volumeHydrationRequest(asset, evidence);

      // Real worker cleanup failure: replace the tracked payload with a directory
      // so `os.unlink` fails and the worker returns the retryable `-32018`.
      const capability = (await bridge.handshake()).volumeTransport;
      assert.ok(capability);
      const descriptor = (
        (await bridge.request(DICOM_VOLUME_METHOD, volumeRequestParams(request))) as {
          descriptor: { handle: string; fileName: string };
        }
      ).descriptor;
      const payloadPath = join(capability.root, descriptor.fileName);
      unlinkSync(payloadPath);
      mkdirSync(payloadPath);
      try {
        await assert.rejects(
          bridge.releaseVolume(descriptor.handle),
          (error: unknown) =>
            error instanceof WorkerProtocolError &&
            error.code === NUCLEAR_VOLUME_CLEANUP_FAILED &&
            error.data.reason === 'unlink-failed',
        );
      } finally {
        rmdirSync(payloadPath);
      }

      // Hydration must not resolve when its `finally` release fails.
      const failing = bridge as unknown as { releaseVolume: (handle: string) => Promise<void> };
      failing.releaseVolume = async () => {
        throw new WorkerVolumeTransportError(
          'decode-failed',
          'simulated cleanup failure after a successful read',
        );
      };
      await assert.rejects(
        bridge.hydrateVolume(request),
        (error: unknown) => error instanceof WorkerVolumeTransportError,
      );
    });
  });
});
