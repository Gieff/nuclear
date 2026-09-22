/**
 * NuClear Phase 2B.1 — `nuclear.registration` registration + bridge surface.
 *
 * Spawns the real Python worker and proves the handshake advertises the new
 * operation, that a schema-valid request fails closed with the reserved
 * `-32011` code (no fabricated transform), and that an invalid mode maps to
 * `-32602`. A separate pure-shape test exercises the mapper against an INLINE
 * *wire-shape only* evidence object — not a committed clinical fixture.
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import type { WorkerRegistrationRequest } from '../../packages/medical-engine/src/worker/registration-types.js';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const {
  JSON_RPC_INVALID_PARAMS,
  NUCLEAR_OPERATION_NOT_IMPLEMENTED,
  REGISTRATION_METHOD,
  ScientificWorkerBridge,
  WorkerContractError,
  WorkerProtocolError,
  mapRegistrationResult,
  registrationRequestParams,
} = await import('../../packages/medical-engine/src/index.js');

type WorkerProtocolFailure = InstanceType<typeof WorkerProtocolError>;

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PYTHON = join(ROOT, 'python/worker/.venv/bin/python');

const LANDMARK_PAIRS = [
  { source: [0, 0, 0], target: [1, 1, 1] },
  { source: [1, 0, 0], target: [2, 1, 1] },
  { source: [0, 1, 0], target: [1, 2, 1] },
] as const;

function rigidRequest(): WorkerRegistrationRequest {
  return {
    mode: 'rigid',
    transformId: 'xform-rigid-1',
    outOfDomainBehavior: 'clamp',
    fixed: {
      locator: { kind: 'local-folder', path: '/data/fixed' },
      seriesInstanceUID: '1.2.3.4.5',
    },
    moving: {
      locator: { kind: 'local-folder', path: '/data/moving' },
      seriesInstanceUID: '1.2.3.4.6',
    },
  } as WorkerRegistrationRequest;
}

function landmarkRequest(): WorkerRegistrationRequest {
  return {
    mode: 'landmarks',
    transformId: 'xform-landmark-1',
    outOfDomainBehavior: 'warn',
    sourceFrameOfReferenceUID: '1.2.3.4.5',
    targetFrameOfReferenceUID: '1.2.3.4.6',
    landmarks: LANDMARK_PAIRS,
  } as unknown as WorkerRegistrationRequest;
}

function invalidModeRequest(): WorkerRegistrationRequest {
  return {
    mode: 'elastic',
    transformId: 'xform-bad-mode',
    outOfDomainBehavior: 'clamp',
    sourceFrameOfReferenceUID: '1.2.3.4.5',
    targetFrameOfReferenceUID: '1.2.3.4.6',
    landmarks: LANDMARK_PAIRS,
  } as unknown as WorkerRegistrationRequest;
}

describe('NuClear Phase 2B.1 — nuclear.registration real worker', () => {
  it('advertises the operation, refuses fabrication and rejects a bad mode', async () => {
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
      assert.ok(
        handshake.operations.includes(REGISTRATION_METHOD),
        `handshake must advertise ${REGISTRATION_METHOD}`,
      );

      const validRejection = await bridge.registration(rigidRequest()).then(
        () => undefined,
        (error: unknown) => error,
      );
      assert.ok(validRejection instanceof WorkerProtocolError);
      const notImplemented = validRejection as WorkerProtocolFailure;
      assert.equal(notImplemented.code, NUCLEAR_OPERATION_NOT_IMPLEMENTED);
      assert.equal(notImplemented.data.phaseSlice, '2B.1');
      assert.equal(notImplemented.data.mode, 'rigid');
      assert.equal('transform' in notImplemented.data, false);
      assert.equal('matrix4x4' in notImplemented.data, false);

      const invalidRejection = await bridge.registration(invalidModeRequest()).then(
        () => undefined,
        (error: unknown) => error,
      );
      assert.ok(invalidRejection instanceof WorkerProtocolError);
      assert.equal((invalidRejection as WorkerProtocolFailure).code, JSON_RPC_INVALID_PARAMS);
      assert.equal(bridge.pendingRequestCount, 0);
    } finally {
      await bridge.stop();
    }
  });
});

describe('NuClear Phase 2B.1 — registration mappers (wire-shape only)', () => {
  // INLINE wire-shape: no committed clinical fixture and no real transform.
  const IDENTITY_MATRIX = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];

  function identityEvidence(): Record<string, unknown> {
    return {
      transform: {
        id: 'xform-identity-1',
        sourceFrameOfReferenceUID: '1.2.3.4.5',
        targetFrameOfReferenceUID: '1.2.3.4.6',
        transformType: 'identity',
        matrix4x4: [...IDENTITY_MATRIX],
        units: 'mm',
        provenance: {
          method: 'identity',
          workerVersion: '0.2.0',
          timestamp: '2026-09-20T00:00:00Z',
        },
        validity: { isValid: true, outOfDomainBehavior: 'warn' },
      },
      workerMetadata: {
        workerVersion: '0.2.0',
        operation: 'nuclear.registration',
        timestamp: '2026-09-20T00:00:00Z',
        parameters: {},
      },
    };
  }

  it('maps identity evidence verbatim and omits an absent residual', () => {
    const result = mapRegistrationResult(identityEvidence());
    assert.equal(result.transform.id, 'xform-identity-1');
    assert.equal(result.transform.sourceFrameOfReferenceUID, '1.2.3.4.5');
    assert.equal(result.transform.targetFrameOfReferenceUID, '1.2.3.4.6');
    assert.equal(result.transform.transformType, 'identity');
    assert.deepEqual(result.transform.matrix4x4, IDENTITY_MATRIX);
    assert.equal(result.transform.units, 'mm');
    assert.equal(result.transform.provenance.method, 'identity');
    assert.equal(result.transform.validity.isValid, true);
    assert.equal('errorMarginMm' in result.transform.validity, false);
    assert.equal(result.workerMetadata.operation, 'nuclear.registration');
  });

  it('fails closed on a malformed 15-element matrix', () => {
    const malformed = identityEvidence();
    const transform = malformed.transform as Record<string, unknown>;
    transform.matrix4x4 = IDENTITY_MATRIX.slice(0, 15);
    assert.throws(() => mapRegistrationResult(malformed), WorkerContractError);
  });

  it('serializes both request modes exactly', () => {
    assert.deepEqual(registrationRequestParams(rigidRequest()), {
      mode: 'rigid',
      transformId: 'xform-rigid-1',
      outOfDomainBehavior: 'clamp',
      fixed: {
        locator: { kind: 'local-folder', path: '/data/fixed' },
        seriesInstanceUID: '1.2.3.4.5',
      },
      moving: {
        locator: { kind: 'local-folder', path: '/data/moving' },
        seriesInstanceUID: '1.2.3.4.6',
      },
    });
    assert.deepEqual(registrationRequestParams(landmarkRequest()), {
      mode: 'landmarks',
      transformId: 'xform-landmark-1',
      outOfDomainBehavior: 'warn',
      sourceFrameOfReferenceUID: '1.2.3.4.5',
      targetFrameOfReferenceUID: '1.2.3.4.6',
      landmarks: [
        { source: [0, 0, 0], target: [1, 1, 1] },
        { source: [1, 0, 0], target: [2, 1, 1] },
        { source: [0, 1, 0], target: [1, 2, 1] },
      ],
    });
  });
});
