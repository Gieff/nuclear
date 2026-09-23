/**
 * @nuclear/figure-engine — internal validation/affine primitives for the OD-5
 * patient projection (P5.4/P5.7). Not re-exported from the package barrel.
 *
 * Every rejection is a typed `FIGURE_ANNOTATION_INVALID`, never a bare
 * `TypeError`. Pure and Node-safe.
 */

import type { Point3D } from '@nuclear/shared-types';

import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import { refuse } from './guards.js';

export function refuseAnnotation(message: string): never {
  refuse(FIGURE_PUBLICATION_ERROR_CODES.annotationInvalid, message);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    refuseAnnotation(`${path} must be a plain object`);
  }
  return value;
}

export function asFiniteTriple(value: unknown, path: string): Point3D {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isFiniteNumber)) {
    refuseAnnotation(`${path} must be three finite numbers`);
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

export function asPositivePair(value: unknown, path: string): readonly [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !isFiniteNumber(value[0]) ||
    !isFiniteNumber(value[1]) ||
    value[0] <= 0 ||
    value[1] <= 0
  ) {
    refuseAnnotation(`${path} must be a pair of finite positive numbers`);
  }
  return [value[0], value[1]];
}

/** Row-major affine `Matrix4x4` validation (projective row m[12]=m[13]=m[14]=0, m[15]=1). */
export function asAffineMatrix(value: unknown, path: string): readonly number[] {
  if (!Array.isArray(value) || value.length !== 16 || !value.every(isFiniteNumber)) {
    refuseAnnotation(`${path} must be 16 finite numbers`);
  }
  if (value[12] !== 0 || value[13] !== 0 || value[14] !== 0 || value[15] !== 1) {
    refuseAnnotation(
      `${path} must be an affine row-major Matrix4x4 (projective row m[12]=m[13]=m[14]=0, m[15]=1)`,
    );
  }
  return value as readonly number[];
}

/** Applies a row-major affine 4x4 to a point with homogeneous `w = 1`. */
export function applyAffineMatrix(matrix: readonly number[], point: Point3D): Point3D {
  return [
    matrix[0] * point[0] + matrix[1] * point[1] + matrix[2] * point[2] + matrix[3],
    matrix[4] * point[0] + matrix[5] * point[1] + matrix[6] * point[2] + matrix[7],
    matrix[8] * point[0] + matrix[9] * point[1] + matrix[10] * point[2] + matrix[11],
  ];
}
