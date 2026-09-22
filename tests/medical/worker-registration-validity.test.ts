/**
 * NuClear Phase 2B.4 — `mapRegistrationResult` semantic hardening (fail-closed).
 *
 * Pure wire-shape only: no committed clinical fixture and no worker process.
 * Each negative case mutates exactly one field of an INLINE evidence object and
 * asserts the mapper throws `WorkerContractError`. `errorMarginMm` is validated
 * only WHEN PRESENT (the absent-residual admission policy is an open architect
 * decision, ADR-012 OD-6, and is not encoded here).
 */

import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const { WorkerContractError, mapRegistrationResult } = await import(
  '../../packages/medical-engine/src/index.js'
);

const IDENTITY = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

type WireEvidence = {
  transform: Record<string, unknown>;
  workerMetadata: Record<string, unknown>;
};

/** INLINE, wire-shape-only evidence with no semantic defect. */
function validEvidence(): WireEvidence {
  return {
    transform: {
      id: 'xform-evidence-1',
      sourceFrameOfReferenceUID: '1.2.3.4.5',
      targetFrameOfReferenceUID: '1.2.3.4.6',
      transformType: 'rigid',
      matrix4x4: [...IDENTITY],
      units: 'mm',
      provenance: {
        method: 'manual-alignment',
        workerVersion: '0.3.0',
        timestamp: '2026-09-22T12:00:00Z',
      },
      validity: {
        isValid: true,
        outOfDomainBehavior: 'warn',
        errorMarginMm: 0.25,
      },
    },
    workerMetadata: {
      workerVersion: '0.3.0',
      operation: 'nuclear.registration',
      timestamp: '2026-09-22T12:00:00Z',
      parameters: {},
    },
  };
}

function validityOf(evidence: WireEvidence): Record<string, unknown> {
  return evidence.transform.validity as Record<string, unknown>;
}

function provenanceOf(evidence: WireEvidence): Record<string, unknown> {
  return evidence.transform.provenance as Record<string, unknown>;
}

describe('NuClear Phase 2B.4 — registration mapper semantic hardening', () => {
  it('accepts valid wire-shape evidence', () => {
    const result = mapRegistrationResult(validEvidence());
    assert.equal(result.transform.validity.isValid, true);
    assert.equal(result.transform.validity.errorMarginMm, 0.25);
  });

  it('allows an absent errorMarginMm (policy-neutral)', () => {
    const evidence = validEvidence();
    delete validityOf(evidence).errorMarginMm;
    const result = mapRegistrationResult(evidence);
    assert.equal('errorMarginMm' in result.transform.validity, false);
  });

  it('fails closed when isValid is not true', () => {
    const evidence = validEvidence();
    validityOf(evidence).isValid = false;
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('fails closed on non-millimetre units', () => {
    const evidence = validEvidence();
    evidence.transform.units = 'cm';
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('fails closed on a non-finite matrix element', () => {
    const evidence = validEvidence();
    evidence.transform.matrix4x4 = [...IDENTITY.slice(0, 1), Number.NaN, ...IDENTITY.slice(2)];
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('accepts a valid rigid transform carrying a translation', () => {
    const evidence = validEvidence();
    evidence.transform.matrix4x4 = [
      1, 0, 0, 5,
      0, 1, 0, -3,
      0, 0, 1, 2,
      0, 0, 0, 1,
    ];
    const result = mapRegistrationResult(evidence);
    assert.equal(result.transform.matrix4x4[3], 5);
  });

  it('fails closed on a non-homogeneous last row', () => {
    const evidence = validEvidence();
    evidence.transform.matrix4x4 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      1, 0, 0, 1,
    ];
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('fails closed on a non-orthonormal rotation block', () => {
    const evidence = validEvidence();
    evidence.transform.matrix4x4 = [
      2, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('fails closed on a reflection (det = -1) rotation block', () => {
    const evidence = validEvidence();
    evidence.transform.matrix4x4 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, -1, 0,
      0, 0, 0, 1,
    ];
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('fails closed when source and target Frame of Reference are equal', () => {
    const evidence = validEvidence();
    evidence.transform.targetFrameOfReferenceUID = '1.2.3.4.5';
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('fails closed on an empty Frame of Reference', () => {
    const evidence = validEvidence();
    evidence.transform.sourceFrameOfReferenceUID = '';
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('fails closed on a negative present errorMarginMm', () => {
    const evidence = validEvidence();
    validityOf(evidence).errorMarginMm = -0.5;
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('fails closed on a non-finite present errorMarginMm', () => {
    const evidence = validEvidence();
    validityOf(evidence).errorMarginMm = Number.POSITIVE_INFINITY;
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('accepts an identity-typed identity matrix', () => {
    const evidence = validEvidence();
    evidence.transform.transformType = 'identity';
    const result = mapRegistrationResult(evidence);
    assert.equal(result.transform.transformType, 'identity');
  });

  it('fails closed on an identity-typed translated matrix (incoherent)', () => {
    const evidence = validEvidence();
    evidence.transform.transformType = 'identity';
    evidence.transform.matrix4x4 = [
      1, 0, 0, 5,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('fails closed on an unknown transformType', () => {
    const evidence = validEvidence();
    evidence.transform.transformType = 'similarity';
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('fails closed on a rigid-typed non-orthonormal matrix', () => {
    const evidence = validEvidence();
    evidence.transform.transformType = 'rigid';
    evidence.transform.matrix4x4 = [
      2, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('accepts an affine-typed scaled matrix (no orthonormality requirement)', () => {
    const evidence = validEvidence();
    evidence.transform.transformType = 'affine';
    evidence.transform.matrix4x4 = [
      2, 0, 0, 0,
      0, 3, 0, 0,
      0, 0, 4, 0,
      0, 0, 0, 1,
    ];
    const result = mapRegistrationResult(evidence);
    assert.equal(result.transform.transformType, 'affine');
    assert.equal(result.transform.matrix4x4[0], 2);
  });

  it('fails closed on an affine-typed non-homogeneous last row', () => {
    const evidence = validEvidence();
    evidence.transform.transformType = 'affine';
    evidence.transform.matrix4x4 = [
      2, 0, 0, 0,
      0, 3, 0, 0,
      0, 0, 4, 0,
      1, 0, 0, 1,
    ];
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('fails closed on an empty provenance workerVersion', () => {
    const evidence = validEvidence();
    provenanceOf(evidence).workerVersion = '';
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });

  it('fails closed on a malformed provenance timestamp', () => {
    const evidence = validEvidence();
    provenanceOf(evidence).timestamp = 'not-an-instant';
    assert.throws(() => mapRegistrationResult(evidence), WorkerContractError);
  });
});
