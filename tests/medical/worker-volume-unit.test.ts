/**
 * NuClear 2B.3b — bridge-side volume capability/descriptor unit evidence.
 *
 * Pure, Node-only tests for the additive `capabilities.volumeTransport` mapping,
 * strict ADR-013 descriptor validation and fingerprint serialization. Filesystem
 * containment and payload read/verify/TTL/decode live in `worker-volume-files`.
 */

import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type { ImagingAsset } from '../../packages/shared-types/src/index.js';
import type { WorkerGeometryComputed } from '../../packages/medical-engine/src/worker/types.ts';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const {
  WorkerContractError,
  WorkerHandshakeError,
  WorkerVolumeTransportError,
  assertDescriptorTtlMatchesCapability,
  mapWorkerHandshake,
  mapVolumeTransportCapability,
  parseVolumeDescriptor,
  sourceFingerprintParams,
  volumeHydrationRequest,
  volumeRequestParams,
} = await import('../../packages/medical-engine/src/index.js');
const { DESCRIPTOR_DIGEST, contextFixture, descriptorFixture, handshakeEnvelope } = await import(
  './fixtures/volume-bridge-fixtures.ts'
);

const context = contextFixture;
const descriptor = descriptorFixture;

describe('NuClear 2B.3b — volumeTransport handshake capability', () => {
  it('keeps old workers working when no capability is advertised', () => {
    const handshake = mapWorkerHandshake(handshakeEnvelope() as never);
    assert.equal(handshake.volumeTransport, undefined);
    assert.equal('volumeTransport' in handshake, false);
  });

  it('maps an advertised capability additively', () => {
    const capability = {
      root: '/private/tmp/nuclear',
      handleTtlSeconds: 300,
      maxResidentPayloads: 2,
      maxPayloadBytes: 1_073_741_824,
    };
    const handshake = mapWorkerHandshake(handshakeEnvelope({ volumeTransport: capability }) as never);
    assert.deepEqual(handshake.volumeTransport, capability);
    assert.deepEqual(mapVolumeTransportCapability({ volumeTransport: capability }), capability);
  });

  it('refuses malformed advertised capabilities instead of accepting them', () => {
    const bad: unknown[] = [
      { root: '', handleTtlSeconds: 300, maxResidentPayloads: 2, maxPayloadBytes: 1 },
      { root: '/r', handleTtlSeconds: 0, maxResidentPayloads: 2, maxPayloadBytes: 1 },
      { root: '/r', handleTtlSeconds: 1.5, maxResidentPayloads: 2, maxPayloadBytes: 1 },
      { root: '/r', handleTtlSeconds: 300, maxResidentPayloads: -1, maxPayloadBytes: 1 },
      { root: 42, handleTtlSeconds: 300, maxResidentPayloads: 2, maxPayloadBytes: 1 },
    ];
    for (const volumeTransport of bad) {
      assert.throws(() => mapVolumeTransportCapability({ volumeTransport }), WorkerHandshakeError);
      assert.throws(
        () => mapWorkerHandshake(handshakeEnvelope({ volumeTransport }) as never),
        WorkerHandshakeError,
      );
    }
    assert.throws(() => mapVolumeTransportCapability({ volumeTransport: 7 }), WorkerHandshakeError);
    assert.throws(() => mapVolumeTransportCapability('nope'), WorkerHandshakeError);
  });
});

describe('NuClear 2B.3b — strict descriptor validation', () => {
  it('accepts a coherent ADR-013 descriptor', () => {
    const parsed = parseVolumeDescriptor(descriptor(), context() as never);
    assert.equal(parsed.dtype, 'float32');
    assert.deepEqual(parsed.dimensions, [4, 4, 3]);
    assert.equal(parsed.byteLength, 192);
  });

  it('refuses malformed format, enum, dimension and fingerprint fields', () => {
    const mutations: Array<[string, Record<string, unknown>]> = [
      ['byteOrder', { byteOrder: 'big' }],
      ['dtype', { dtype: 'float64' }],
      ['signedness', { signedness: 'signed' }],
      ['samplesPerPixel', { samplesPerPixel: 2 }],
      ['highBit', { highBit: 14 }],
      ['scalarDataDomain', { scalarDataDomain: 'suv' }],
      ['dimensions', { dimensions: [4, 4, 4] }],
      ['byteLength', { byteLength: 191 }],
      ['contentHash', { contentHash: 'md5:abc' }],
      ['handle', { handle: 'not-hex' }],
      ['geometricDigest', { geometricDigest: `sha256:${'c'.repeat(64)}` }],
    ];
    for (const [label, override] of mutations) {
      assert.throws(
        () => parseVolumeDescriptor(descriptor(override), context() as never),
        WorkerContractError,
        `expected refusal for ${label}`,
      );
    }
    const wrongCorrelation = descriptor();
    wrongCorrelation.correlation = {
      ...(wrongCorrelation.correlation as Record<string, unknown>),
      frameOfReferenceUID: 'x',
    };
    assert.throws(
      () => parseVolumeDescriptor(wrongCorrelation, context() as never),
      WorkerContractError,
    );
  });

  it('refuses a rescale that disagrees with the registered asset metadata', () => {
    assert.throws(
      () =>
        parseVolumeDescriptor(
          descriptor(),
          context({ expectedRescale: { slope: 2, intercept: 0 } }) as never,
        ),
      WorkerContractError,
    );
    assert.throws(
      () => parseVolumeDescriptor(descriptor({ rescale: undefined }), context() as never),
      WorkerContractError,
    );
  });
});

describe('NuClear 2B.3b — source fingerprint serialization', () => {
  it('carries present optional fields verbatim and omits absent ones', () => {
    const full = {
      studyInstanceUID: '1.2.3',
      seriesInstanceUID: '1.2.3.4',
      instanceCount: 3,
      contentDigest: DESCRIPTOR_DIGEST,
      sopInstanceUIDsHash: `sha256:${'e'.repeat(64)}`,
      totalBytes: 99,
      geometricDigest: DESCRIPTOR_DIGEST,
    };
    assert.deepEqual(sourceFingerprintParams(full as never), { ...full });
    const sparse = { ...full };
    delete (sparse as Record<string, unknown>).sopInstanceUIDsHash;
    delete (sparse as Record<string, unknown>).totalBytes;
    delete (sparse as Record<string, unknown>).geometricDigest;
    assert.deepEqual(sourceFingerprintParams(sparse as never), {
      studyInstanceUID: '1.2.3',
      seriesInstanceUID: '1.2.3.4',
      instanceCount: 3,
      contentDigest: DESCRIPTOR_DIGEST,
    });
  });

  it('serializes only the wire fields of a hydration request', () => {
    const params = volumeRequestParams({
      locator: { kind: 'local-folder', path: '/data' },
      seriesInstanceUID: '1.2.3.4.5',
      expectedFingerprint: context().expectedFingerprint,
      expectedFrameOfReferenceUID: '1.2.3.4.5.for',
      expectedDimensions: [4, 4, 3],
      expectedGeometricDigest: DESCRIPTOR_DIGEST,
      expectedRescale: { slope: 1, intercept: -1024 },
    } as never);
    assert.deepEqual(Object.keys(params).sort(), [
      'expectedFingerprint',
      'expectedFrameOfReferenceUID',
      'locator',
      'seriesInstanceUID',
    ]);
  });
});

describe('NuClear 2B.3b — publication-anchored TTL coherence', () => {
  const capability = (handleTtlSeconds: number): Record<string, unknown> => ({
    root: '/private/tmp/nuclear',
    handleTtlSeconds,
    maxResidentPayloads: 2,
    maxPayloadBytes: 1_073_741_824,
  });

  it('accepts a descriptor TTL that equals the advertised capability exactly', () => {
    const parsed = parseVolumeDescriptor(descriptor(), context() as never);
    assert.doesNotThrow(() =>
      assertDescriptorTtlMatchesCapability(parsed, capability(300) as never),
    );
  });

  it('refuses a descriptor TTL that disagrees with the advertised capability', () => {
    const parsed = parseVolumeDescriptor(descriptor(), context() as never);
    assert.throws(
      () => assertDescriptorTtlMatchesCapability(parsed, capability(120) as never),
      (error: unknown) =>
        error instanceof WorkerVolumeTransportError && error.failure === 'ttl-mismatch',
    );
  });

  it('refuses missing, non-UTC or rolled-over publishedAt instants', () => {
    for (const publishedAt of [
      undefined,
      '',
      'not-a-date',
      '2026-09-22T00:00:00',
      '2026-09-22T00:00:00+02:00',
      '2026-13-01T00:00:00Z',
      '2026-02-30T00:00:00Z',
    ]) {
      assert.throws(
        () => parseVolumeDescriptor(descriptor({ publishedAt }), context() as never),
        WorkerContractError,
        `expected refusal for publishedAt=${String(publishedAt)}`,
      );
    }
  });

  it('accepts Z and +00:00 UTC forms with optional fractional seconds', () => {
    for (const publishedAt of [
      '2026-09-22T00:00:00Z',
      '2026-09-22T00:00:00.5Z',
      '2026-09-22T00:00:00.123456+00:00',
    ]) {
      const parsed = parseVolumeDescriptor(descriptor({ publishedAt }), context() as never);
      assert.equal(parsed.publishedAt, publishedAt);
    }
  });
});

const HYDRATION = {
  series: '1.2.3.4.5',
  frameOfReference: '1.2.3.4.5.for',
  digest: `sha256:${'7'.repeat(64)}`,
} as const;

const EVIDENCE = {
  seriesInstanceUID: HYDRATION.series,
  geometricDigest: HYDRATION.digest,
  assetGeometry: {
    frameOfReferenceUID: HYDRATION.frameOfReference,
    dimensions: [4, 4, 3], spacing: [0.5, 0.5, 2], origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0],
    bounds: { min: [-0.25, -0.25, -1], max: [1.75, 1.75, 5] },
  },
} as unknown as WorkerGeometryComputed;

function hydrationAsset(overrides: Record<string, unknown> = {}): ImagingAsset {
  return {
    id: 'asset-ct',
    seriesInstanceUID: HYDRATION.series,
    sourceLocator: { kind: 'local-folder', path: '/data/ct' },
    sourceFingerprint: {
      studyInstanceUID: '1.2.3.4',
      seriesInstanceUID: HYDRATION.series,
      instanceCount: 3,
      contentDigest: HYDRATION.digest,
    },
    frameOfReferenceUID: HYDRATION.frameOfReference,
    metadata: { rescaleSlope: 1, rescaleIntercept: -1024 },
    ...overrides,
  } as unknown as ImagingAsset;
}

describe('NuClear 2B.3b — hydration request fail-closed correlation', () => {
  it('anchors the expected Frame of Reference and series to the registered asset', () => {
    const request = volumeHydrationRequest(hydrationAsset(), EVIDENCE);
    assert.equal(request.expectedFrameOfReferenceUID, HYDRATION.frameOfReference);
    assert.equal(request.seriesInstanceUID, HYDRATION.series);
    assert.equal(request.expectedFingerprint.geometricDigest, HYDRATION.digest);
  });

  it('preserves a present, equal geometricDigest instead of overwriting silently', () => {
    const present = hydrationAsset().sourceFingerprint;
    const withDigest = hydrationAsset({
      sourceFingerprint: { ...present, geometricDigest: HYDRATION.digest },
    });
    const digestOf = (asset: ImagingAsset): string =>
      volumeHydrationRequest(asset, EVIDENCE).expectedFingerprint.geometricDigest;
    assert.equal(digestOf(withDigest), HYDRATION.digest);
    // Absent digest: the accepted worker geometry digest is added.
    assert.equal(digestOf(hydrationAsset()), HYDRATION.digest);
  });

  it('refuses geometricDigest, Frame-of-Reference and series disagreements', () => {
    const base = hydrationAsset().sourceFingerprint;
    const assets = [
      hydrationAsset({
        sourceFingerprint: { ...base, geometricDigest: `sha256:${'9'.repeat(64)}` },
      }),
      hydrationAsset({ frameOfReferenceUID: '1.2.3.4.5.other' }),
      hydrationAsset({ seriesInstanceUID: '1.2.3.4.5.other' }),
      hydrationAsset({ sourceFingerprint: { ...base, seriesInstanceUID: '1.2.3.4.5.other' } }),
    ];
    for (const asset of assets) {
      assert.throws(() => volumeHydrationRequest(asset, EVIDENCE), WorkerContractError);
    }
  });
});
