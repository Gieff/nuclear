/**
 * NuClear P2.5 — ScientificWorkerBridge against the real Python worker.
 *
 * Spawns `python/worker/.venv/bin/python -m worker` from the repository root
 * and verifies handshake compatibility plus concurrent mixed-outcome
 * correlation: one fulfilled handshake and three distinct structured errors.
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const {
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_METHOD_NOT_FOUND,
  NUCLEAR_SOURCE_UNAVAILABLE,
  REQUIRED_WORKER_OPERATIONS,
  ScientificWorkerBridge,
  WorkerProtocolError,
} = await import('../../packages/medical-engine/src/index.js');

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PYTHON = join(ROOT, 'python/worker/.venv/bin/python');
const MISSING_SOURCE = join(ROOT, 'tests/medical/__no_such_source__');

describe('NuClear P2.5 — ScientificWorkerBridge real worker', () => {
  it('handshakes and correlates mixed concurrent outcomes per request', async () => {
    assert.ok(existsSync(PYTHON), `worker venv python not found at ${PYTHON}`);
    const bridge = new ScientificWorkerBridge({
      command: PYTHON,
      args: ['-m', 'worker'],
      cwd: ROOT,
      requestTimeoutMs: 30_000,
      handshakeTimeoutMs: 30_000,
    });
    try {
      const handshake = await bridge.start();
      assert.ok(handshake.protocolVersions.includes('1.0'));
      assert.ok(handshake.workerMetadata.workerVersion.length > 0);
      assert.equal(handshake.workerMetadata.operation, 'nuclear.protocol.handshake');
      for (const operation of REQUIRED_WORKER_OPERATIONS) {
        assert.ok(handshake.operations.includes(operation), `missing operation ${operation}`);
      }

      const badLocator = { kind: 'local-folder', path: MISSING_SOURCE };
      const settled = await Promise.allSettled([
        bridge.request('nuclear.protocol.handshake', {}),
        bridge.request('nuclear.unknown.operation', {}),
        bridge.request('nuclear.dicom.inspect', { locator: 42 }),
        bridge.request('nuclear.dicom.inspect', { locator: badLocator }),
      ]);

      assert.equal(settled[0].status, 'fulfilled');
      assert.equal(settled[1].status, 'rejected');
      assert.equal(settled[2].status, 'rejected');
      assert.equal(settled[3].status, 'rejected');

      const unknown = settled[1].reason as WorkerProtocolError;
      const invalidParams = settled[2].reason as WorkerProtocolError;
      const unavailable = settled[3].reason as WorkerProtocolError;
      assert.ok(unknown instanceof WorkerProtocolError);
      assert.equal(unknown.code, JSON_RPC_METHOD_NOT_FOUND);
      assert.equal(unknown.method, 'nuclear.unknown.operation');
      assert.equal(invalidParams.code, JSON_RPC_INVALID_PARAMS);
      assert.equal(unavailable.code, NUCLEAR_SOURCE_UNAVAILABLE);
      assert.ok(unavailable.diagnostic.length > 0);
      assert.equal(bridge.pendingRequestCount, 0);

      await assert.rejects(
        bridge.inspect({ kind: 'local-folder', path: MISSING_SOURCE }),
        (error: unknown) =>
          error instanceof WorkerProtocolError && error.code === NUCLEAR_SOURCE_UNAVAILABLE,
      );
      assert.equal(bridge.pendingRequestCount, 0);
    } finally {
      await bridge.stop();
    }
  });
});
