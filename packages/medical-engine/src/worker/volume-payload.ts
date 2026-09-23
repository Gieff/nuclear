/**
 * @nuclear/medical-engine — bridge-side volume payload read, verify and decode.
 *
 * Reads the worker-generated payload after canonical containment, verifies the
 * exact declared `byteLength` and SHA-256 `contentHash`, enforces the
 * publication-anchored ADR-013 TTL before and after the read, and decodes the
 * little-endian bytes into exactly the accepted typed array. It performs no
 * DICOM interpretation and no scalar rescaling: the worker already produced the
 * declared representation (ADR-013 §§3/7).
 */

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import type { VolumeScalarArray } from '../renderer/volume-types.js';
import { workerVolumeExpiryEpochMs } from './volume-descriptor-fields.js';
import { WORKER_VOLUME_DTYPE_BYTES } from './volume-descriptor.js';
import { WorkerVolumeTransportError } from './volume-errors.js';
import type { WorkerVolumeTransportFailure } from './volume-errors.js';
import { assertVolumeWithinLimits } from './volume-limits.js';
import { resolveContainedPayloadPath } from './volume-path.js';
import type { WorkerVolumeDescriptor } from './volume-types.js';

/** Return the mandatory `sha256:<hex>` content hash of `bytes`. */
export function sha256ContentHash(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * Refuse a handle whose ADR-013 §7 TTL elapsed. Expiry is anchored to the
 * worker's declared `publishedAt` — the exact publication instant — never to
 * bridge receipt. The boundary is exclusive (`now >= publishedAt + ttlSeconds`),
 * mirroring the worker's own `>= ttlSeconds` policy.
 */
export function assertHandleNotExpired(
  descriptor: WorkerVolumeDescriptor,
  nowMs: number,
): void {
  if (nowMs >= workerVolumeExpiryEpochMs(descriptor)) {
    throw new WorkerVolumeTransportError(
      'handle-expired',
      'The worker volume handle TTL elapsed; re-issue the hydration request.',
      descriptor.handle,
    );
  }
}

/**
 * `O_RDONLY` plus `O_NOFOLLOW` where the platform exposes the constant (POSIX).
 * On platforms without `O_NOFOLLOW` the open degrades to read-only; canonical
 * containment plus the `fstat` regular-file check still hold.
 */
const READ_ONLY_NO_FOLLOW =
  constants.O_RDONLY | (typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0);

function refusal(
  failure: WorkerVolumeTransportFailure,
  detail: string,
  handle: string | null,
): WorkerVolumeTransportError {
  return new WorkerVolumeTransportError(failure, detail, handle);
}

/** Open the contained payload exactly once, mapping OS failures to refusals. */
function openPayloadFile(path: string, handle: string | null): number {
  try {
    return openSync(path, READ_ONLY_NO_FOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw refusal(
        'file-missing',
        'The tracked payload file is missing; re-issue the hydration request.',
        handle,
      );
    }
    throw refusal(
      'path-rejected',
      'Refusing to open the worker payload file; it is not a safe regular file.',
      handle,
    );
  }
}

/**
 * Read at most `byteLength + 1` bytes from an already-open descriptor. The extra
 * sentinel byte detects a file that grew after `fstat` without ever reading an
 * unbounded amount; the caller bounds `byteLength` before this is reached.
 */
function readBounded(fd: number, byteLength: number): Buffer {
  const buffer = Buffer.allocUnsafe(byteLength + 1);
  let filled = 0;
  while (filled < buffer.length) {
    const read = readSync(fd, buffer, filled, buffer.length - filled, filled);
    if (read === 0) break;
    filled += read;
  }
  return buffer.subarray(0, filled);
}

/**
 * Resolve, size-check, hash-check and read a tracked payload file with bounded
 * no-follow I/O. The ADR-013 §6 bounds are applied before anything is opened or
 * allocated. The file is opened once with `O_NOFOLLOW` where supported and its
 * opened descriptor is `fstat`ed (regular file, exact declared `byteLength`);
 * at most the declared bytes plus one sentinel byte are read, so a replaced or
 * growing file can never force an unbounded allocation. The injected
 * publication-anchored clock is checked both before the file is touched and
 * again after the hash is verified, so an expiry that elapses during the read
 * can never resolve successfully (ADR-013 §7).
 */
export function readVerifiedVolumePayload(
  root: string,
  descriptor: WorkerVolumeDescriptor,
  now: () => number,
): Buffer {
  assertHandleNotExpired(descriptor, now());
  assertVolumeWithinLimits(descriptor);
  const path = resolveContainedPayloadPath(root, descriptor.fileName);
  const fd = openPayloadFile(path, descriptor.handle);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      throw refusal(
        'path-rejected',
        'Refusing to read the worker payload; it is not a regular file.',
        descriptor.handle,
      );
    }
    if (stat.size < descriptor.byteLength) {
      throw refusal(
        'file-short',
        'The tracked payload is shorter than its declared byteLength.',
        descriptor.handle,
      );
    }
    if (stat.size > descriptor.byteLength) {
      throw refusal(
        'file-long',
        'The tracked payload is longer than its declared byteLength.',
        descriptor.handle,
      );
    }
    const bytes = readBounded(fd, descriptor.byteLength);
    if (bytes.byteLength < descriptor.byteLength) {
      throw refusal(
        'file-short',
        'The tracked payload is shorter than its declared byteLength.',
        descriptor.handle,
      );
    }
    if (bytes.byteLength > descriptor.byteLength) {
      throw refusal(
        'file-long',
        'The tracked payload is longer than its declared byteLength.',
        descriptor.handle,
      );
    }
    if (sha256ContentHash(bytes) !== descriptor.contentHash) {
      throw refusal(
        'hash-mismatch',
        'The tracked payload content hash does not match its descriptor.',
        descriptor.handle,
      );
    }
    assertHandleNotExpired(descriptor, now());
    return bytes;
  } finally {
    closeSync(fd);
  }
}

/** Decode little-endian payload bytes into exactly the declared typed array. */
export function decodeVolumeScalarData(
  bytes: Uint8Array,
  descriptor: WorkerVolumeDescriptor,
): VolumeScalarArray {
  if (bytes.byteLength !== descriptor.byteLength) {
    throw new WorkerVolumeTransportError(
      'decode-failed',
      `Payload length ${bytes.byteLength} does not equal the declared byteLength ${descriptor.byteLength}.`,
      descriptor.handle,
    );
  }
  const count = descriptor.byteLength / WORKER_VOLUME_DTYPE_BYTES[descriptor.dtype];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = true;
  switch (descriptor.dtype) {
    case 'int8':
      return new Int8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + count));
    case 'uint8':
      return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + count));
    case 'int16': {
      const out = new Int16Array(count);
      for (let index = 0; index < count; index += 1) {
        out[index] = view.getInt16(index * 2, littleEndian);
      }
      return out;
    }
    case 'uint16': {
      const out = new Uint16Array(count);
      for (let index = 0; index < count; index += 1) {
        out[index] = view.getUint16(index * 2, littleEndian);
      }
      return out;
    }
    case 'float32': {
      const out = new Float32Array(count);
      for (let index = 0; index < count; index += 1) {
        out[index] = view.getFloat32(index * 4, littleEndian);
      }
      return out;
    }
    default:
      throw new WorkerVolumeTransportError(
        'decode-failed',
        `Declared dtype '${String(descriptor.dtype)}' is not an accepted v1 element type.`,
        descriptor.handle,
      );
  }
}
