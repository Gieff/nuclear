/**
 * @nuclear/medical-engine — strict ADR-013 volume descriptor validation.
 *
 * Pure translation of the worker's `nuclear.dicom.volume` JSON descriptor into
 * the typed contract, failing closed on any structural, enum, dimensional,
 * hash-format or correlation gap. It performs no DICOM interpretation, no
 * rescaling and no inference: the worker declares every format fact, and the
 * bridge only verifies it against the accepted geometry/fingerprint context.
 * Error messages never contain a filesystem path.
 */

import type { SourceFingerprint } from '@nuclear/shared-types';
import { asRecord, asString } from './narrowing.js';
import {
  WORKER_VOLUME_ALLOCATED_BITS,
  WORKER_VOLUME_CONTENT_HASH_PATTERN,
  WORKER_VOLUME_DOMAIN_SET,
  WORKER_VOLUME_DTYPE_BYTES,
  WORKER_VOLUME_DTYPE_SET,
  WORKER_VOLUME_HANDLE_PATTERN,
  WORKER_VOLUME_SIGNEDNESS_BY_DTYPE,
  WORKER_VOLUME_SIGNEDNESS_SET,
  parseCorrelation,
  parseDimensions,
  parsePublishedAt,
  parseRescale,
  positiveInteger,
  requireContract as require,
  requireEnum,
} from './volume-descriptor-fields.js';
import { WorkerVolumeTransportError } from './volume-errors.js';
import type {
  WorkerVolumeCorrelation,
  WorkerVolumeDescriptor,
  WorkerVolumeHydrationRequest,
  WorkerVolumeScalarDataDomain,
  WorkerVolumeScalarDataType,
  WorkerVolumeSignedness,
  WorkerVolumeTransportCapability,
  WorkerVolumeValidationContext,
} from './volume-types.js';

export {
  WORKER_VOLUME_DTYPE_BYTES,
  WORKER_VOLUME_SIGNEDNESS_BY_DTYPE,
} from './volume-descriptor-fields.js';

// Re-exported through the descriptor module so the ADR-013 §6 bounds remain part
// of the existing worker barrel without a new barrel entry.
export {
  WORKER_VOLUME_MAX_PAYLOAD_BYTES,
  WORKER_VOLUME_MAX_VOXELS_PER_VOLUME,
  assertVolumeWithinLimits,
  workerVolumePayloadByteCap,
} from './volume-limits.js';

/** Serialize a `SourceFingerprint` verbatim, present optional fields included. */
export function sourceFingerprintParams(
  fingerprint: SourceFingerprint,
): Readonly<Record<string, unknown>> {
  const params: Record<string, unknown> = {
    studyInstanceUID: fingerprint.studyInstanceUID,
    seriesInstanceUID: fingerprint.seriesInstanceUID,
    instanceCount: fingerprint.instanceCount,
    contentDigest: fingerprint.contentDigest,
  };
  if (fingerprint.sopInstanceUIDsHash !== undefined) {
    params.sopInstanceUIDsHash = fingerprint.sopInstanceUIDsHash;
  }
  if (fingerprint.totalBytes !== undefined) params.totalBytes = fingerprint.totalBytes;
  if (fingerprint.geometricDigest !== undefined) {
    params.geometricDigest = fingerprint.geometricDigest;
  }
  return params;
}

/** Serialize the exact `nuclear.dicom.volume` wire request (no bridge-only facts). */
export function volumeRequestParams(
  request: WorkerVolumeHydrationRequest,
): Readonly<Record<string, unknown>> {
  return {
    locator: request.locator,
    seriesInstanceUID: request.seriesInstanceUID,
    expectedFingerprint: sourceFingerprintParams(request.expectedFingerprint),
    expectedFrameOfReferenceUID: request.expectedFrameOfReferenceUID,
  };
}

/**
 * ADR-013 §7: a descriptor's declared TTL is the worker's publication-anchored
 * policy profile and must equal the advertised handshake `handleTtlSeconds`
 * exactly. A disagreement is a fail-closed refusal, never a lenient fallback.
 */
export function assertDescriptorTtlMatchesCapability(
  descriptor: WorkerVolumeDescriptor,
  capability: WorkerVolumeTransportCapability,
): void {
  if (descriptor.ttlSeconds !== capability.handleTtlSeconds) {
    throw new WorkerVolumeTransportError(
      'ttl-mismatch',
      `The worker descriptor declares ttlSeconds=${descriptor.ttlSeconds}, but the ` +
        `advertised handleTtlSeconds is ${capability.handleTtlSeconds}; refusing.`,
      descriptor.handle,
    );
  }
}

function verifyCorrelation(
  observed: WorkerVolumeCorrelation,
  context: WorkerVolumeValidationContext,
): void {
  const expected = context.expectedFingerprint;
  require(
    observed.seriesInstanceUID === expected.seriesInstanceUID &&
      observed.seriesInstanceUID === context.seriesInstanceUID,
    'correlation.seriesInstanceUID disagrees with the expected source',
  );
  require(
    observed.studyInstanceUID === expected.studyInstanceUID,
    'correlation.studyInstanceUID disagrees with the expected source',
  );
  require(
    observed.instanceCount === expected.instanceCount,
    'correlation.instanceCount disagrees with the expected source',
  );
  require(
    observed.contentDigest === expected.contentDigest,
    'correlation.contentDigest disagrees with the expected source digest',
  );
  require(
    observed.frameOfReferenceUID === context.expectedFrameOfReferenceUID,
    'correlation.frameOfReferenceUID disagrees with the expected Frame of Reference',
  );
  require(
    observed.geometricDigest === context.expectedGeometricDigest,
    'correlation.geometricDigest disagrees with the accepted worker geometry',
  );
  // ADR-013 §5: compare the worker-observed SOP UID digest only when the
  // expected fingerprint supplies one. An absent expectation is never
  // defaulted, and the observed digest is retained verbatim.
  if (expected.sopInstanceUIDsHash !== undefined) {
    require(
      observed.sopInstanceUIDsHash === expected.sopInstanceUIDsHash,
      'correlation.sopInstanceUIDsHash disagrees with the expected source identity',
    );
  }
  if (expected.totalBytes !== undefined) {
    require(
      observed.totalBytes === expected.totalBytes,
      'correlation.totalBytes disagrees with the expected source size',
    );
  }
}

function verifyFormat(
  descriptor: WorkerVolumeDescriptor,
  context: WorkerVolumeValidationContext,
): void {
  const dimensions = descriptor.dimensions;
  require(
    dimensions[0] === context.expectedDimensions[0] &&
      dimensions[1] === context.expectedDimensions[1] &&
      dimensions[2] === context.expectedDimensions[2],
    `dimensions [${dimensions.join(', ')}] disagree with the accepted worker grid`,
  );
  require(
    descriptor.geometricDigest === context.expectedGeometricDigest,
    'geometricDigest disagrees with the accepted worker geometry',
  );
  const expected = context.expectedRescale;
  if (descriptor.rescale !== undefined) {
    require(
      descriptor.rescale.slope === expected.slope &&
        descriptor.rescale.intercept === expected.intercept,
      'rescale disagrees with the registered asset rescale metadata',
    );
  } else {
    require(
      descriptor.scalarDataDomain === 'stored-values' &&
        expected.slope === 1 &&
        expected.intercept === 0,
      'a rescaled scalarDataDomain must declare its rescale provenance',
    );
  }
}

/**
 * Validate a `nuclear.dicom.volume` descriptor strictly against ADR-013 and the
 * caller-declared context, failing closed before any bytes are read.
 */
export function parseVolumeDescriptor(
  value: unknown,
  context: WorkerVolumeValidationContext,
): WorkerVolumeDescriptor {
  const record = asRecord(value, 'volume descriptor');
  const handle = asString(record.handle, 'volume descriptor.handle');
  require(WORKER_VOLUME_HANDLE_PATTERN.test(handle), 'handle is not a worker-generated opaque handle');
  const fileName = asString(record.fileName, 'volume descriptor.fileName');
  require(fileName.length > 0, 'fileName must be a non-empty worker-generated name');

  const byteOrder = asString(record.byteOrder, 'volume descriptor.byteOrder');
  require(byteOrder === 'little', "byteOrder must be the v1 'little' encoding");
  const dtype = requireEnum<WorkerVolumeScalarDataType>(
    record.dtype,
    WORKER_VOLUME_DTYPE_SET,
    'dtype',
  );
  const signedness = requireEnum<WorkerVolumeSignedness>(
    record.signedness,
    WORKER_VOLUME_SIGNEDNESS_SET,
    'signedness',
  );
  require(
    signedness === WORKER_VOLUME_SIGNEDNESS_BY_DTYPE[dtype],
    `signedness '${signedness}' is incoherent with dtype '${dtype}'`,
  );

  const samplesPerPixel = positiveInteger(record.samplesPerPixel, 'samplesPerPixel');
  require(samplesPerPixel === 1, 'samplesPerPixel must be 1 for a scalar v1 payload');
  const bitsAllocated = positiveInteger(record.bitsAllocated, 'bitsAllocated');
  require(
    WORKER_VOLUME_ALLOCATED_BITS.includes(bitsAllocated),
    `bitsAllocated must be one of ${WORKER_VOLUME_ALLOCATED_BITS.join(', ')}`,
  );
  const bitsStored = positiveInteger(record.bitsStored, 'bitsStored');
  require(bitsStored <= bitsAllocated, 'bitsStored must not exceed bitsAllocated');
  const highBit = positiveInteger(record.highBit, 'highBit');
  require(highBit === bitsStored - 1, `highBit must equal bitsStored - 1 (${bitsStored - 1})`);
  const photometricInterpretation = asString(
    record.photometricInterpretation,
    'volume descriptor.photometricInterpretation',
  );
  require(photometricInterpretation.length > 0, 'photometricInterpretation must be non-empty');
  const scalarDataDomain = requireEnum<WorkerVolumeScalarDataDomain>(
    record.scalarDataDomain,
    WORKER_VOLUME_DOMAIN_SET,
    'scalarDataDomain',
  );

  const dimensions = parseDimensions(record.dimensions);
  const declaredLength = positiveInteger(record.byteLength, 'byteLength');
  const expectedLength = dimensions[0] * dimensions[1] * dimensions[2] * WORKER_VOLUME_DTYPE_BYTES[dtype];
  require(
    declaredLength === expectedLength,
    `byteLength ${declaredLength} does not equal nx*ny*nz*bytesPerVoxel (${expectedLength})`,
  );

  const contentHash = asString(record.contentHash, 'volume descriptor.contentHash');
  require(
    WORKER_VOLUME_CONTENT_HASH_PATTERN.test(contentHash),
    'contentHash must be a sha256:<hex> digest',
  );
  const geometricDigest = asString(record.geometricDigest, 'volume descriptor.geometricDigest');
  require(geometricDigest.length > 0, 'geometricDigest must be non-empty');
  const publishedAt = parsePublishedAt(record.publishedAt);
  const ttlSeconds = positiveInteger(record.ttlSeconds, 'ttlSeconds');

  const observed = parseCorrelation(record.correlation);
  const descriptor: WorkerVolumeDescriptor = {
    handle,
    fileName,
    byteOrder: 'little',
    dtype,
    signedness,
    samplesPerPixel,
    bitsAllocated,
    bitsStored,
    highBit,
    photometricInterpretation,
    scalarDataDomain,
    ...(record.rescale === undefined ? {} : { rescale: parseRescale(record.rescale) }),
    dimensions,
    byteLength: declaredLength,
    contentHash,
    geometricDigest,
    publishedAt,
    ttlSeconds,
    correlation: observed,
  };
  verifyCorrelation(descriptor.correlation, context);
  verifyFormat(descriptor, context);
  return descriptor;
}
