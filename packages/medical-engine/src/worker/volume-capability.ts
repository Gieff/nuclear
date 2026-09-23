/**
 * @nuclear/medical-engine — additive `capabilities.volumeTransport` mapping.
 *
 * The ADR-013 handshake block is optional: a worker that predates the transport
 * advertises no capabilities and remains fully usable. When the block is
 * present it is validated strictly — a malformed advertised capability is never
 * silently accepted, because a wrong root or TTL would break fail-closed
 * hydration.
 */

import { WorkerHandshakeError } from './errors.js';
import { isRecord } from './narrowing.js';
import type { WorkerVolumeTransportCapability } from './volume-types.js';

function positiveInteger(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new WorkerHandshakeError(`${where} must be a positive integer.`);
  }
  return value;
}

/**
 * Validate the optional handshake `capabilities` block.
 *
 * @returns the typed `volumeTransport` capability, or `undefined` when the
 * worker advertises none (old workers/fixtures keep working unchanged).
 * @throws WorkerHandshakeError when the block is present but malformed.
 */
export function mapVolumeTransportCapability(
  value: unknown,
): WorkerVolumeTransportCapability | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    throw new WorkerHandshakeError('handshake.result.capabilities must be an object.');
  }
  const block = value.volumeTransport;
  if (block === undefined || block === null) return undefined;
  if (!isRecord(block)) {
    throw new WorkerHandshakeError(
      'handshake.result.capabilities.volumeTransport must be an object.',
    );
  }
  const root = block.root;
  if (typeof root !== 'string' || root.length === 0) {
    throw new WorkerHandshakeError(
      'handshake.result.capabilities.volumeTransport.root must be a non-empty string.',
    );
  }
  const prefix = 'handshake.result.capabilities.volumeTransport';
  return {
    root,
    handleTtlSeconds: positiveInteger(block.handleTtlSeconds, `${prefix}.handleTtlSeconds`),
    maxResidentPayloads: positiveInteger(
      block.maxResidentPayloads,
      `${prefix}.maxResidentPayloads`,
    ),
    maxPayloadBytes: positiveInteger(block.maxPayloadBytes, `${prefix}.maxPayloadBytes`),
  };
}
