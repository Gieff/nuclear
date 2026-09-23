/**
 * @nuclear/figure-engine — OD-5 patient-annotation projection (P5.4, ADR-014
 * OD-4 + OD-5 ratified 2026-09-23, options A/A/A).
 *
 * Projects a patient-anchored annotation's LPS position to Figure Sheet mm and
 * resolves its OD-4 visibility. Two independent pieces of information are used:
 *
 * 1. the out-of-plane distance, computed from the **physical LPS geometry**
 *    (`planePoint = referenceLocation + sliceOffsetMm · viewPlaneNormal`;
 *    `d = dot(anchorLps − planePoint, viewPlaneNormal)`), never from the
 *    projective `z`;
 * 2. the in-plane placement, obtained by **applying** the authored
 *    `patientToViewPlane` / `viewPlaneToViewport` transforms (row-major
 *    homogeneous `Matrix4x4`), normalizing by `viewportSizePx`, then OD-1
 *    (`viewportToPanelContent`) and OD-2 (`panelContentToSheet`).
 *
 * `figure-engine` derives no transform and normalizes no direction: a non-unit
 * view-plane normal, a non-finite/non-affine matrix or an invalid viewport size
 * is a typed `FIGURE_ANNOTATION_INVALID` refusal. The resolved `MedicalViewState`
 * (local overrides already applied by `view-engine`, ADR-011) is the caller's
 * responsibility. Pure and Node-safe: no DOM, no WebGL, no Cornerstone.
 */

import type {
  AssetAvailabilityStatus,
  MedicalViewState,
  PanelFramingState,
  PanelLayoutState,
  PatientAnnotationAnchor,
  Point3D,
  SheetPointMm,
} from '@nuclear/shared-types';

import {
  resolvePatientAnnotationVisibility,
  type PatientAnnotationVisibility,
} from './annotation-policy.js';
import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import { viewportToPanelContent, type NormalizedViewportPoint } from './framing.js';
import { refuse } from './guards.js';
import { panelContentToSheet } from './sheet-placement.js';

/**
 * Declared tolerance for the unit-length check of `viewPlaneNormal`, matching
 * the Fase-1 contract oracle (`tests/contracts/view-validators.ts`).
 */
export const VIEW_PLANE_NORMAL_UNIT_TOLERANCE = 1e-5;

export interface PatientAnnotationProjectionInput {
  readonly anchor: PatientAnnotationAnchor;
  /** Availability of the anchor's panel (`medicalViewBinding.availability.state`). */
  readonly availability: AssetAvailabilityStatus['state'];
  /** Resolved medical view state (overrides already applied upstream). */
  readonly state: MedicalViewState;
  readonly framing: PanelFramingState;
  readonly layout: PanelLayoutState;
}

export interface PatientAnnotationProjection extends PatientAnnotationVisibility {
  /** Signed LPS out-of-plane distance in mm. */
  readonly outOfPlaneDistanceMm: number;
  /** Figure Sheet mm; present only when the annotation is drawn. */
  readonly sheetPointMm?: SheetPointMm;
}

function refuseAnnotation(message: string): never {
  refuse(FIGURE_PUBLICATION_ERROR_CODES.annotationInvalid, message);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    refuseAnnotation(`${path} must be a plain object`);
  }
  return value;
}

function asFiniteTriple(value: unknown, path: string): Point3D {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isFiniteNumber)) {
    refuseAnnotation(`${path} must be three finite numbers`);
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function asPositivePair(value: unknown, path: string): readonly [number, number] {
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
function asAffineMatrix(value: unknown, path: string): readonly number[] {
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
function applyAffineMatrix(matrix: readonly number[], point: Point3D): Point3D {
  return [
    matrix[0] * point[0] + matrix[1] * point[1] + matrix[2] * point[2] + matrix[3],
    matrix[4] * point[0] + matrix[5] * point[1] + matrix[6] * point[2] + matrix[7],
    matrix[8] * point[0] + matrix[9] * point[1] + matrix[10] * point[2] + matrix[11],
  ];
}

function assertUnitNormal(normal: Point3D): void {
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  if (Math.abs(length - 1) > VIEW_PLANE_NORMAL_UNIT_TOLERANCE) {
    refuseAnnotation(
      `SpatialState.viewPlaneNormal has length ${String(length)}; a unit normal is required so the out-of-plane distance is in millimetres`,
    );
  }
}

/**
 * Signed out-of-plane distance in mm (OD-5a/OD-5b):
 * `dot(anchor − (referenceLocation + sliceOffsetMm · viewPlaneNormal), normal)`.
 */
function outOfPlaneDistanceMm(state: MedicalViewState, anchorLps: Point3D): number {
  const spatial = asRecord((state as unknown as Record<string, unknown>).spatial, 'state.spatial');
  const referenceLocation = asFiniteTriple(
    spatial.referenceLocation,
    'state.spatial.referenceLocation',
  );
  const normal = asFiniteTriple(spatial.viewPlaneNormal, 'state.spatial.viewPlaneNormal');
  assertUnitNormal(normal);
  const sliceOffsetMm = spatial.sliceOffsetMm;
  if (!isFiniteNumber(sliceOffsetMm)) {
    refuseAnnotation('state.spatial.sliceOffsetMm must be finite');
  }

  const dx = anchorLps[0] - (referenceLocation[0] + sliceOffsetMm * normal[0]);
  const dy = anchorLps[1] - (referenceLocation[1] + sliceOffsetMm * normal[1]);
  const dz = anchorLps[2] - (referenceLocation[2] + sliceOffsetMm * normal[2]);
  return dx * normal[0] + dy * normal[1] + dz * normal[2];
}

function projectToSheet(
  input: PatientAnnotationProjectionInput,
  anchorLps: Point3D,
): SheetPointMm {
  const transforms = asRecord(
    (input.state as unknown as Record<string, unknown>).coordinateTransforms,
    'state.coordinateTransforms',
  );
  const patientToViewPlane = asAffineMatrix(
    transforms.patientToViewPlane,
    'state.coordinateTransforms.patientToViewPlane',
  );
  const viewPlaneToViewport = asAffineMatrix(
    transforms.viewPlaneToViewport,
    'state.coordinateTransforms.viewPlaneToViewport',
  );
  const viewportSizePx = asPositivePair(
    transforms.viewportSizePx,
    'state.coordinateTransforms.viewportSizePx',
  );

  const viewPlanePoint = applyAffineMatrix(patientToViewPlane, anchorLps);
  const viewportPoint = applyAffineMatrix(viewPlaneToViewport, viewPlanePoint);
  const normalized: NormalizedViewportPoint = [
    viewportPoint[0] / viewportSizePx[0],
    viewportPoint[1] / viewportSizePx[1],
  ];

  const panelContent = viewportToPanelContent(input.framing, normalized);
  return panelContentToSheet(input.layout, panelContent);
}

function asOutOfPlaneBehavior(value: unknown): 'hide' | 'fade' {
  if (value !== 'hide' && value !== 'fade') {
    refuseAnnotation(`anchor.outOfPlaneBehavior '${String(value)}' must be 'hide' or 'fade'`);
  }
  return value;
}

function asPlaneTolerance(value: unknown): number {
  if (!isFiniteNumber(value) || value < 0) {
    refuseAnnotation(`anchor.planeToleranceMm ${String(value)} must be finite and ≥ 0`);
  }
  return value;
}

/**
 * Projects a patient-anchored annotation to a frozen result. Fail-closed: an
 * anchor that is not `patient`, a non-physical `SpatialState`, a non-unit
 * normal, a non-affine/non-finite transform, an invalid viewport size or a
 * malformed framing/layout is refused with a typed error. A hidden annotation
 * returns no `sheetPointMm`; `outOfPlaneDistanceMm` is always reported.
 */
export function projectPatientAnnotation(
  input: PatientAnnotationProjectionInput,
): PatientAnnotationProjection {
  const anchor = asRecord(input.anchor, 'anchor');
  if (anchor.kind !== 'patient') {
    refuseAnnotation(`anchor.kind '${String(anchor.kind)}' is not 'patient'`);
  }
  const anchorLps = asFiniteTriple(anchor.positionLpsMm, 'anchor.positionLpsMm');
  const planeToleranceMm = asPlaneTolerance(anchor.planeToleranceMm);
  const outOfPlaneBehavior = asOutOfPlaneBehavior(anchor.outOfPlaneBehavior);

  const distance = outOfPlaneDistanceMm(input.state, anchorLps);
  const visibility = resolvePatientAnnotationVisibility({
    availability: input.availability,
    outOfPlaneDistanceMm: distance,
    planeToleranceMm,
    outOfPlaneBehavior,
  });

  if (!visibility.visible) {
    return Object.freeze({
      visible: false,
      opacity: 0,
      outOfPlaneDistanceMm: distance,
    });
  }

  const sheetPoint = projectToSheet(input, anchorLps);
  return Object.freeze({
    visible: true,
    opacity: visibility.opacity,
    outOfPlaneDistanceMm: distance,
    sheetPointMm: Object.freeze(sheetPoint) as SheetPointMm,
  });
}
