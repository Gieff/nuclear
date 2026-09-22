/**
 * @nuclear/medical-engine — fail-closed semantic validation of registration
 * `SpatialTransform` evidence (Phase 2B.4).
 *
 * Contract validation, **not** geometry derivation: this module never produces,
 * converts or repairs a transform. It checks the `validity.isValid === true`
 * flag, non-empty distinct Frame of Reference UIDs, a coherent `matrix4x4`, and
 * a present `errorMarginMm` (`>= 0`). No scientific formula is duplicated and no
 * arithmetic beyond the matrix contract checks is performed.
 *
 * **[R8 `transformType` <-> matrix coherence].** The matrix is checked against
 * the declared `transformType`, fail-closed: `identity` requires the 4x4
 * identity; `rigid` requires the homogeneous last row and a proper orthonormal
 * `det === +1` rotation block; `affine` requires only the finite homogeneous
 * last row, so a legitimate scale/shear is **not** rejected.
 *
 * `errorMarginMm` is validated **only when present**: the admission policy for
 * an absent residual (ADR-012 OD-6) is an open architect decision and is
 * deliberately not encoded here.
 */

import type { Matrix4x4, SpatialTransform } from '@nuclear/shared-types';
import { WorkerContractError } from './errors.js';

/**
 * Machine-epsilon-scale guard for the homogeneous-last-row, identity and
 * orthonormality checks. A numerical guard, **not** a clinical tolerance and
 * **not** a registration-accuracy threshold.
 */
const NUMERICAL_GUARD = 1e-9;

/** The exact 4x4 identity, compared element-wise for the `identity` type. */
const IDENTITY_MATRIX: Matrix4x4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

function absolute(value: number): number {
  return value < 0 ? -value : value;
}

/** Require the homogeneous last row `[0, 0, 0, 1]`. */
function requireHomogeneousLastRow(matrix: Matrix4x4): void {
  const guard = NUMERICAL_GUARD;
  if (
    absolute(matrix[12]) > guard ||
    absolute(matrix[13]) > guard ||
    absolute(matrix[14]) > guard ||
    absolute(matrix[15] - 1) > guard
  ) {
    throw new WorkerContractError(
      'registration.transform.matrix4x4 last row must be [0, 0, 0, 1].',
    );
  }
}

/** Require the `identity` coherence: the whole 4x4 equals the identity. */
function requireIdentityMatrix(matrix: Matrix4x4): void {
  for (let index = 0; index < 16; index += 1) {
    if (absolute(matrix[index] - IDENTITY_MATRIX[index]) > NUMERICAL_GUARD) {
      throw new WorkerContractError(
        "registration.transform.matrix4x4 for transformType 'identity' must be the 4x4 identity.",
      );
    }
  }
}

/** Require the `rigid` coherence: homogeneous last row + proper rotation. */
function requireProperRigidMatrix(matrix: Matrix4x4): void {
  const guard = NUMERICAL_GUARD;
  requireHomogeneousLastRow(matrix);
  const c0: readonly [number, number, number] = [matrix[0], matrix[4], matrix[8]];
  const c1: readonly [number, number, number] = [matrix[1], matrix[5], matrix[9]];
  const c2: readonly [number, number, number] = [matrix[2], matrix[6], matrix[10]];
  const products = [
    c0[0] * c0[0] + c0[1] * c0[1] + c0[2] * c0[2],
    c0[0] * c1[0] + c0[1] * c1[1] + c0[2] * c1[2],
    c0[0] * c2[0] + c0[1] * c2[1] + c0[2] * c2[2],
    c1[0] * c1[0] + c1[1] * c1[1] + c1[2] * c1[2],
    c1[0] * c2[0] + c1[1] * c2[1] + c1[2] * c2[2],
    c2[0] * c2[0] + c2[1] * c2[1] + c2[2] * c2[2],
  ];
  const identity = [1, 0, 0, 1, 0, 1];
  if (
    absolute(products[0] - identity[0]) > guard ||
    absolute(products[1] - identity[1]) > guard ||
    absolute(products[2] - identity[2]) > guard ||
    absolute(products[3] - identity[3]) > guard ||
    absolute(products[4] - identity[4]) > guard ||
    absolute(products[5] - identity[5]) > guard
  ) {
    throw new WorkerContractError(
      'registration.transform.matrix4x4 3x3 block is not orthonormal.',
    );
  }
  const determinant =
    matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9]) -
    matrix[1] * (matrix[4] * matrix[10] - matrix[6] * matrix[8]) +
    matrix[2] * (matrix[4] * matrix[9] - matrix[5] * matrix[8]);
  if (absolute(determinant - 1) > guard) {
    throw new WorkerContractError(
      'registration.transform.matrix4x4 3x3 block determinant must be +1.',
    );
  }
}

/**
 * Require the `affine` coherence: a finite matrix with a homogeneous last row.
 * A legitimate affine scale/shear carries no orthonormality requirement.
 */
function requireHomogeneousMatrix(matrix: Matrix4x4): void {
  requireHomogeneousLastRow(matrix);
}

/** Dispatch the matrix check on the declared `transformType`, fail-closed. */
function requireCoherentMatrix(transform: SpatialTransform): void {
  if (transform.transformType === 'identity') {
    requireIdentityMatrix(transform.matrix4x4);
    return;
  }
  if (transform.transformType === 'rigid') {
    requireProperRigidMatrix(transform.matrix4x4);
    return;
  }
  if (transform.transformType === 'affine') {
    requireHomogeneousMatrix(transform.matrix4x4);
    return;
  }
  throw new WorkerContractError(
    `registration.transform.transformType '${String(
      transform.transformType,
    )}' is not a NuClear TransformType.`,
  );
}

/** Refuse a semantically invalid `SpatialTransform`, failing closed. */
export function requireSemanticEvidence(transform: SpatialTransform): void {
  if (transform.validity.isValid !== true) {
    throw new WorkerContractError('registration.transform.validity.isValid must be true.');
  }
  const source = transform.sourceFrameOfReferenceUID;
  const target = transform.targetFrameOfReferenceUID;
  if (source === '' || target === '') {
    throw new WorkerContractError(
      'registration.transform source/target FrameOfReferenceUID must be non-empty.',
    );
  }
  if (source === target) {
    throw new WorkerContractError(
      'registration.transform source and target FrameOfReferenceUID must be distinct.',
    );
  }
  requireCoherentMatrix(transform);
  const margin = transform.validity.errorMarginMm;
  if (margin !== undefined && margin < 0) {
    throw new WorkerContractError(
      'registration.transform.validity.errorMarginMm must be >= 0 when present.',
    );
  }
}
