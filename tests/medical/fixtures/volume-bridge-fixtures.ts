/**
 * NuClear 2B.3b — shared wire-shape fixtures for the bridge-side volume tests.
 *
 * Pure JSON-shape objects only: no worker, no filesystem and no package import.
 * Keeps the volume unit suites small and focused (Rule 02 File Length Gate).
 */

export const DESCRIPTOR_DIGEST = `sha256:${'a'.repeat(64)}`;
export const DESCRIPTOR_HASH = `sha256:${'b'.repeat(64)}`;
/** A valid worker-observed SOP Instance UID set digest (ADR-013 §5). */
export const DESCRIPTOR_SOP_HASH = `sha256:${'c'.repeat(64)}`;

export function contextFixture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    seriesInstanceUID: '1.2.3.4.5',
    expectedFingerprint: {
      studyInstanceUID: '1.2.3.4',
      seriesInstanceUID: '1.2.3.4.5',
      instanceCount: 3,
      contentDigest: DESCRIPTOR_DIGEST,
      sopInstanceUIDsHash: DESCRIPTOR_SOP_HASH,
      geometricDigest: DESCRIPTOR_DIGEST,
    },
    expectedFrameOfReferenceUID: '1.2.3.4.5.for',
    expectedDimensions: [4, 4, 3],
    expectedGeometricDigest: DESCRIPTOR_DIGEST,
    expectedRescale: { slope: 1, intercept: -1024 },
    ...overrides,
  };
}

export function descriptorFixture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    handle: 'f'.repeat(32),
    fileName: 'payload.bin',
    byteOrder: 'little',
    dtype: 'float32',
    signedness: 'not-applicable',
    samplesPerPixel: 1,
    bitsAllocated: 16,
    bitsStored: 16,
    highBit: 15,
    photometricInterpretation: 'MONOCHROME2',
    scalarDataDomain: 'rescaled-hu',
    rescale: { slope: 1, intercept: -1024 },
    dimensions: [4, 4, 3],
    byteLength: 4 * 4 * 3 * 4,
    contentHash: DESCRIPTOR_HASH,
    geometricDigest: DESCRIPTOR_DIGEST,
    publishedAt: '2026-09-22T00:00:00.000Z',
    ttlSeconds: 300,
    correlation: {
      studyInstanceUID: '1.2.3.4',
      seriesInstanceUID: '1.2.3.4.5',
      instanceCount: 3,
      contentDigest: DESCRIPTOR_DIGEST,
      geometricDigest: DESCRIPTOR_DIGEST,
      sopInstanceUIDsHash: DESCRIPTOR_SOP_HASH,
      frameOfReferenceUID: '1.2.3.4.5.for',
    },
    ...overrides,
  };
}

export function handshakeEnvelope(capabilities?: unknown): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: 'req-1',
    protocolVersion: '1.0',
    result: {
      protocolVersions: ['1.0'],
      operations: [
        'nuclear.dicom.inspect',
        'nuclear.dicom.geometry',
        'nuclear.dicom.compatibility',
        'nuclear.quantitation.suvbw',
        'nuclear.registration',
      ],
      workerMetadata: {
        workerVersion: '0.3.0',
        operation: 'nuclear.protocol.handshake',
        timestamp: '2026-09-22T00:00:00Z',
        parameters: {},
      },
      ...(capabilities === undefined ? {} : { capabilities }),
    },
  };
}
