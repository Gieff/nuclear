/**
 * NuClear P4.4b (ADR-012 §4 / OD-2) — pure `applySpatialTransform`.
 *
 * Hand-computed expectations only: identity, a 90° rotation about z plus a
 * translation, carried-not-mapped fields, and the typed fail-closed matrix
 * refusals. No property/fuzz comparison.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import { MOCK_FOR_UID } from '../fixtures/clinical-contracts.fixture.ts';
import type {
  Matrix4x4,
  SpatialState,
} from '../../packages/shared-types/src/index.js';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const { SpatialTransformError, applySpatialTransform } = await import(
  '../../packages/medical-engine/src/index.js'
);

const GUARD = 1e-9;

function close(actual: number, expected: number, label: string): void {
  assert.ok(
    Math.abs(actual - expected) <= GUARD,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

function closeVec(
  actual: readonly number[],
  expected: readonly number[],
  label: string,
): void {
  assert.equal(actual.length, expected.length, `${label} length`);
  expected.forEach((value, index) => {
    close(actual[index], value, `${label}[${index}]`);
  });
}

/** Base view plane: LPS axial, view plane normal +z, reference voxel (10,20,30). */
const BASE: SpatialState = {
  frameOfReferenceUID: MOCK_FOR_UID,
  patientPosition: 'HFS',
  orientation: [1, 0, 0, 0, 1, 0],
  viewPlaneNormal: [0, 0, 1],
  viewUp: [0, -1, 0],
  referenceLocation: [10, 20, 30],
  sliceOffsetMm: 12.5,
};

const IDENTITY: Matrix4x4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

/**
 * 90° rotation about z mapping x→y, y→−x, plus translation (10, 20, 30):
 * R = [0,−1,0; 1,0,0; 0,0,1].
 */
const RZ90_AND_TRANSLATE: Matrix4x4 = [
  0, -1, 0, 10,
  1, 0, 0, 20,
  0, 0, 1, 30,
  0, 0, 0, 1,
];

function expectCode(matrix: Matrix4x4, code: string): void {
  assert.throws(
    () => applySpatialTransform(matrix, BASE),
    (error: unknown) => {
      assert.ok(
        error instanceof SpatialTransformError,
        `expected SpatialTransformError, received ${String(error)}`,
      );
      assert.equal(error.code, code);
      return true;
    },
  );
}

describe('NuClear P4.4b — applySpatialTransform (ADR-012 OD-2)', () => {
  it('identity leaves every field unchanged', () => {
    const out = applySpatialTransform(IDENTITY, BASE);
    assert.equal(out.frameOfReferenceUID, BASE.frameOfReferenceUID);
    assert.equal(out.sliceOffsetMm, BASE.sliceOffsetMm);
    assert.equal(out.patientPosition, BASE.patientPosition);
    closeVec(out.referenceLocation, BASE.referenceLocation, 'referenceLocation');
    closeVec(out.orientation, BASE.orientation, 'orientation');
    closeVec(out.viewPlaneNormal, BASE.viewPlaneNormal, 'viewPlaneNormal');
    closeVec(out.viewUp, BASE.viewUp, 'viewUp');
  });

  it('applies a 90° z rotation + translation with hand-computed fields', () => {
    const out = applySpatialTransform(RZ90_AND_TRANSLATE, BASE);
    // R·(10,20,30) = (−20,10,30); + t(10,20,30) = (−10,30,60).
    closeVec(out.referenceLocation, [-10, 30, 60], 'referenceLocation');
    // row (1,0,0) → (0,1,0); col (0,1,0) → (−1,0,0).
    closeVec(out.orientation, [0, 1, 0, -1, 0, 0], 'orientation');
    // n (0,0,1) → (0,0,1); u (0,−1,0) → (1,0,0).
    closeVec(out.viewPlaneNormal, [0, 0, 1], 'viewPlaneNormal');
    closeVec(out.viewUp, [1, 0, 0], 'viewUp');
    assert.equal(out.sliceOffsetMm, 12.5);
    assert.equal(out.frameOfReferenceUID, MOCK_FOR_UID);
    assert.equal(out.patientPosition, 'HFS');
  });

  it('carries sliceOffsetMm and frameOfReferenceUID unchanged (carried, not mapped)', () => {
    const translationOnly: Matrix4x4 = [
      1, 0, 0, 100,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const out = applySpatialTransform(translationOnly, BASE);
    closeVec(out.referenceLocation, [110, 20, 30], 'referenceLocation');
    assert.equal(out.sliceOffsetMm, BASE.sliceOffsetMm);
    assert.equal(out.frameOfReferenceUID, BASE.frameOfReferenceUID);
    assert.equal(out.patientPosition, 'HFS');
  });

  it('refuses an affine/scale 3x3 as MATRIX_NOT_RIGID', () => {
    const scale: Matrix4x4 = [
      2, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    expectCode(scale, 'MATRIX_NOT_RIGID');
  });

  it('refuses a reflection (det = −1) as MATRIX_NOT_RIGID', () => {
    const reflect: Matrix4x4 = [
      -1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    expectCode(reflect, 'MATRIX_NOT_RIGID');
  });

  it('refuses a NaN entry as MATRIX_MALFORMED', () => {
    const nan: Matrix4x4 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, Number.NaN,
    ];
    expectCode(nan, 'MATRIX_MALFORMED');
  });

  it('refuses a wrong-length matrix as MATRIX_MALFORMED', () => {
    const short = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0] as unknown as Matrix4x4;
    expectCode(short, 'MATRIX_MALFORMED');
  });

  it('refuses a non-homogeneous last row as MATRIX_MALFORMED', () => {
    const badLastRow: Matrix4x4 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 2,
    ];
    expectCode(badLastRow, 'MATRIX_MALFORMED');
  });

  it('does not mutate the input SpatialState', () => {
    const input: SpatialState = {
      frameOfReferenceUID: MOCK_FOR_UID,
      patientPosition: 'HFS',
      orientation: [1, 0, 0, 0, 1, 0],
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, -1, 0],
      referenceLocation: [10, 20, 30],
      sliceOffsetMm: 12.5,
    };
    const snapshot = structuredClone(input);
    Object.freeze(input.orientation);
    Object.freeze(input.viewPlaneNormal);
    Object.freeze(input.viewUp);
    Object.freeze(input.referenceLocation);
    Object.freeze(input);
    const out = applySpatialTransform(RZ90_AND_TRANSLATE, input);
    assert.notEqual(out, input);
    assert.deepEqual(input, snapshot);
  });
});
