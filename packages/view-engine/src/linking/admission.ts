/**
 * @nuclear/view-engine — one-shot inter-study link admission (P4.4b, ADR-012
 * R-1/OD-6, §5; ratified 2026-09-23).
 *
 * This is the **only** place a link's `toleranceMm` is compared with the
 * transform's advisory `errorMarginMm`. Admission is evaluated once, at
 * registration; propagation never re-reads the tolerance. The check is pure and
 * read-only (no registry access) and assumes the caller already ran
 * `assertViewLinkEligible` (structural + mode-specific eligibility).
 *
 * Strict evidence whitelist (R11-B folded into R-1/OD-6): only measured
 * Procrustes/landmark `manual-alignment` is admissible. The current MI path
 * (`rigid-coregistration`) has no ratified mm-denominated residual and is
 * refused here even when structurally valid; `identity`/`dicom-registration`
 * are likewise not admissible. A missing residual fails closed with no default
 * and no accept-with-warning path.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone, no registry mutation.
 */
import type { InterStudyLink } from '@nuclear/shared-types';
import { LinkError } from './errors.js';

function describe(link: InterStudyLink): string {
  return `Inter-study link '${link.sourceViewId}' -> '${link.targetViewId}'`;
}

/**
 * Asserts that `link` may be registered and later applied. Caller order: run
 * `assertViewLinkEligible` first; this gate adds the ratified admission rules.
 *
 * @throws LinkError `LINK_RELATIVE_MODE_UNSUPPORTED` (relative deferred),
 * `LINK_TRANSFORM_INVALID` (missing/unsupported transform or method),
 * `LINK_TRANSFORM_ERROR_MARGIN_MISSING` (no residual evidence) or
 * `LINK_REGISTRATION_ERROR_EXCEEDS_TOLERANCE` (residual above tolerance).
 */
export function assertInterStudyLinkAdmissible(link: InterStudyLink): void {
  if (link.mode === 'relative') {
    throw new LinkError(
      'LINK_RELATIVE_MODE_UNSUPPORTED',
      `${describe(link)} uses mode 'relative'. Remediation: relative application is deferred (ADR-012 R-2/OD-4) because the differential frame and domain are undefined; register a 'transformed' link with a Procrustes/landmark SpatialTransform instead.`,
    );
  }

  const transform = link.spatialTransform;
  if (transform === undefined) {
    throw new LinkError(
      'LINK_TRANSFORM_INVALID',
      `${describe(link)} is mode 'transformed' but carries no spatialTransform. Remediation: attach a worker-validated Procrustes/landmark SpatialTransform with a present errorMarginMm; a transformed link without a transform is never admissible (ADR-012 §5).`,
    );
  }

  if (transform.provenance.method !== 'manual-alignment') {
    throw new LinkError(
      'LINK_TRANSFORM_INVALID',
      `${describe(link)} carries a spatialTransform derived by method '${transform.provenance.method}'. Remediation: only Procrustes/landmark 'manual-alignment' measured RMS evidence is admissible under R11-B/ADR-012 §5; MI ('rigid-coregistration'), 'identity' and 'dicom-registration' evidence have no ratified mm-denominated residual path in P4.4b.`,
    );
  }

  const transformType = transform.transformType;
  if (transformType !== 'rigid' && transformType !== 'identity') {
    throw new LinkError(
      'LINK_TRANSFORM_INVALID',
      `${describe(link)} carries a spatialTransform of transformType '${String(transformType)}'. Remediation: only 'rigid' or 'identity' transforms are admissible; affine/deformable propagation would require an ADR revisiting the ratified SpatialTransform vocabulary.`,
    );
  }

  const errorMarginMm = transform.validity.errorMarginMm;
  if (errorMarginMm === undefined) {
    throw new LinkError(
      'LINK_TRANSFORM_ERROR_MARGIN_MISSING',
      `${describe(link)} carries a spatialTransform '${transform.id}' with no errorMarginMm. Remediation: supply a measured geometric RMS residual (errorMarginMm) from Procrustes/landmark registration; R11-B/OD-6 forbids any default or accept-with-warning path.`,
    );
  }

  if (errorMarginMm > link.toleranceMm) {
    throw new LinkError(
      'LINK_REGISTRATION_ERROR_EXCEEDS_TOLERANCE',
      `${describe(link)} carries errorMarginMm ${errorMarginMm} above the declared toleranceMm ${link.toleranceMm}. Remediation: raise the declared toleranceMm only if clinically justified, or supply registration evidence whose measured residual is <= toleranceMm.`,
    );
  }
}
