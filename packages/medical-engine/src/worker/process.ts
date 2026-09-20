/**
 * @nuclear/medical-engine — supervised child process and stdio transport.
 *
 * Owns stdout framing, request correlation, per-request timers and shutdown.
 * Per `python/worker/stdio.py` the worker is stateless and restart-safe;
 * stdout is protocol-only and stderr is diagnostics-only, never parsed.
 */

import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  WorkerContractError,
  WorkerError,
  WorkerProtocolError,
  WorkerTimeoutError,
  WorkerUnavailableError,
} from './errors.js';
import {
  DEFAULT_PROTOCOL_VERSION,
  encodeRequestLine,
  errorMessage,
  parseResponseLine,
} from './protocol.js';
import type { WorkerJsonRpcResponse, WorkerJsonRpcSuccessResponse } from './protocol.js';
import type { ScientificWorkerBridgeOptions, WorkerRestartPolicy } from './types.js';

export const DEFAULT_WORKER_COMMAND = 'python/worker/.venv/bin/python';
export const DEFAULT_WORKER_ARGS: readonly string[] = ['-m', 'worker'];

/** A single pending backoff timer that `stop()` can settle immediately. */
export class AbortableDelay {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #resolve: (() => void) | null = null;

  schedule(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.#resolve = resolve;
      this.#timer = setTimeout(() => {
        this.#timer = null;
        this.#resolve = null;
        resolve();
      }, ms);
    });
  }
  cancel(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    const resolve = this.#resolve;
    this.#resolve = null;
    if (resolve !== null) resolve();
  }
}

/** Bounded exponential backoff; base, max and attempt count are explicit. */
export function backoffDelay(policy: WorkerRestartPolicy, failures: number): number {
  let delay = policy.baseDelayMs;
  for (let index = 1; index < failures; index += 1) {
    delay *= 2;
    if (delay >= policy.maxDelayMs) return policy.maxDelayMs;
  }
  return delay > policy.maxDelayMs ? policy.maxDelayMs : delay;
}

interface PendingRequest {
  readonly method: string;
  readonly resolve: (response: WorkerJsonRpcSuccessResponse) => void;
  readonly reject: (error: WorkerError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Callbacks the bridge supervises; the transport never decides policy. */
export interface WorkerTransportHooks {
  readonly onStderr: (chunk: string) => void;
  readonly onExit: (code: number | null, signal: string | null) => void;
  readonly onTransportFault: (error: WorkerError) => void;
}

export class WorkerTransport {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #hooks: WorkerTransportHooks;
  readonly #pending = new Map<string, PendingRequest>();
  #buffer = '';
  #counter = 0;
  #stopping = false;

  constructor(child: ChildProcessWithoutNullStreams, hooks: WorkerTransportHooks) {
    this.#child = child;
    this.#hooks = hooks;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.#consume(chunk));
    child.stderr.on('data', (chunk: string) => this.#hooks.onStderr(chunk));
    child.stdin.on('error', (error: Error) => {
      this.rejectAll(new WorkerUnavailableError(`Worker stdin error: ${error.message}`));
    });
    child.on('error', (error: Error) => {
      this.rejectAll(new WorkerUnavailableError(`Worker process error: ${error.message}`));
    });
    child.on('exit', (code, signal) => this.#hooks.onExit(code, signal));
  }

  get pendingCount(): number {
    return this.#pending.size;
  }

  request(
    method: string,
    params: Readonly<Record<string, unknown>>,
    timeoutMs: number,
  ): Promise<WorkerJsonRpcSuccessResponse> {
    return new Promise((resolve, reject) => {
      if (this.#stopping) {
        reject(new WorkerUnavailableError(`Cannot send '${method}': transport is stopping.`));
        return;
      }
      this.#counter += 1;
      const id = `req-${this.#counter}`;
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new WorkerTimeoutError(method, timeoutMs));
      }, timeoutMs);
      this.#pending.set(id, { method, resolve, reject, timer });
      try {
        this.#child.stdin.write(
          encodeRequestLine({
            jsonrpc: '2.0',
            id,
            protocolVersion: DEFAULT_PROTOCOL_VERSION,
            method,
            params,
          }),
        );
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(new WorkerUnavailableError(`Failed to write '${method}': ${errorMessage(error)}`));
      }
    });
  }

  beginStop(reason: string): void {
    this.#stopping = true;
    this.rejectAll(new WorkerUnavailableError(reason));
  }

  rejectAll(error: WorkerError): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  kill(signal: 'SIGKILL' | 'SIGTERM' = 'SIGKILL'): void {
    if (this.#child.exitCode === null && this.#child.signalCode === null) {
      this.#child.kill(signal);
    }
  }

  async shutdown(graceMs: number): Promise<void> {
    this.#stopping = true;
    if (!this.#child.stdin.destroyed) this.#child.stdin.end();
    const exited = await waitForExit(this.#child, graceMs);
    if (!exited) {
      this.#child.kill('SIGKILL');
      await waitForExit(this.#child, graceMs);
    }
  }

  #consume(chunk: string): void {
    this.#buffer += chunk;
    for (;;) {
      const newline = this.#buffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      if (line.trim().length > 0) this.#handleLine(line);
    }
  }

  #handleLine(line: string): void {
    let response: WorkerJsonRpcResponse;
    try {
      response = parseResponseLine(line);
    } catch (error) {
      this.#hooks.onTransportFault(
        error instanceof WorkerError ? error : new WorkerContractError('Malformed record.'),
      );
      return;
    }
    if (response.id === null) {
      this.#hooks.onTransportFault(
        new WorkerContractError('Worker response carries no correlatable id.'),
      );
      return;
    }
    const id = typeof response.id === 'string' ? response.id : String(response.id);
    const pending = this.#pending.get(id);
    if (pending === undefined) return; // late response after a timeout: never misroute
    this.#pending.delete(id);
    clearTimeout(pending.timer);
    if ('error' in response) {
      const data = response.error.data;
      const diagnostic =
        typeof data.diagnostic === 'string' ? data.diagnostic : response.error.message;
      pending.reject(new WorkerProtocolError(
        pending.method, response.error.code, response.error.message, diagnostic, data,
      ));
      return;
    }
    pending.resolve(response);
  }
}

export function waitForExit(
  child: ChildProcessWithoutNullStreams,
  graceMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, graceMs);
    const done = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', done);
    child.once('close', done);
  });
}

/** Default factory spawning the local arm64 worker through its venv. */
export function defaultSpawnWorker(
  options: ScientificWorkerBridgeOptions,
): (attempt: number) => ChildProcessWithoutNullStreams {
  return (_attempt: number): ChildProcessWithoutNullStreams => {
    const command = options.command ?? DEFAULT_WORKER_COMMAND;
    const args = options.args === undefined ? [...DEFAULT_WORKER_ARGS] : [...options.args];
    const cwd = options.cwd ?? process.cwd();
    return spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  };
}
