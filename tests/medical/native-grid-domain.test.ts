/**
 * NuClear P4.4b (ADR-012 OD-3) — native grid domain evidence.
 *
 * The domain is decided by index-space math over the oriented grid
 * (`dimensions`, `spacing`, `origin`, `direction`), never by the axis-aligned
 * `bounds` enclosure. Border convention: indices in `[-0.5, dim - 0.5]`.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import {
  mockCtGeometry,
  mockObliqueGeometry,
} from '../fixtures/clinical-contracts.fixture.ts';
import type {
  AssetGeometry,
  Point3D,
} from '../../packages/shared-types/src/index.js';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const {
  NativeGridDomainError,
  clampPointToNativeGridDomain,
  isPointInNativeGridDomain,
} = await import('../../packages/medical-engine/src/index.js');

const GUARD = 1e-9;
const CT = mockCtGeometry;
const OBLIQUE = mockObliqueGeometry;

function closeVec(
  actual: readonly number[],
  expected: readonly number[],
  label: string,
): void {
  expected.forEach((value, index) => {
    assert.ok(
      Math.abs(actual[index] - value) <= GUARD,
      `${label}[${index}]: expected ${value}, received ${actual[index]}`,
    );
  });
}

/** Identity-direction CT: index (i,j,k) → LPS point. */
function ctPoint(i: number, j: number, k: number): Point3D {
  return [
    CT.origin[0] + i * CT.spacing[0],
    CT.origin[1] + j * CT.spacing[1],
    CT.origin[2] + k * CT.spacing[2],
  ];
}

/** Right-handed unit slice axis `normalize(row × column)` of the oblique grid. */
function obliqueNormal(): readonly [number, number, number] {
  const [r0, r1, r2, c0, c1, c2] = OBLIQUE.direction;
  const raw = [r1 * c2 - r2 * c1, r2 * c0 - r0 * c2, r0 * c1 - r1 * c0];
  const magnitude = Math.hypot(raw[0], raw[1], raw[2]);
  return [raw[0] / magnitude, raw[1] / magnitude, raw[2] / magnitude];
}

/** Oblique grid: index (i,j,k) → LPS point. */
function obliquePoint(i: number, j: number, k: number): Point3D {
  const [r0, r1, r2, c0, c1, c2] = OBLIQUE.direction;
  const [n0, n1, n2] = obliqueNormal();
  const [sx, sy, sz] = OBLIQUE.spacing;
  return [
    OBLIQUE.origin[0] + i * sx * r0 + j * sy * c0 + k * sz * n0,
    OBLIQUE.origin[1] + i * sx * r1 + j * sy * c1 + k * sz * n1,
    OBLIQUE.origin[2] + i * sx * r2 + j * sy * c2 + k * sz * n2,
  ];
}

/** Recompute grid indices of a point in the oblique grid for round-trip checks. */
function obliqueIndices(point: Point3D): readonly [number, number, number] {
  const [r0, r1, r2, c0, c1, c2] = OBLIQUE.direction;
  const [n0, n1, n2] = obliqueNormal();
  const d = [
    point[0] - OBLIQUE.origin[0],
    point[1] - OBLIQUE.origin[1],
    point[2] - OBLIQUE.origin[2],
  ];
  return [
    (d[0] * r0 + d[1] * r1 + d[2] * r2) / OBLIQUE.spacing[0],
    (d[0] * c0 + d[1] * c1 + d[2] * c2) / OBLIQUE.spacing[1],
    (d[0] * n0 + d[1] * n1 + d[2] * n2) / OBLIQUE.spacing[2],
  ];
}

function expectInvalid(geometry: AssetGeometry): void {
  assert.throws(
    () => isPointInNativeGridDomain(geometry, [0, 0, 0]),
    (error: unknown) => {
      assert.ok(
        error instanceof NativeGridDomainError,
        `expected NativeGridDomainError, received ${String(error)}`,
      );
      assert.equal(error.code, 'GRID_EVIDENCE_INVALID');
      return true;
    },
  );
}

describe('NuClear P4.4b — native grid domain (ADR-012 OD-3)', () => {
  it('identity CT: origin and far-corner voxels are in domain', () => {
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(0, 0, 0)), true);
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(511, 511, 199)), true);
  });

  it('identity CT: one voxel beyond each face is out of domain', () => {
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(512, 0, 0)), false);
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(-1, 0, 0)), false);
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(0, 512, 0)), false);
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(0, -1, 0)), false);
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(0, 0, 200)), false);
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(0, 0, -1)), false);
  });

  it('identity CT: exact ±0.5 half-voxel borders are in domain', () => {
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(-0.5, 0, 0)), true);
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(511.5, 0, 0)), true);
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(0, -0.5, 0)), true);
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(0, 511.5, 0)), true);
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(0, 0, -0.5)), true);
    assert.equal(isPointInNativeGridDomain(CT, ctPoint(0, 0, 199.5)), true);
  });

  it('identity CT: clamps +x overshoot to the 511.5 border and keeps y/z', () => {
    // +x face is x = 250; 5 mm beyond is 255 (index 516.6). y=0→j=255.5 and
    // z=−500→k=0 are both inside the domain, so only x changes.
    const clamped = clampPointToNativeGridDomain(CT, [255, 0, -500]);
    closeVec(clamped, [250, 0, -500], 'clamped');
  });

  it('identity CT: clamps a −x overshoot to the −0.5 border', () => {
    // x = origin.x − 100 → index −102.4; clamp to −0.5, i.e. origin.x − 0.5·sx.
    const clamped = clampPointToNativeGridDomain(CT, [CT.origin[0] - 100, 0, -500]);
    closeVec(clamped, [CT.origin[0] - 0.5 * CT.spacing[0], 0, -500], 'clamped');
    closeVec(clamped, [-250, 0, -500], 'hand-computed border');
  });

  it('oblique: origin and the i=1 row offset are in domain', () => {
    assert.equal(isPointInNativeGridDomain(OBLIQUE, obliquePoint(0, 0, 0)), true);
    // origin + 1·spacing.x·row = (10 + √2, 20 + √2, 30).
    const iOne = obliquePoint(1, 0, 0);
    closeVec(iOne, [10 + Math.SQRT2, 20 + Math.SQRT2, 30], 'i=1 point');
    assert.equal(isPointInNativeGridDomain(OBLIQUE, iOne), true);
  });

  it('oblique: clamps a 3-axis overshoot to the border indices exactly', () => {
    // origin + 10·sx·row + 10·sy·col + 10·sz·normal → indices (10, 10, 10).
    const far = obliquePoint(10, 10, 10);
    closeVec(obliqueIndices(far), [10, 10, 10], 'far indices');

    const clamped = clampPointToNativeGridDomain(OBLIQUE, far);
    // Border indices are (i=1.5, j=2.5, k=0.5); reconstruct and re-index.
    closeVec(obliqueIndices(clamped), [1.5, 2.5, 0.5], 'clamped indices');
    const s = Math.SQRT1_2;
    closeVec(clamped, [10 + 5 * s, 20 + s, 37.5], 'clamped point');
  });

  it('oblique: a point inside the AABB can still be out of domain', () => {
    const point: Point3D = [8.5, 18.5, 30];
    const bounds = OBLIQUE.bounds;
    // Confirm the point is inside the axis-aligned enclosure...
    assert.ok(point[0] >= bounds.min[0] && point[0] <= bounds.max[0]);
    assert.ok(point[1] >= bounds.min[1] && point[1] <= bounds.max[1]);
    assert.ok(point[2] >= bounds.min[2] && point[2] <= bounds.max[2]);
    // ...yet the index-space domain excludes it (i ≈ −1.06 < −0.5).
    assert.equal(isPointInNativeGridDomain(OBLIQUE, point), false);
  });

  it('throws GRID_EVIDENCE_INVALID for zero spacing', () => {
    expectInvalid({ ...CT, spacing: [0, 0.9765625, 2.5] });
  });

  it('throws GRID_EVIDENCE_INVALID for a NaN direction', () => {
    expectInvalid({ ...CT, direction: [Number.NaN, 0, 0, 0, 1, 0] });
  });

  it('throws GRID_EVIDENCE_INVALID for degenerate parallel row/column', () => {
    expectInvalid({ ...CT, direction: [1, 0, 0, 1, 0, 0] });
  });

  it('throws GRID_EVIDENCE_INVALID for a non-positive dimension', () => {
    expectInvalid({ ...CT, dimensions: [0, 512, 200] });
  });
});
