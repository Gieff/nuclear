/**
 * NuClear P2.5 — ScientificWorkerBridge lifecycle against the scripted fake.
 *
 * Covers correlation, timeout, crash/restart with bounded backoff, exhaustion,
 * handshake mismatch and malformed stdout handling without the Python worker.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const {
  ScientificWorkerBridge,
  WorkerContractError,
  WorkerHandshakeError,
  WorkerTimeoutError,
  WorkerUnavailableError,
} = await import('../../packages/medical-engine/src/index.js');

type ScientificWorkerBridgeInstance = InstanceType<typeof ScientificWorkerBridge>;

const FAKE_WORKER = fileURLToPath(new URL('./fixtures/fake-worker.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function spawnFake(env: Record<string, string>): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [FAKE_WORKER], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitReady(bridge: ScientificWorkerBridgeInstance, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (bridge.availability === 'ready') return;
    await sleep(10);
  }
  throw new Error(`worker never became ready (availability=${bridge.availability})`);
}

describe('NuClear P2.5 — ScientificWorkerBridge fake lifecycle', () => {
  it('correlates concurrent scripted responses without cross-talk', async () => {
    const bridge = new ScientificWorkerBridge({
      spawnWorker: () => spawnFake({ FAKE_WORKER_MODE: 'respond' }),
    });
    try {
      await bridge.start();
      const markers = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
      const results = await Promise.all(
        markers.map((marker, index) =>
          bridge.request<{ marker: string }>('nuclear.test.echo', {
            marker,
            delayMs: (markers.length - index) * 15,
          }),
        ),
      );
      assert.deepEqual(results.map((result) => result.marker), markers);
      assert.equal(bridge.pendingRequestCount, 0);
    } finally {
      await bridge.stop();
    }
  });

  it('fails a stalled request with a named WorkerTimeoutError and stays usable', async () => {
    const bridge = new ScientificWorkerBridge({
      spawnWorker: () =>
        spawnFake({ FAKE_WORKER_MODE: 'respond', FAKE_WORKER_HANG_METHOD: 'nuclear.test.echo' }),
    });
    try {
      await bridge.start();
      await assert.rejects(
        bridge.request('nuclear.test.echo', {}, { timeoutMs: 120 }),
        (error: unknown) =>
          error instanceof WorkerTimeoutError &&
          error.method === 'nuclear.test.echo' &&
          error.timeoutMs === 120,
      );
      assert.equal(bridge.pendingRequestCount, 0);
      const pong = await bridge.request<{ pong: boolean }>('nuclear.test.ping', {});
      assert.equal(pong.pong, true);
    } finally {
      await bridge.stop();
    }
  });

  it('rejects an in-flight request on crash and recovers via backoff re-handshake', async () => {
    const children: ChildProcessWithoutNullStreams[] = [];
    const bridge = new ScientificWorkerBridge({
      restart: { maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 20 },
      spawnWorker: (attempt) => {
        const env: Record<string, string> = { FAKE_WORKER_MODE: 'respond' };
        if (attempt === 1) env.FAKE_WORKER_HANG_METHOD = 'nuclear.test.echo';
        const child = spawnFake(env);
        children.push(child);
        return child;
      },
    });
    try {
      await bridge.start();
      const pending = bridge.request(
        'nuclear.test.echo',
        { marker: 'kill-me' },
        { timeoutMs: 8_000 },
      );
      await sleep(60);
      assert.equal(bridge.pendingRequestCount, 1);
      children[0].kill('SIGKILL');
      await assert.rejects(
        pending,
        (error: unknown) => error instanceof WorkerUnavailableError,
      );
      await waitReady(bridge);
      assert.ok(children.length >= 2, `expected a second spawn, got ${children.length}`);
      const echo = await bridge.request<{ marker: string }>('nuclear.test.echo', {
        marker: 'recovered',
      });
      assert.equal(echo.marker, 'recovered');
    } finally {
      await bridge.stop();
    }
  });

  it('sets availability to failed after bounded restart exhaustion', async () => {
    let spawns = 0;
    const bridge = new ScientificWorkerBridge({
      restart: { maxAttempts: 2, baseDelayMs: 5, maxDelayMs: 10 },
      spawnWorker: () => {
        spawns += 1;
        return spawnFake({ FAKE_WORKER_CRASH_ON_START: '1' });
      },
    });
    try {
      await assert.rejects(
        bridge.start(),
        (error: unknown) => error instanceof WorkerUnavailableError,
      );
      assert.equal(bridge.availability, 'failed');
      assert.equal(spawns, 2);
    } finally {
      await bridge.stop();
    }
  });

  const mismatchModes: ReadonlyArray<readonly [string, string, string]> = [
    ['envelope protocol version', 'mismatch-envelope', 'protocolVersion'],
    ['declared protocol versions', 'mismatch-versions', 'does not declare protocol version'],
    ['missing required operation', 'missing-op', 'missing required operations'],
  ];
  for (const [label, mode, reasonFragment] of mismatchModes) {
    it(`fails start() with a structured WorkerHandshakeError for ${label}`, async () => {
      const bridge = new ScientificWorkerBridge({
        spawnWorker: () => spawnFake({ FAKE_WORKER_MODE: mode }),
      });
      try {
        await assert.rejects(
          bridge.start(),
          (error: unknown) =>
            error instanceof WorkerHandshakeError &&
            error.reason.includes(reasonFragment),
        );
        assert.equal(bridge.availability, 'failed');
      } finally {
        await bridge.stop();
      }
    });
  }

  it('surfaces malformed stdout as a contract error and recovers', async () => {
    const bridge = new ScientificWorkerBridge({
      restart: { maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 20 },
      spawnWorker: () => spawnFake({ FAKE_WORKER_MODE: 'malformed' }),
    });
    try {
      await bridge.start();
      await assert.rejects(
        bridge.request('nuclear.test.echo', {}),
        (error: unknown) => error instanceof WorkerContractError,
      );
      assert.equal(bridge.pendingRequestCount, 0);
      await waitReady(bridge);
      const pong = await bridge.request<{ pong: boolean }>('nuclear.test.ping', {});
      assert.equal(pong.pong, true);
    } finally {
      await bridge.stop();
    }
  });
});
