/**
 * @nuclear/medical-engine — pure spatial-transform application (ADR-012 §4 /
 * OD-2, ratified 2026-09-23).
 *
 * This is the single owned transform primitive: `view-engine` composes it and
 * must not re-implement matrix or geometry science (ADR-012 OD-2, invariant 7).
 * It is pure and Node-safe — no renderer, DOM or Cornerstone.
 *
 * The input `SpatialState` describes a source-frame view plane; the returned
 * state is the same plane expressed in the transform's target frame. Per
 * ADR-012 §4 `sliceOffsetMm` is carried unchanged (never mapped) and
 * `frameOfReferenceUID` is carried from the input — the target Frame of
 * Reference is composed by the caller from the link and is never invented here.
 * `patientPosition` is patient-level metadata and is carried when present.
 *
 * Validation is fail-closed and typed: only a proper rigid transform
 * (homogeneous last row, orthonormal columns, `det === +1`) is applied; an
 * affine/scale or a reflection is refused, never approximated.
 */

import type {
  DirectionCosines,
  Matrix4x4,
  Point3D,
  SpatialState,
  Vector3D,
} from '@nuclear/shared-types';

/**
 * Machine-epsilon-scale numerical guard, matching `NUMERICAL_GUARD` in
 * `worker/registration-evidence.ts`. A numerical guard, not a clinical
 * tolerance and not a registration-accuracy threshold.
 */
const NUMERICAL_GUARD = 1e-9;

export type SpatialTransformErrorCode = 'MATRIX_MALFORMED' | 'MATRIX_NOT_RIGID';

export class SpatialTransformError extends Error {
  readonly code: SpatialTransformErrorCode;

  constructor(code: SpatialTransformErrorCode, message: string) {
    super(message);
    this.name = 'SpatialTransformError';
    this.code = code;
  }
}

function absolute(value: number): number {
  return value < 0 ? -value : value;
}

function dot(a: Vector3D, b: Vector3D): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Reject anything that is not a finite, 16-element homogeneous matrix. */
function requireWellFormedMatrix(matrix: Matrix4x4): void {
  if (matrix.length !== 16) {
    throw new SpatialTransformError(
      'MATRIX_MALFORMED',
      `spatial transform matrix must have 16 elements, received ${matrix.length}.`,
    );
  }
  for (const value of matrix) {
    if (!Number.isFinite(value)) {
      throw new SpatialTransformError(
        'MATRIX_MALFORMED',
        'spatial transform matrix must contain only finite numbers.',
      );
    }
  }
  const guard = NUMERICAL_GUARD;
  if (
    absolute(matrix[12]) > guard ||
    absolute(matrix[13]) > guard ||
    absolute(matrix[14]) > guard ||
    absolute(matrix[15] - 1) > guard
  ) {
    throw new SpatialTransformError(
      'MATRIX_MALFORMED',
      'spatial transform matrix last row must be [0, 0, 0, 1].',
    );
  }
}

/** Reject a matrix whose upper 3x3 is not a proper (+1) rotation. */
function requireRigidRotation(matrix: Matrix4x4): void {
  const guard = NUMERICAL_GUARD;
  const c0: Vector3D = [matrix[0], matrix[4], matrix[8]];
  const c1: Vector3D = [matrix[1], matrix[5], matrix[9]];
  const c2: Vector3D = [matrix[2], matrix[6], matrix[10]];
  const unit =
    absolute(dot(c0, c0) - 1) <= guard &&
    absolute(dot(c1, c1) - 1) <= guard &&
    absolute(dot(c2, c2) - 1) <= guard;
  const orthogonal =
    absolute(dot(c0, c1)) <= guard &&
    absolute(dot(c0, c2)) <= guard &&
    absolute(dot(c1, c2)) <= guard;
  if (!unit || !orthogonal) {
    throw new SpatialTransformError(
      'MATRIX_NOT_RIGID',
      'spatial transform matrix 3x3 block is not orthonormal (an affine scale/shear is not rigid).',
    );
  }
  const determinant =
    matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9]) -
    matrix[1] * (matrix[4] * matrix[10] - matrix[6] * matrix[8]) +
    matrix[2] * (matrix[4] * matrix[9] - matrix[5] * matrix[8]);
  if (absolute(determinant - 1) > guard) {
    throw new SpatialTransformError(
      'MATRIX_NOT_RIGID',
      'spatial transform matrix 3x3 block determinant must be +1 (a reflection is not rigid).',
    );
  }
}

/** Apply only the rotation block (`R · v`) to a direction vector. */
function rotate(matrix: Matrix4x4, v: Vector3D): Vector3D {
  return [
    matrix[0] * v[0] + matrix[1] * v[1] + matrix[2] * v[2],
    matrix[4] * v[0] + matrix[5] * v[1] + matrix[6] * v[2],
    matrix[8] * v[0] + matrix[9] * v[1] + matrix[10] * v[2],
  ];
}

/** Apply the full homogeneous transform (`R · p + t`) to a point. */
function transformPoint(matrix: Matrix4x4, p: Point3D): Point3D {
  return [
    matrix[0] * p[0] + matrix[1] * p[1] + matrix[2] * p[2] + matrix[3],
    matrix[4] * p[0] + matrix[5] * p[1] + matrix[6] * p[2] + matrix[7],
    matrix[8] * p[0] + matrix[9] * p[1] + matrix[10] * p[2] + matrix[11],
  ];
}

/**
 * Apply a validated rigid transform to a `SpatialState`, returning a new plain
 * object. Inputs are never mutated and the result is never deep-frozen here:
 * `view-engine` freezes DTOs at assembly.
 */
export function applySpatialTransform(
  matrix: Matrix4x4,
  spatial: SpatialState,
): SpatialState {
  requireWellFormedMatrix(matrix);
  requireRigidRotation(matrix);

  const [or0, or1, or2, oc0, oc1, oc2] = spatial.orientation;
  const row = rotate(matrix, [or0, or1, or2]);
  const col = rotate(matrix, [oc0, oc1, oc2]);
  const orientation: DirectionCosines = [
    row[0],
    row[1],
    row[2],
    col[0],
    col[1],
    col[2],
  ];

  return {
    frameOfReferenceUID: spatial.frameOfReferenceUID,
    orientation,
    viewPlaneNormal: rotate(matrix, spatial.viewPlaneNormal),
    viewUp: rotate(matrix, spatial.viewUp),
    referenceLocation: transformPoint(matrix, spatial.referenceLocation),
    sliceOffsetMm: spatial.sliceOffsetMm,
    ...(spatial.patientPosition !== undefined
      ? { patientPosition: spatial.patientPosition }
      : {}),
  };
}
