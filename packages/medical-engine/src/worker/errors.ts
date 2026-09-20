/**
 * @nuclear/medical-engine — typed, fail-closed bridge errors.
 *
 * Every transport, contract and scientific disposition failure is represented
 * explicitly. Nothing is swallowed and no plausible fallback is produced.
 */

/** Discriminator shared by every bridge error. */
export type WorkerErrorKind =
  | 'protocol'
  | 'timeout'
  | 'handshake'
  | 'unavailable'
  | 'contract';

/** Base class for every `ScientificWorkerBridge` failure. */
export class WorkerError extends Error {
  readonly kind: WorkerErrorKind;

  constructor(kind: WorkerErrorKind, message: string) {
    super(message);
    this.name = 'WorkerError';
    this.kind = kind;
  }
}

/** A JSON-RPC error envelope returned by the worker. */
export class WorkerProtocolError extends WorkerError {
  readonly method: string;
  readonly code: number;
  readonly diagnostic: string;
  readonly data: Readonly<Record<string, unknown>>;

  constructor(
    method: string,
    code: number,
    message: string,
    diagnostic: string,
    data: Readonly<Record<string, unknown>>,
  ) {
    super('protocol', `[${code}] ${message} (${method}): ${diagnostic}`);
    this.name = 'WorkerProtocolError';
    this.method = method;
    this.code = code;
    this.diagnostic = diagnostic;
    this.data = data;
  }
}

/** A request that exceeded its per-request timeout. */
export class WorkerTimeoutError extends WorkerError {
  readonly method: string;
  readonly timeoutMs: number;

  constructor(method: string, timeoutMs: number) {
    super('timeout', `Worker request '${method}' timed out after ${timeoutMs} ms.`);
    this.name = 'WorkerTimeoutError';
    this.method = method;
    this.timeoutMs = timeoutMs;
  }
}

/** The worker handshake did not satisfy the NuClear protocol contract. */
export class WorkerHandshakeError extends WorkerError {
  readonly reason: string;

  constructor(reason: string) {
    super('handshake', reason);
    this.name = 'WorkerHandshakeError';
    this.reason = reason;
  }
}

/** The worker process is absent, exited, restarting or stopped. */
export class WorkerUnavailableError extends WorkerError {
  readonly reason: string;

  constructor(reason: string) {
    super('unavailable', reason);
    this.name = 'WorkerUnavailableError';
    this.reason = reason;
  }
}

/** A worker message violated the typed wire/contract shape. */
export class WorkerContractError extends WorkerError {
  readonly detail: string;

  constructor(detail: string) {
    super('contract', detail);
    this.name = 'WorkerContractError';
    this.detail = detail;
  }
}
