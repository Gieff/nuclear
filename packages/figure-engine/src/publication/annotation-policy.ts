/**
 * @nuclear/figure-engine — OD-4 patient-annotation visibility policy (P5.4,
 * ADR-014 OD-4, ratified 2026-09-23).
 *
 * This module implements the ratified visibility/opacity decision as a pure
 * function of a **declared** out-of-plane distance (mm) and the panel's
 * availability state.
 *
 * Scope note (important). The `LPS → view plane → viewport → panel content →
 * sheet mm` projection itself is **not** implemented here. The displayed-plane
 * definition and the content semantics of
 * `CoordinateTransformSet.patientToViewPlane` / `viewPlaneToViewport` are not
 * ratified documents, and `medical-engine` currently refuses any non-neutral
 * slice positioning (`referenceLocation` non-zero / `sliceOffsetMm !== 0`,
 * ADR-008). Supplying the distance is therefore the medical-chain owner's
 * responsibility until a follow-up amendment defines those semantics; guessing
 * them here is forbidden by Rule 01.
 *
 * Ratified rules:
 * - `availability !== 'online'` (`loading`, `offline-cached`, `missing`,
 *   `mismatch`) ⇒ hidden fail-closed;
 * - `planeToleranceMm === 0` ⇒ no fade band: visible only when `|d| === 0`;
 * - `planeToleranceMm > 0` and `outOfPlaneBehavior === 'fade'`: visible at full
 *   opacity while `|d| ≤ tolerance`, linear `1 → 0` over
 *   `(tolerance, 2 × tolerance]`, hidden beyond;
 * - `planeToleranceMm > 0` and `outOfPlaneBehavior === 'hide'`: visible while
 *   `|d| ≤ tolerance`, hidden beyond (hard cutoff at the tolerance).
 *
 * Distances are always in millimetres. Pure and Node-safe: no DOM, no WebGL,
 * no Cornerstone.
 *
 * Compositor note: at exactly `2 × tolerance` the policy returns
 * `visible: true, opacity: 0`. A publication compositor must treat
 * `opacity === 0` as “emit nothing” (an explicit zero-opacity vector primitive
 * is a dead primitive), not as a drawn object.
 */

import type { AssetAvailabilityStatus } from '@nuclear/shared-types';

import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import { refuse } from './guards.js';
import { AVAILABILITY_STATES } from './request-types.js';

export interface PatientAnnotationVisibilityInput {
  /** Panel/medical-source availability state for the anchor's panel. */
  readonly availability: AssetAvailabilityStatus['state'];
  /** Signed out-of-plane distance of the LPS anchor to the displayed plane, in mm. */
  readonly outOfPlaneDistanceMm: number;
  /** Declared plane tolerance, in mm (must be finite and ≥ 0). */
  readonly planeToleranceMm: number;
  readonly outOfPlaneBehavior: 'hide' | 'fade';
}

export interface PatientAnnotationVisibility {
  readonly visible: boolean;
  /** Opacity in [0, 1]; 0 whenever the annotation is hidden. */
  readonly opacity: number;
}

const HIDDEN: PatientAnnotationVisibility = Object.freeze({ visible: false, opacity: 0 });

/**
 * Resolves whether a patient-anchored annotation is drawn and at which opacity,
 * per the ratified OD-4 policy. Refuses `FIGURE_ANNOTATION_INVALID` for an
 * unknown availability state, a non-finite distance, a non-finite/negative
 * tolerance or an unknown out-of-plane behaviour.
 */
export function resolvePatientAnnotationVisibility(
  input: PatientAnnotationVisibilityInput,
): PatientAnnotationVisibility {
  if (!AVAILABILITY_STATES.includes(input.availability)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.annotationInvalid,
      `availability '${String(input.availability)}' is not a known state (${AVAILABILITY_STATES.join(', ')})`,
    );
  }
  if (!Number.isFinite(input.outOfPlaneDistanceMm)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.annotationInvalid,
      `outOfPlaneDistanceMm ${String(input.outOfPlaneDistanceMm)} must be finite`,
    );
  }
  if (!Number.isFinite(input.planeToleranceMm) || input.planeToleranceMm < 0) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.annotationInvalid,
      `planeToleranceMm ${String(input.planeToleranceMm)} must be finite and ≥ 0`,
    );
  }
  if (input.outOfPlaneBehavior !== 'hide' && input.outOfPlaneBehavior !== 'fade') {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.annotationInvalid,
      `outOfPlaneBehavior '${String(input.outOfPlaneBehavior)}' must be 'hide' or 'fade'`,
    );
  }

  if (input.availability !== 'online') {
    return HIDDEN;
  }

  const distance = Math.abs(input.outOfPlaneDistanceMm);
  const tolerance = input.planeToleranceMm;
  if (distance <= tolerance) {
    return Object.freeze({ visible: true, opacity: 1 });
  }
  // No fade band exists at tolerance 0, and `hide` always cuts at the tolerance.
  if (tolerance === 0 || input.outOfPlaneBehavior === 'hide') {
    return HIDDEN;
  }
  if (distance <= 2 * tolerance) {
    return Object.freeze({ visible: true, opacity: 1 - (distance - tolerance) / tolerance });
  }
  return HIDDEN;
}
