/**
 * @nuclear/medical-engine — worker lifecycle supervisor.
 *
 * Owns spawn, handshake validation, transport lifetime, timeouts and bounded
 * exponential restart. It performs no mapping and no scientific work; the
 * public query facade and callback fan-out live in `ScientificWorkerBridge`.
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  WorkerContractError,
  WorkerHandshakeError,
  WorkerUnavailableError,
} from './errors.js';
import {
  HANDSHAKE_METHOD,
  asWorkerError,
  mapWorkerHandshake,
} from './protocol.js';
import {
  AbortableDelay,
  WorkerTransport,
  backoffDelay,
  defaultSpawnWorker,
} from './process.js';
import type { WorkerJsonRpcSuccessResponse } from './protocol.js';
import type {
  ScientificWorkerBridgeOptions,
  WorkerAvailability,
  WorkerHandshake,
  WorkerRestartPolicy,
} from './types.js';
import {
  DEFAULT_HANDSHAKE_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RESTART_BASE_DELAY_MS,
  DEFAULT_RESTART_MAX_ATTEMPTS,
  DEFAULT_RESTART_MAX_DELAY_MS,
  DEFAULT_STOP_GRACE_PERIOD_MS,
} from './types.js';

export class WorkerSupervisor {
  readonly #requestTimeoutMs: number;
  readonly #handshakeTimeoutMs: number;
  readonly #restart: Required<WorkerRestartPolicy>;
  readonly #spawnWorker: (attempt: number) => ChildProcessWithoutNullStreams;
  readonly #restartDelay = new AbortableDelay();

  #availability: WorkerAvailability = 'stopped';
  #transport: WorkerTransport | null = null;
  #handshake: WorkerHandshake | null = null;
  #spawnCount = 0;
  #failures = 0;
  #stopping = false;
  #supervising = false;
  #startPromise: Promise<WorkerHandshake> | null = null;

  constructor(options: ScientificWorkerBridgeOptions = {}) {
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    const restart = options.restart ?? {};
    this.#restart = {
      maxAttempts: restart.maxAttempts ?? DEFAULT_RESTART_MAX_ATTEMPTS,
      baseDelayMs: restart.baseDelayMs ?? DEFAULT_RESTART_BASE_DELAY_MS,
      maxDelayMs: restart.maxDelayMs ?? DEFAULT_RESTART_MAX_DELAY_MS,
    };
    this.#spawnWorker = options.spawnWorker ?? defaultSpawnWorker(options);
  }

  get availability(): WorkerAvailability {
    return this.#availability;
  }

  /** Number of in-flight requests; exposed for diagnostics and tests. */
  get pendingRequestCount(): number {
    return this.#transport?.pendingCount ?? 0;
  }

  protected get transport(): WorkerTransport | null {
    return this.#transport;
  }

  protected get requestTimeoutMs(): number {
    return this.#requestTimeoutMs;
  }

  /** The validated handshake advertised by the current worker, if any. */
  protected get currentHandshake(): WorkerHandshake | null {
    return this.#handshake;
  }

  /** Availability hook; the facade overrides it for listener fan-out. */
  protected onAvailability(_next: WorkerAvailability): void {
    // No-op in the base supervisor.
  }

  /** Stderr hook; the facade overrides it for diagnostics delivery. */
  protected onStderr(_chunk: string): void {
    // No-op in the base supervisor.
  }

  start(): Promise<WorkerHandshake> {
    if (this.#availability === 'ready' && this.#handshake !== null) {
      return Promise.resolve(this.#handshake);
    }
    if (this.#startPromise !== null) return this.#startPromise;
    this.#stopping = false;
    const run = this.#startWithRetries('starting');
    this.#startPromise = run;
    run.then(
      () => this.#clearStart(run),
      () => this.#clearStart(run),
    );
    return run;
  }

  async handshake(): Promise<WorkerHandshake> {
    if (this.#availability === 'ready' && this.#handshake !== null) return this.#handshake;
    return this.start();
  }

  async stop(): Promise<void> {
    if (this.#stopping) return;
    this.#stopping = true;
    this.#restartDelay.cancel();
    const startRun = this.#startPromise;
    if (startRun !== null) {
      this.#transport?.beginStop('Bridge is stopping; the pending request was cancelled.');
      try {
        await startRun;
      } catch (error) {
        // The loop observed `#stopping` and failed closed; nothing more to do.
        void error;
      }
    }
    await this.#teardownTransport();
    this.#handshake = null;
    this.#setAvailability('stopped');
    this.#stopping = false;
  }

  async #startWithRetries(mode: 'starting' | 'restarting'): Promise<WorkerHandshake> {
    this.#supervising = true;
    try {
      for (;;) {
        this.#setAvailability(mode);
        try {
          const handshake = await this.#spawnAndHandshake();
          if (this.#stopping) throw new WorkerUnavailableError('Bridge stopped during startup.');
          this.#failures = 0;
          this.#handshake = handshake;
          this.#setAvailability('ready');
          return handshake;
        } catch (error) {
          await this.#teardownTransport();
          if (this.#stopping) {
            this.#setAvailability('stopped');
            throw asWorkerError(error);
          }
          if (error instanceof WorkerHandshakeError || error instanceof WorkerContractError) {
            this.#setAvailability('failed');
            throw error;
          }
          this.#failures += 1;
          if (this.#failures >= this.#restart.maxAttempts) {
            this.#setAvailability('failed');
            throw asWorkerError(error);
          }
          await this.#restartDelay.schedule(backoffDelay(this.#restart, this.#failures));
          if (this.#stopping) {
            this.#setAvailability('stopped');
            throw asWorkerError(error);
          }
          mode = 'restarting';
        }
      }
    } finally {
      this.#supervising = false;
    }
  }

  async #spawnAndHandshake(): Promise<WorkerHandshake> {
    this.#spawnCount += 1;
    const child = this.#spawnWorker(this.#spawnCount);
    const ref: { current: WorkerTransport | null } = { current: null };
    const transport = new WorkerTransport(child, {
      onStderr: (chunk) => this.onStderr(chunk),
      onExit: (code, signal) => this.#onChildExit(ref.current, code, signal),
      onTransportFault: (error) => this.#onTransportFault(ref.current, error),
    });
    ref.current = transport;
    this.#transport = transport;
    const envelope: WorkerJsonRpcSuccessResponse = await transport.request(
      HANDSHAKE_METHOD,
      {},
      this.#handshakeTimeoutMs,
    );
    return mapWorkerHandshake(envelope);
  }

  #onTransportFault(source: WorkerTransport | null, error: Error): void {
    if (source === null || this.#transport !== source) return;
    source.rejectAll(asWorkerError(error));
    if (this.#stopping) return;
    // Fail closed immediately: the exit event (and restart) is asynchronous.
    this.#setAvailability('restarting');
    source.kill('SIGKILL');
  }

  #onChildExit(
    source: WorkerTransport | null,
    code: number | null,
    signal: string | null,
  ): void {
    if (source === null || this.#transport !== source) return;
    this.#transport = null;
    if (this.#stopping) {
      this.#setAvailability('stopped');
      return;
    }
    source.rejectAll(
      new WorkerUnavailableError(
        `Worker exited (code=${code === null ? 'null' : String(code)}, ` +
          `signal=${signal === null ? 'null' : signal}).`,
      ),
    );
    if (this.#supervising || this.#startPromise !== null) return;
    if (this.#availability === 'stopped') return;
    const run = this.#startWithRetries('restarting');
    this.#startPromise = run;
    run.then(
      () => this.#clearStart(run),
      () => this.#clearStart(run),
    );
  }

  async #teardownTransport(): Promise<void> {
    const transport = this.#transport;
    if (transport === null) return;
    this.#transport = null;
    transport.beginStop('Worker is being replaced; the pending request was cancelled.');
    await transport.shutdown(DEFAULT_STOP_GRACE_PERIOD_MS);
  }

  #clearStart(run: Promise<WorkerHandshake>): void {
    if (this.#startPromise === run) this.#startPromise = null;
  }

  #setAvailability(next: WorkerAvailability): void {
    if (this.#availability === next) return;
    this.#availability = next;
    this.onAvailability(next);
  }
}
