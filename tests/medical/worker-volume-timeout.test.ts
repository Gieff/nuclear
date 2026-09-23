/**
 * NuClear ADR-013 §7 — volume-hydration timeout lifecycle branch.
 *
 * When `nuclear.dicom.volume` times out before any descriptor (and therefore any
 * handle) is known, there is no safe protocol-level cancel: the bridge must
 * terminate the hung worker and start a fresh one so the replacement worker's
 * startup orphan sweep removes the untracked temp file deterministically. The
 * caller keeps seeing the original `WorkerTimeoutError` when the restart
 * succeeds; a failed restart surfaces as a typed `WorkerUnavailableError`.
 *
 * Driven by the real scripted child (`fake-worker.mjs`) so the transport,
 * supervisor and process lifecycle are exercised end to end. No Python worker.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import type { WorkerVolumeHydrationRequest } from '../../packages/medical-engine/src/worker/volume-types.ts';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const {
  ScientificWorkerBridge,
  WorkerTimeoutError,
  WorkerUnavailableError,
} = await import('../../packages/medical-engine/src/index.js');

const FAKE_WORKER = fileURLToPath(new URL('./fixtures/fake-worker.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TIMEOUT_MS = 120;

function spawnFake(env: Record<string, string>): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [FAKE_WORKER], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
}

/**
 * A structurally valid hydration request. On the hung attempt the worker never
 * reads it, so the source path is intentionally nonexistent: the point under
 * test is the lifecycle branch, not payload resolution.
 */
function hydrationRequest(): WorkerVolumeHydrationRequest {
  const digest = `sha256:${'a'.repeat(64)}`;
  return {
    locator: { kind: 'local-folder', path: '/nonexistent/ct-axial' },
    seriesInstanceUID: '1.2.3.4.5',
    expectedFingerprint: {
      studyInstanceUID: '1.2.3.4',
      seriesInstanceUID: '1.2.3.4.5',
      instanceCount: 3,
      contentDigest: digest,
      geometricDigest: digest,
    },
    expectedFrameOfReferenceUID: '1.2.3.4.5.for',
    expectedDimensions: [4, 4, 3],
    expectedGeometricDigest: digest,
    expectedRescale: { slope: 1, intercept: -1024 },
  } as unknown as WorkerVolumeHydrationRequest;
}

describe('NuClear ADR-013 §7 — volume timeout lifecycle branch', () => {
  it('restarts the worker before rejecting and issues no release', async () => {
    const children: ChildProcessWithoutNullStreams[] = [];
    const bridge = new ScientificWorkerBridge({
      requestTimeoutMs: TIMEOUT_MS,
      handshakeTimeoutMs: 5_000,
      restart: { maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 20 },
      spawnWorker: (attempt) => {
        const env: Record<string, string> = { FAKE_WORKER_MODE: 'respond' };
        if (attempt === 1) env.FAKE_WORKER_HANG_METHOD = 'nuclear.dicom.volume';
        const child = spawnFake(env);
        children.push(child);
        return child;
      },
    });
    const released: string[] = [];
    const spy = bridge as unknown as {
      releaseVolume: (handle: string) => Promise<void>;
    };
    const release = spy.releaseVolume.bind(bridge);
    spy.releaseVolume = async (handle: string): Promise<void> => {
      released.push(handle);
      await release(handle);
    };
    try {
      await bridge.start();
      await assert.rejects(
        bridge.hydrateVolume(hydrationRequest()),
        (error: unknown) =>
          error instanceof WorkerTimeoutError &&
          error.method === 'nuclear.dicom.volume' &&
          error.timeoutMs === TIMEOUT_MS,
      );
      // `stop()` + `start()` are awaited inside `hydrateVolume`, so the bridge is
      // already back to `ready` when the original timeout is observed.
      assert.equal(bridge.availability, 'ready');
      assert.ok(children.length >= 2, `expected a replacement spawn, got ${children.length}`);
      assert.ok(
        children[0].exitCode !== null || children[0].signalCode !== null,
        'the timed-out worker must have been terminated',
      );
      assert.deepEqual(released, [], 'no handle existed, so no release may be issued');
      const pong = await bridge.request<{ pong: boolean }>('nuclear.test.ping', {});
      assert.equal(pong.pong, true);
    } finally {
      await bridge.stop();
    }
  });

  it('fails closed with a typed WorkerUnavailableError when the restart cannot start', async () => {
    const bridge = new ScientificWorkerBridge({
      requestTimeoutMs: TIMEOUT_MS,
      handshakeTimeoutMs: 5_000,
      restart: { maxAttempts: 1, baseDelayMs: 5, maxDelayMs: 20 },
      spawnWorker: (attempt) => {
        const env: Record<string, string> = { FAKE_WORKER_MODE: 'respond' };
        if (attempt === 1) env.FAKE_WORKER_HANG_METHOD = 'nuclear.dicom.volume';
        if (attempt >= 2) env.FAKE_WORKER_CRASH_ON_START = '1';
        return spawnFake(env);
      },
    });
    try {
      await bridge.start();
      await assert.rejects(
        bridge.hydrateVolume(hydrationRequest()),
        (error: unknown) =>
          error instanceof WorkerUnavailableError &&
          !(error instanceof WorkerTimeoutError),
      );
      assert.equal(bridge.availability, 'failed');
    } finally {
      await bridge.stop();
    }
  });
});
