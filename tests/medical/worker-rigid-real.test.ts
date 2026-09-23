/**
 * NuClear Phase 2B.3b — real-worker `mode: 'rigid'` MI registration.
 *
 * Proves the rigid TS request DTO now satisfies the per-side
 * fingerprint/Frame-of-Reference schema and that a real Mutual-Information
 * registration over the committed `mi-fixed`/`mi-moving` fixtures round-trips to
 * a typed rigid `SpatialTransform`. The mapper must not fabricate an
 * `errorMarginMm`: MI is dimensionless and emits no mm residual (R11-B).
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import type {
  WorkerRegistrationAssetRef,
  WorkerRegistrationRequest,
} from '../../packages/medical-engine/src/worker/registration-types.ts';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const { ScientificWorkerBridge } = await import('../../packages/medical-engine/src/index.js');

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PYTHON = join(ROOT, 'python/worker/.venv/bin/python');
const VOLUMES = join(ROOT, 'tests/rendering/fixtures/volumes');
const MI_FIXED_SERIES = '1.2.826.0.1.3680043.10.7100.2';
const MI_MOVING_SERIES = '1.2.826.0.1.3680043.10.7100.3';

function miSide(label: string, seriesInstanceUID: string): WorkerRegistrationAssetRef {
  const fingerprint = JSON.parse(
    readFileSync(join(VOLUMES, label, 'expected-fingerprint.json'), 'utf8'),
  ) as {
    studyInstanceUID: string;
    seriesInstanceUID: string;
    instanceCount: number;
    contentDigest: string;
    geometricDigest: string;
    sopInstanceUIDsHash: string;
    totalBytes: number;
    frameOfReferenceUID: string;
  };
  return {
    locator: { kind: 'local-folder', path: join(VOLUMES, label, 'instances') },
    seriesInstanceUID,
    expectedFingerprint: {
      studyInstanceUID: fingerprint.studyInstanceUID,
      seriesInstanceUID: fingerprint.seriesInstanceUID,
      instanceCount: fingerprint.instanceCount,
      contentDigest: fingerprint.contentDigest,
      geometricDigest: fingerprint.geometricDigest,
      sopInstanceUIDsHash: fingerprint.sopInstanceUIDsHash,
      totalBytes: fingerprint.totalBytes,
    } as WorkerRegistrationAssetRef['expectedFingerprint'],
    expectedFrameOfReferenceUID:
      fingerprint.frameOfReferenceUID as WorkerRegistrationAssetRef['expectedFrameOfReferenceUID'],
  };
}

function miRigidRequest(): WorkerRegistrationRequest {
  return {
    mode: 'rigid',
    transformId: 'xform-mi-ipc',
    outOfDomainBehavior: 'clamp',
    fixed: miSide('mi-fixed', MI_FIXED_SERIES),
    moving: miSide('mi-moving', MI_MOVING_SERIES),
  } as WorkerRegistrationRequest;
}

describe('NuClear Phase 2B.3b — real rigid MI registration', () => {
  it('recovers a rigid transform and never fabricates an error margin', async () => {
    assert.ok(existsSync(PYTHON), `worker venv python not found at ${PYTHON}`);
    const bridge = new ScientificWorkerBridge({
      command: PYTHON,
      args: ['-m', 'worker'],
      cwd: ROOT,
      requestTimeoutMs: 120_000,
      handshakeTimeoutMs: 30_000,
    });
    try {
      await bridge.start();
      const result = await bridge.registration(miRigidRequest());
      const transform = result.transform;
      assert.equal(transform.id, 'xform-mi-ipc');
      assert.equal(transform.transformType, 'rigid');
      assert.equal(transform.units, 'mm');
      assert.equal(transform.provenance.method, 'rigid-coregistration');
      assert.equal(transform.validity.isValid, true);
      assert.equal(transform.validity.outOfDomainBehavior, 'clamp');
      assert.equal('errorMarginMm' in transform.validity, false);
      assert.equal(transform.validity.errorMarginMm, undefined);
      assert.equal(transform.matrix4x4.length, 16);
      assert.equal(transform.matrix4x4[15], 1);
      assert.ok(transform.matrix4x4.every((value) => Number.isFinite(value)));
      assert.equal(result.workerMetadata.operation, 'nuclear.registration');
      assert.equal(result.workerMetadata.parameters?.mode, 'rigid');
    } finally {
      await bridge.stop();
    }
  });
});
