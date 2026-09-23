/**
 * Deterministic `nuclear.registration` request builders and inline wire-shape
 * evidence for the Phase 2B test suites.
 *
 * No real transform and no committed clinical fixture: `identityEvidence` is an
 * INLINE wire-shape object only. These helpers keep the worker-registration
 * suites within the File Length Gate (Rule 02).
 */

import type { WorkerRegistrationRequest } from '../../../packages/medical-engine/src/worker/registration-types.js';

export const LANDMARK_PAIRS = [
  { source: [0, 0, 0], target: [1, 1, 1] },
  { source: [1, 0, 0], target: [2, 1, 1] },
  { source: [0, 1, 0], target: [1, 2, 1] },
] as const;

export const DEGENERATE_COLLINEAR_PAIRS = [
  { source: [0, 0, 0], target: [1, 1, 1] },
  { source: [10, 0, 0], target: [2, 1, 1] },
  { source: [20, 0, 0], target: [1, 2, 1] },
] as const;

export function rigidRequest(): WorkerRegistrationRequest {
  return {
    mode: 'rigid',
    transformId: 'xform-rigid-1',
    outOfDomainBehavior: 'clamp',
    fixed: {
      locator: { kind: 'local-folder', path: '/data/fixed' },
      seriesInstanceUID: '1.2.3.4.5',
      expectedFingerprint: {
        studyInstanceUID: '1.2.3.4',
        seriesInstanceUID: '1.2.3.4.5',
        instanceCount: 3,
        contentDigest: `sha256:${'0'.repeat(64)}`,
        geometricDigest: `sha256:${'1'.repeat(64)}`,
        totalBytes: 1234,
      },
      expectedFrameOfReferenceUID: '1.2.3.4.5.for',
    },
    moving: {
      locator: { kind: 'local-folder', path: '/data/moving' },
      seriesInstanceUID: '1.2.3.4.6',
      expectedFingerprint: {
        studyInstanceUID: '1.2.3.4',
        seriesInstanceUID: '1.2.3.4.6',
        instanceCount: 3,
        contentDigest: `sha256:${'2'.repeat(64)}`,
        geometricDigest: `sha256:${'3'.repeat(64)}`,
      },
      expectedFrameOfReferenceUID: '1.2.3.4.6.for',
    },
  } as WorkerRegistrationRequest;
}

export function landmarkRequest(): WorkerRegistrationRequest {
  return {
    mode: 'landmarks',
    transformId: 'xform-landmark-1',
    outOfDomainBehavior: 'warn',
    sourceFrameOfReferenceUID: '1.2.3.4.5',
    targetFrameOfReferenceUID: '1.2.3.4.6',
    landmarks: LANDMARK_PAIRS,
  } as unknown as WorkerRegistrationRequest;
}

export function invalidModeRequest(): WorkerRegistrationRequest {
  return {
    mode: 'elastic',
    transformId: 'xform-bad-mode',
    outOfDomainBehavior: 'clamp',
    sourceFrameOfReferenceUID: '1.2.3.4.5',
    targetFrameOfReferenceUID: '1.2.3.4.6',
    landmarks: LANDMARK_PAIRS,
  } as unknown as WorkerRegistrationRequest;
}

export function sameFrameLandmarkRequest(): WorkerRegistrationRequest {
  return {
    mode: 'landmarks',
    transformId: 'xform-landmark-same-for',
    outOfDomainBehavior: 'warn',
    sourceFrameOfReferenceUID: '1.2.3.4.5',
    targetFrameOfReferenceUID: '1.2.3.4.5',
    landmarks: LANDMARK_PAIRS,
  } as unknown as WorkerRegistrationRequest;
}

export function degenerateLandmarkRequest(): WorkerRegistrationRequest {
  return {
    mode: 'landmarks',
    transformId: 'xform-landmark-collinear',
    outOfDomainBehavior: 'warn',
    sourceFrameOfReferenceUID: '1.2.3.4.5',
    targetFrameOfReferenceUID: '1.2.3.4.6',
    landmarks: DEGENERATE_COLLINEAR_PAIRS,
  } as unknown as WorkerRegistrationRequest;
}

export const IDENTITY_MATRIX = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

/** INLINE wire-shape evidence only: no committed clinical fixture. */
export function identityEvidence(): Record<string, unknown> {
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
