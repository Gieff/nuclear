/**
 * @nuclear/medical-engine — native grid domain evidence (ADR-012 OD-3,
 * ratified 2026-09-23).
 *
 * Ratified domain evidence: the registered target asset's worker-verified
 * oriented geometry (`dimensions`, `spacing`, `origin`, `direction`) is the
 * exact native-grid domain. The contract's axis-aligned `bounds` is only a
 * conservative outer enclosure for an oblique grid and is never membership
 * evidence (OD-3); this module therefore goes through index-space math and
 * never through the AABB.
 *
 * Convention (reused from `renderer/volume.ts` and `view-engine`): the DICOM
 * `ImageOrientationPatient` first triplet is the row/i axis, the second
 * triplet is the column/j axis, and the slice/k axis is the right-handed
 * normal `row × column`. `dimensions`/`spacing` are `[i, j, k]`.
 *
 * Domain membership uses the half-voxel border convention of
 * `AssetGeometry.bounds`: an index is in `[-0.5, dim - 0.5]` inclusive.
 *
 * Fail-closed: malformed geometry throws a typed `NativeGridDomainError` and is
 * never silently treated as out-of-domain. The caller (`view-engine`) maps a
 * thrown refusal to `LINK_TARGET_DOMAIN_UNAVAILABLE`.
 */

import type { AssetGeometry, Point3D, Vector3D } from '@nuclear/shared-types';

/** Numerical degeneracy guard, matching `worker/registration-evidence.ts`. */
const NUMERICAL_GUARD = 1e-9;

export type NativeGridDomainErrorCode = 'GRID_EVIDENCE_INVALID';

export class NativeGridDomainError extends Error {
  readonly code: NativeGridDomainErrorCode;

  constructor(code: NativeGridDomainErrorCode, message: string) {
    super(message);
    this.name = 'NativeGridDomainError';
    this.code = code;
  }
}

interface GridBasis {
  readonly row: Vector3D;
  readonly col: Vector3D;
  /** Unit slice axis, `normalize(row × column)` (right-handed). */
  readonly normal: Vector3D;
}

function isPositiveTriple(value: readonly number[]): boolean {
  if (value.length !== 3) {
    return false;
  }
  for (const component of value) {
    if (!Number.isFinite(component) || component <= 0) {
      return false;
    }
  }
  return true;
}

function isFiniteDirection(direction: readonly number[]): boolean {
  if (direction.length !== 6) {
    return false;
  }
  for (const component of direction) {
    if (!Number.isFinite(component)) {
      return false;
    }
  }
  return true;
}

function cross(a: Vector3D, b: Vector3D): Vector3D {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function invalid(reason: string): never {
  throw new NativeGridDomainError(
    'GRID_EVIDENCE_INVALID',
    `native grid domain evidence is invalid: ${reason}`,
  );
}

/** Validate the geometry and resolve the orthonormal grid basis. */
function resolveGridBasis(geometry: AssetGeometry): GridBasis {
  if (!isPositiveTriple(geometry.dimensions)) {
    invalid('dimensions must be three positive finite numbers ([i, j, k]).');
  }
  if (!isPositiveTriple(geometry.spacing)) {
    invalid('spacing must be three positive finite numbers ([i, j, k], mm).');
  }
  if (!isFiniteDirection(geometry.direction)) {
    invalid('direction must be six finite row-then-column direction cosines.');
  }
  if (
    geometry.origin.length !== 3 ||
    !geometry.origin.every((component) => Number.isFinite(component))
  ) {
    invalid('origin must be three finite LPS millimetres.');
  }

  const [d0, d1, d2, d3, d4, d5] = geometry.direction;
  const row: Vector3D = [d0, d1, d2];
  const col: Vector3D = [d3, d4, d5];
  const raw = cross(row, col);
  // P2.5 engine-source integrity: no `Math` primitive is used in the engine
  // sources, so the Euclidean norm is written with the exponent operator.
  const magnitude =
    (raw[0] * raw[0] + raw[1] * raw[1] + raw[2] * raw[2]) ** 0.5;
  if (!(magnitude > NUMERICAL_GUARD)) {
    invalid('direction row and column are degenerate (row × column is zero).');
  }
  return {
    row,
    col,
    normal: [raw[0] / magnitude, raw[1] / magnitude, raw[2] / magnitude],
  };
}

function gridIndices(
  geometry: AssetGeometry,
  basis: GridBasis,
  point: Point3D,
): readonly [number, number, number] {
  const dx = point[0] - geometry.origin[0];
  const dy = point[1] - geometry.origin[1];
  const dz = point[2] - geometry.origin[2];
  const [sx, sy, sz] = geometry.spacing;
  const { row, col, normal } = basis;
  return [
    (dx * row[0] + dy * row[1] + dz * row[2]) / sx,
    (dx * col[0] + dy * col[1] + dz * col[2]) / sy,
    (dx * normal[0] + dy * normal[1] + dz * normal[2]) / sz,
  ];
}

function isInDomain(index: number, dimension: number): boolean {
  return index >= -0.5 && index <= dimension - 0.5;
}

function clampIndex(index: number, dimension: number): number {
  if (index < -0.5) {
    return -0.5;
  }
  if (index > dimension - 0.5) {
    return dimension - 0.5;
  }
  return index;
}

/** True when `point` lies within the oriented native grid domain. */
export function isPointInNativeGridDomain(
  geometry: AssetGeometry,
  point: Point3D,
): boolean {
  const basis = resolveGridBasis(geometry);
  const [i, j, k] = gridIndices(geometry, basis, point);
  const [ni, nj, nk] = geometry.dimensions;
  return isInDomain(i, ni) && isInDomain(j, nj) && isInDomain(k, nk);
}

/**
 * Clamp `point` into the native grid domain. Each index is clamped to
 * `[-0.5, dim - 0.5]` and the point is reconstructed from the (unit) grid
 * basis. For an orthogonal grid this is the nearest grid-center-equivalent
 * location on the half-voxel border; a non-orthogonal grid is handled by the
 * same index-space clamp without a distinct behaviour.
 */
export function clampPointToNativeGridDomain(
  geometry: AssetGeometry,
  point: Point3D,
): Point3D {
  const basis = resolveGridBasis(geometry);
  const [i, j, k] = gridIndices(geometry, basis, point);
  const [ni, nj, nk] = geometry.dimensions;
  const [sx, sy, sz] = geometry.spacing;
  const { row, col, normal } = basis;
  const ci = clampIndex(i, ni);
  const cj = clampIndex(j, nj);
  const ck = clampIndex(k, nk);
  const [ox, oy, oz] = geometry.origin;
  return [
    ox + ci * sx * row[0] + cj * sy * col[0] + ck * sz * normal[0],
    oy + ci * sx * row[1] + cj * sy * col[1] + ck * sz * normal[1],
    oz + ci * sx * row[2] + cj * sy * col[2] + ck * sz * normal[2],
  ];
}
