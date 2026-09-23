/**
 * @nuclear/medical-engine — ADR-013 §6 per-volume resource bounds.
 *
 * Bridge-side, pre-allocation guard for the ratified v1 deployment profile. A
 * descriptor is refused when its declared voxel count or payload byte length
 * exceeds the profile, *before* the bridge sizes a buffer or opens a file. The
 * byte cap is the stricter of the worker-advertised `maxPayloadBytes` and the
 * absolute 1 GiB profile value. These are declared v1 deployment constraints,
 * not universal clinical constants. Error messages never contain a filesystem
 * path.
 */

import { WorkerVolumeTransportError } from './volume-errors.js';
import type {
  WorkerVolumeDescriptor,
  WorkerVolumeTransportCapability,
} from './volume-types.js';

/** ADR-013 §6 v1 profile: maximum decoded voxels per volume (`2^28`). */
export const WORKER_VOLUME_MAX_VOXELS_PER_VOLUME = 2 ** 28;

/** ADR-013 §6 v1 profile: absolute maximum bytes per payload (`1 GiB`). */
export const WORKER_VOLUME_MAX_PAYLOAD_BYTES = 2 ** 30;

/**
 * Effective per-payload byte cap: the strictest of the worker-advertised
 * `maxPayloadBytes` (when a capability is supplied) and the absolute profile.
 */
export function workerVolumePayloadByteCap(
  capability?: WorkerVolumeTransportCapability,
): number {
  if (capability === undefined) return WORKER_VOLUME_MAX_PAYLOAD_BYTES;
  return capability.maxPayloadBytes < WORKER_VOLUME_MAX_PAYLOAD_BYTES
    ? capability.maxPayloadBytes
    : WORKER_VOLUME_MAX_PAYLOAD_BYTES;
}

/**
 * Refuse a descriptor whose declared grid or payload exceeds the ADR-013 §6
 * bounds. Call this before any read or allocation; no path is ever inspected.
 *
 * @param capability the advertised transport capability when available; the
 * worker's `maxPayloadBytes` may tighten (never loosen) the absolute cap.
 * @throws WorkerVolumeTransportError with a closed `voxel-limit-exceeded` or
 * `payload-limit-exceeded` failure.
 */
export function assertVolumeWithinLimits(
  descriptor: WorkerVolumeDescriptor,
  capability?: WorkerVolumeTransportCapability,
): void {
  const [nx, ny, nz] = descriptor.dimensions;
  const voxelCount = nx * ny * nz;
  if (voxelCount > WORKER_VOLUME_MAX_VOXELS_PER_VOLUME) {
    throw new WorkerVolumeTransportError(
      'voxel-limit-exceeded',
      `The declared volume has ${voxelCount} voxels; the ADR-013 per-volume cap is ` +
        `${WORKER_VOLUME_MAX_VOXELS_PER_VOLUME}.`,
      descriptor.handle,
    );
  }
  const byteCap = workerVolumePayloadByteCap(capability);
  if (descriptor.byteLength > byteCap) {
    throw new WorkerVolumeTransportError(
      'payload-limit-exceeded',
      `The declared payload is ${descriptor.byteLength} bytes; the ADR-013 per-payload ` +
        `cap is ${byteCap} bytes.`,
      descriptor.handle,
    );
  }
}
