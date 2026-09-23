/**
 * @nuclear/medical-engine — fail-closed volume-transport bridge errors.
 *
 * A distinct family from `WorkerProtocolError`: these are bridge-side refusals
 * (path containment, file integrity, TTL, decode) that must never be reported
 * as a successful hydration. Messages never contain a filesystem path.
 */

import { WorkerError } from './errors.js';

/**
 * Bridge-side volume-transport refusal discriminators.
 *
 * `voxel-limit-exceeded` / `payload-limit-exceeded` are the bridge-local
 * projection of the ADR-013 §6/§8 per-volume budget (`voxel-limit` /
 * `payload-limit` reasons) and are raised before any payload is opened or
 * allocated.
 */
export type WorkerVolumeTransportFailure =
  | 'capability-unavailable'
  | 'path-rejected'
  | 'file-missing'
  | 'file-short'
  | 'file-long'
  | 'hash-mismatch'
  | 'handle-expired'
  | 'ttl-mismatch'
  | 'voxel-limit-exceeded'
  | 'payload-limit-exceeded'
  | 'decode-failed';

/** Typed, fail-closed volume-transport refusal. */
export class WorkerVolumeTransportError extends WorkerError {
  readonly failure: WorkerVolumeTransportFailure;
  readonly handle: string | null;

  constructor(
    failure: WorkerVolumeTransportFailure,
    message: string,
    handle: string | null = null,
  ) {
    super('contract', `[${failure}] ${message}`);
    this.name = 'WorkerVolumeTransportError';
    this.failure = failure;
    this.handle = handle;
  }
}
