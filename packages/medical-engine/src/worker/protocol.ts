/**
 * @nuclear/medical-engine — NuClear worker wire protocol (ADR-002).
 *
 * Owns the newline-delimited JSON-RPC 2.0 envelope, method/error constants and
 * provenance/handshake mapping. Envelope validation only: no DICOM or
 * scientific interpretation happens here.
 */

import type { ScientificWorkerMetadata } from '@nuclear/shared-types';
import {
  WorkerContractError,
  WorkerError,
  WorkerHandshakeError,
  WorkerUnavailableError,
} from './errors.js';
import { asArray, asRecord, asString, isRecord, stringArray } from './narrowing.js';
import type { WorkerDiagnostic, WorkerHandshake } from './types.js';

export const DEFAULT_PROTOCOL_VERSION = '1.0';

export const HANDSHAKE_METHOD = 'nuclear.protocol.handshake';
export const DICOM_INSPECT_METHOD = 'nuclear.dicom.inspect';
export const DICOM_GEOMETRY_METHOD = 'nuclear.dicom.geometry';
export const DICOM_COMPATIBILITY_METHOD = 'nuclear.dicom.compatibility';
export const QUANTITATION_SUVBW_METHOD = 'nuclear.quantitation.suvbw';
export const REGISTRATION_METHOD = 'nuclear.registration';

/** Operations a compatible worker must advertise during handshake. */
export const REQUIRED_WORKER_OPERATIONS: readonly string[] = [
  DICOM_INSPECT_METHOD,
  DICOM_GEOMETRY_METHOD,
  DICOM_COMPATIBILITY_METHOD,
  QUANTITATION_SUVBW_METHOD,
  REGISTRATION_METHOD,
];

export const JSON_RPC_PARSE_ERROR = -32700;
export const JSON_RPC_INVALID_REQUEST = -32600;
export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;
export const JSON_RPC_INTERNAL_ERROR = -32603;
export const NUCLEAR_PROTOCOL_VERSION_MISMATCH = -32001;
export const NUCLEAR_SOURCE_UNAVAILABLE = -32010;
export const NUCLEAR_OPERATION_NOT_IMPLEMENTED = -32011;
/**
 * Reserved scientific-refusal code for `nuclear.registration` (Phase 2B.2):
 * same Frame of Reference, degenerate landmarks or an improper/reflection fit.
 * Pending phase-owner ratification.
 */
export const NUCLEAR_REGISTRATION_INVALID = -32012;

export interface WorkerJsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: string;
  readonly protocolVersion: string;
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface WorkerJsonRpcErrorBody {
  readonly code: number;
  readonly message: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface WorkerJsonRpcSuccessResponse {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly protocolVersion: string;
  readonly result: unknown;
}

export interface WorkerJsonRpcErrorResponse {
  readonly jsonrpc: '2.0';
  readonly id: string | number | null;
  readonly protocolVersion: string;
  readonly error: WorkerJsonRpcErrorBody;
}

export type WorkerJsonRpcResponse =
  | WorkerJsonRpcSuccessResponse
  | WorkerJsonRpcErrorResponse;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Normalize an unknown rejection into a typed bridge error. */
export function asWorkerError(error: unknown): WorkerError {
  return error instanceof WorkerError
    ? error
    : new WorkerUnavailableError(errorMessage(error));
}

function isResponse(value: unknown): value is WorkerJsonRpcResponse {
  if (!isRecord(value) || value.jsonrpc !== '2.0') return false;
  if (typeof value.protocolVersion !== 'string') return false;
  const id = value.id;
  if (!(typeof id === 'string' || typeof id === 'number' || id === null)) return false;
  if ('error' in value) {
    const body = value.error;
    if (!isRecord(body)) return false;
    return (
      typeof body.code === 'number' &&
      typeof body.message === 'string' &&
      isRecord(body.data)
    );
  }
  return 'result' in value;
}

/** Serialize exactly one compact request record terminated by `\n`. */
export function encodeRequestLine(request: WorkerJsonRpcRequest): string {
  return `${JSON.stringify(request)}\n`;
}

/** Parse and validate exactly one response record. */
export function parseResponseLine(line: string): WorkerJsonRpcResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new WorkerContractError(
      `Worker stdout record is not valid JSON: ${errorMessage(error)}`,
    );
  }
  if (!isResponse(parsed)) {
    throw new WorkerContractError(
      'Worker stdout record is not a JSON-RPC 2.0 response envelope.',
    );
  }
  return parsed;
}

export function mapWorkerMetadata(value: unknown): ScientificWorkerMetadata {
  const record = asRecord(value, 'workerMetadata');
  const metadata: {
    workerVersion: string;
    operation: string;
    timestamp: string;
    parameters?: Readonly<Record<string, unknown>>;
  } = {
    workerVersion: asString(record.workerVersion, 'workerMetadata.workerVersion'),
    operation: asString(record.operation, 'workerMetadata.operation'),
    timestamp: asString(record.timestamp, 'workerMetadata.timestamp'),
  };
  if (record.parameters !== undefined) {
    metadata.parameters = asRecord(record.parameters, 'workerMetadata.parameters');
  }
  return metadata;
}

export function mapDiagnostic(value: unknown, where: string): WorkerDiagnostic {
  const record = asRecord(value, where);
  const file = record.file;
  if (file !== null && typeof file !== 'string') {
    throw new WorkerContractError(`${where}.file must be a string or null.`);
  }
  return {
    code: asString(record.code, `${where}.code`),
    severity: asString(record.severity, `${where}.severity`),
    message: asString(record.message, `${where}.message`),
    file: file ?? null,
  };
}

export function mapDiagnostics(value: unknown, where: string): readonly WorkerDiagnostic[] {
  return asArray(value, where).map((item, index) =>
    mapDiagnostic(item, `${where}[${index}]`),
  );
}

/** Validate a handshake response against the NuClear protocol contract. */
export function mapWorkerHandshake(
  envelope: WorkerJsonRpcSuccessResponse,
): WorkerHandshake {
  if (envelope.protocolVersion !== DEFAULT_PROTOCOL_VERSION) {
    throw new WorkerHandshakeError(
      `Handshake envelope protocolVersion was '${envelope.protocolVersion}', ` +
        `expected '${DEFAULT_PROTOCOL_VERSION}'.`,
    );
  }
  const result = asRecord(envelope.result, 'handshake.result');
  const protocolVersions = stringArray(
    result.protocolVersions,
    'handshake.result.protocolVersions',
  );
  if (!protocolVersions.includes(DEFAULT_PROTOCOL_VERSION)) {
    throw new WorkerHandshakeError(
      `Worker does not declare protocol version '${DEFAULT_PROTOCOL_VERSION}' ` +
        `(received ${JSON.stringify(protocolVersions)}).`,
    );
  }
  const operations = stringArray(result.operations, 'handshake.result.operations');
  const missing = REQUIRED_WORKER_OPERATIONS.filter((method) => !operations.includes(method));
  if (missing.length > 0) {
    throw new WorkerHandshakeError(
      `Worker is missing required operations: ${missing.join(', ')}.`,
    );
  }
  return {
    protocolVersions,
    operations,
    workerMetadata: mapWorkerMetadata(result.workerMetadata),
  };
}
