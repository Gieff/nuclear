/**
 * @nuclear/shared-types — Physical Patient Geometry
 *
 * Patient Space coordinates are strictly in the standard DICOM LPS coordinate system
 * (Left, Posterior, Superior) in millimeters (mm).
 */

import type { FrameOfReferenceUID } from './identifiers.js';

/** 3D coordinate in LPS patient space (mm): [x_L, y_P, z_S] */
export type Point3D = readonly [number, number, number];

/** 3D direction or displacement vector */
export type Vector3D = readonly [number, number, number];

/** 
 * Axis-aligned bounding box in LPS physical patient coordinates (mm).
 * Represents the axis-aligned physical extent of the complete volume in LPS
 * (`voxel-extent`, covering outer half-voxel borders). The box is an AABB of
 * the eight oriented outer corners; it is not obtained by subtracting the
 * spacing components directly when the image is oblique.
 */
export interface BoundingBox3D {
  readonly min: Point3D;
  readonly max: Point3D;
}

/**
 * DICOM ImageOrientationPatient direction cosines:
 * [rowX, rowY, rowZ, colX, colY, colZ]
 * Vectors must be orthogonal unit vectors in LPS space.
 */
export type DirectionCosines = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * 4x4 homogeneous transformation matrix in row-major order:
 * [
 *   m00, m01, m02, m03,
 *   m10, m11, m12, m13,
 *   m20, m21, m22, m23,
 *   m30, m31, m32, m33
 * ]
 */
export type Matrix4x4 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * Physical geometry contract for volumetric and planar imaging assets.
 */
export interface AssetGeometry {
  /** DICOM Frame of Reference UID (0020,0052) */
  readonly frameOfReferenceUID: FrameOfReferenceUID;

  /** Grid dimensions in voxels [columns, rows, slices] (nx, ny, nz) */
  readonly dimensions: readonly [number, number, number];

  /** Voxel spacing [colSpacing, rowSpacing, sliceSpacing] in mm (dx, dy, dz) */
  readonly spacing: readonly [number, number, number];

  /** Physical origin in LPS space (mm), corresponding to ImagePositionPatient of slice 0 */
  readonly origin: Point3D;

  /** Row and column direction cosines in LPS space (ImageOrientationPatient) */
  readonly direction: DirectionCosines;

  /**
   * Ingestion normalizes slice ordering so increasing slice indices follow the
   * right-handed normal `row × column`. Non-regular or non-normalized stacks
   * must be represented by a future geometry contract rather than this grid.
   */

  /**
   * Axis-aligned bounding box in LPS space (mm), enclosing the eight outer
   * corners. `origin` is the centre of voxel [0,0,0]; the corner coefficients
   * are -0.5 and dimension-0.5 along each oriented grid axis.
   */
  readonly bounds: BoundingBox3D;
}
