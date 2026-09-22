/**
 * @nuclear/view-engine — `ViewLink` eligibility (P4.4, ADR-010 §3/§7.2).
 *
 * Fail-closed semantic validation of a link before it may be applied. It runs
 * the structural guards first, then the mode-specific rules:
 *
 * - **co-referenced** composes the reused `assertCoReferenceEligibility`
 *   (same worker-verified `FrameOfReferenceUID`, one-to-one snapshot ↔ asset ↔
 *   series ↔ fingerprint). An equal `geometricDigest` across snapshots is
 *   **never** required: native CT/PET in one Frame of Reference legitimately
 *   differ. `CoReferenceError` codes propagate unchanged.
 * - **inter-study** requires distinct source/target frames, a finite
 *   non-negative `toleranceMm`, and either an explicit
 *   `navigationDifferentialMm` (mode `relative`) or a valid `SpatialTransform`
 *   whose frames and out-of-domain policy match the link (mode `transformed`).
 *
 * Pure and read-only: no DOM, no WebGL, no Cornerstone, no registry mutation.
 */
import type { AssetId, ImagingAsset, InterStudyLink, IntraStudyLink, ViewLink } from '@nuclear/shared-types';
import { LinkError } from './errors.js';
import { assertCoReferenceEligibility } from './co-reference.js';
import { isInterStudyLink, isIntraStudyLink, isSpatialTransformShape } from './guards.js';

export interface AssertViewLinkEligibleInput {
  readonly link: unknown;
  readonly lookupAsset: (assetId: AssetId) => ImagingAsset | undefined;
}

export interface ViewLinkEligibleInput {
  readonly link: ViewLink;
  readonly lookupAsset: (assetId: AssetId) => ImagingAsset | undefined;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function describeIntra(link: IntraStudyLink): string {
  return `Co-referenced link '${link.sourceViewId}' -> '${link.targetViewId}' (FrameOfReferenceUID '${link.frameOfReferenceUID}')`;
}

function describeInter(link: InterStudyLink): string {
  return `Inter-study link '${link.sourceViewId}' -> '${link.targetViewId}' (mode '${link.mode}')`;
}

function assertIntraStudyLinkEligible(
  link: IntraStudyLink,
  lookupAsset: AssertViewLinkEligibleInput['lookupAsset'],
): void {
  const { geometryEvidence } = link;
  if (link.frameOfReferenceUID !== geometryEvidence.frameOfReferenceUID) {
    throw new LinkError(
      'LINK_INTRA_STUDY_EVIDENCE_FRAME_MISMATCH',
      `${describeIntra(link)} declares FrameOfReferenceUID '${link.frameOfReferenceUID}' while its geometryEvidence declares '${geometryEvidence.frameOfReferenceUID}'. Remediation: co-reference the link only when the link and its worker-verified geometry evidence share one FrameOfReferenceUID.`,
    );
  }

  const { assetIds, snapshots } = geometryEvidence;
  const mismatch = (reason: string): LinkError =>
    new LinkError(
      'LINK_INTRA_STUDY_EVIDENCE_MISMATCH',
      `${describeIntra(link)} has geometry evidence that is not a one-to-one, single-study correlation (${reason}). Remediation: record one unique snapshot per registered asset, the same count of assetIds and snapshots, and a single study across every snapshot fingerprint.`,
    );

  if (assetIds.length === 0 || snapshots.length === 0) {
    throw mismatch(`assetIds: ${assetIds.length}, snapshots: ${snapshots.length}`);
  }
  if (assetIds.length !== snapshots.length) {
    throw mismatch(`assetIds: ${assetIds.length}, snapshots: ${snapshots.length}`);
  }
  if (new Set(assetIds).size !== assetIds.length) {
    throw mismatch('duplicate assetId');
  }
  const snapshotAssetIds = snapshots.map((snapshot) => snapshot.assetId);
  if (new Set(snapshotAssetIds).size !== snapshotAssetIds.length) {
    throw mismatch('duplicate snapshot assetId');
  }
  const declaredAssets = new Set<AssetId>(assetIds);
  if (snapshotAssetIds.some((assetId) => !declaredAssets.has(assetId))) {
    throw mismatch('snapshot assetId absent from assetIds');
  }
  const studies = new Set(snapshots.map((snapshot) => snapshot.sourceFingerprint.studyInstanceUID));
  if (studies.size !== 1) {
    throw mismatch(`snapshot fingerprints span ${studies.size} studies`);
  }

  // Compose the reused co-reference gate only AFTER the structural correlation
  // above. Its typed `CoReferenceError` codes (NOT_VERIFIED, UNKNOWN_ASSET,
  // FRAME_OF_REFERENCE_MISMATCH, STUDY_MISMATCH, SERIES_MISMATCH,
  // FINGERPRINT_MISMATCH, GEOMETRIC_DIGEST_MISMATCH) propagate unchanged.
  assertCoReferenceEligibility({ link, lookupAsset });
}

function assertInterStudyLinkEligible(link: InterStudyLink): void {
  if (link.sourceFrameOfReferenceUID === link.targetFrameOfReferenceUID) {
    throw new LinkError(
      'LINK_INTER_STUDY_SAME_FRAME',
      `${describeInter(link)} declares the same source and target FrameOfReferenceUID '${link.sourceFrameOfReferenceUID}'. Remediation: an inter-study link must connect two distinct frames; use a co-referenced intra-study link when the frames are identical.`,
    );
  }

  if (!finite(link.toleranceMm) || link.toleranceMm < 0) {
    throw new LinkError(
      'LINK_INTER_STUDY_TOLERANCE_INVALID',
      `${describeInter(link)} declares toleranceMm '${String(link.toleranceMm)}', which is not a finite non-negative number. Remediation: declare an explicit toleranceMm >= 0; no numeric tolerance is invented by the view engine.`,
    );
  }

  if (link.mode === 'relative') {
    if (link.navigationDifferentialMm === undefined) {
      throw new LinkError(
        'LINK_INTER_STUDY_MISSING_DIFFERENTIAL',
        `${describeInter(link)} is a relative link without a navigationDifferentialMm. Remediation: declare an explicit navigationDifferentialMm [x, y, z] in millimetres, or use mode 'transformed' with a valid SpatialTransform.`,
      );
    }
    if (!isFiniteVector3(link.navigationDifferentialMm)) {
      const differential = link.navigationDifferentialMm;
      const rendered = Array.isArray(differential)
        ? `[${differential.join(', ')}]`
        : `a value of type ${typeof differential}`;
      throw new LinkError(
        'LINK_INTER_STUDY_DIFFERENTIAL_INVALID',
        `${describeInter(link)} declares navigationDifferentialMm ${rendered}, which is not a finite 3-tuple. Remediation: declare three finite millimetre components.`,
      );
    }
    if (link.spatialTransform !== undefined) {
      throw new LinkError(
        'LINK_INTER_STUDY_MODE_INCONSISTENT',
        `${describeInter(link)} is mode 'relative' but also carries a spatialTransform. Remediation: a relative link carries only navigationDifferentialMm; use mode 'transformed' to carry a SpatialTransform.`,
      );
    }
    return;
  }

  const transform = link.spatialTransform;
  if (transform === undefined) {
    throw new LinkError(
      'LINK_INTER_STUDY_MISSING_TRANSFORM',
      `${describeInter(link)} is a transformed link without a spatialTransform. Remediation: attach a valid registered SpatialTransform, or use mode 'relative' with a navigationDifferentialMm.`,
    );
  }
  // Two fail-closed branches for the same code. The first must not read
  // `transform.validity`/`transform.units`: a malformed runtime payload may be
  // a non-record (or an object without `validity`), and dereferencing those
  // fields would leak an untyped `TypeError` instead of the typed `LinkError`.
  if (!isSpatialTransformShape(transform)) {
    throw new LinkError(
      'LINK_INTER_STUDY_TRANSFORM_INVALID',
      `${describeInter(link)} carries a spatialTransform (${describeType(transform)}) that is not a structurally valid SpatialTransform. Remediation: consume a worker-validated SpatialTransform whose units are 'mm' and whose validity.isValid is true; never treat an invalid transform as co-referenced.`,
    );
  }
  if (transform.validity.isValid !== true || transform.units !== 'mm') {
    throw new LinkError(
      'LINK_INTER_STUDY_TRANSFORM_INVALID',
      `${describeInter(link)} carries a spatialTransform '${String(transform.id)}' that is not a valid millimetre transform (isValid: ${String(transform.validity.isValid)}, units: '${String(transform.units)}'). Remediation: consume a worker-validated SpatialTransform whose units are 'mm' and whose validity.isValid is true; never treat an invalid transform as co-referenced.`,
    );
  }
  if (
    transform.sourceFrameOfReferenceUID !== link.sourceFrameOfReferenceUID ||
    transform.targetFrameOfReferenceUID !== link.targetFrameOfReferenceUID
  ) {
    throw new LinkError(
      'LINK_INTER_STUDY_TRANSFORM_FRAME_MISMATCH',
      `${describeInter(link)} carries a spatialTransform whose frames are '${transform.sourceFrameOfReferenceUID}' -> '${transform.targetFrameOfReferenceUID}' instead of '${link.sourceFrameOfReferenceUID}' -> '${link.targetFrameOfReferenceUID}'. Remediation: attach a transform whose source/target FrameOfReferenceUID match the link exactly.`,
    );
  }
  if (transform.validity.outOfDomainBehavior !== link.outOfDomainBehavior) {
    throw new LinkError(
      'LINK_INTER_STUDY_OUT_OF_DOMAIN_MISMATCH',
      `${describeInter(link)} declares outOfDomainBehavior '${link.outOfDomainBehavior}' while its transform declares '${transform.validity.outOfDomainBehavior}'. Remediation: align the link and transform out-of-domain policy.`,
    );
  }
  if (link.navigationDifferentialMm !== undefined) {
    throw new LinkError(
      'LINK_INTER_STUDY_MODE_INCONSISTENT',
      `${describeInter(link)} is mode 'transformed' but also carries a navigationDifferentialMm. Remediation: a transformed link carries only a spatialTransform; use mode 'relative' to carry a navigationDifferentialMm.`,
    );
  }
}

function isFiniteVector3(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every(finite);
}

/**
 * Asserts that `input.link` is an eligible `ViewLink`. A malformed or unknown
 * discriminant fails closed with `LINK_MALFORMED`; every semantic mismatch
 * raises the specific `LinkError` (or `CoReferenceError`) code.
 */
export function assertViewLinkEligible(
  input: AssertViewLinkEligibleInput,
): asserts input is ViewLinkEligibleInput {
  const { link, lookupAsset } = input;
  if (isIntraStudyLink(link)) {
    assertIntraStudyLinkEligible(link, lookupAsset);
    return;
  }
  if (isInterStudyLink(link)) {
    assertInterStudyLinkEligible(link);
    return;
  }
  const kind = record(link) && typeof link.kind === 'string' ? `kind '${link.kind}'` : `value of type ${describeType(link)}`;
  throw new LinkError(
    'LINK_MALFORMED',
    `Unrecognized ViewLink (${kind}). Remediation: declare either a co-referenced intra-study link (kind 'co-referenced') or an inter-study link (kind 'inter-study', mode 'relative' or 'transformed') with all required fields and valid synchronizedState/outOfDomainBehavior values.`,
  );
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
