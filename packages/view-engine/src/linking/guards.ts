/**
 * @nuclear/view-engine — product structural guards for `ViewLink` (P4.4).
 *
 * These guards intentionally mirror the runtime-relevant structure of
 * `tests/contracts/view-validators.ts`, but they are **shape-level only**: they
 * establish that a value is structurally a `ViewLink` so that
 * `assertViewLinkEligible` can then apply the semantic rules with precise,
 * fail-closed `LinkError` codes. They deliberately do **not** re-state the
 * deeper semantics that the eligibility layer owns — the geometry-evidence
 * `verified` flag, the evidence/link FrameOfReferenceUID equality, the
 * inter-study tolerance sign/finiteness, the mode/transform consistency and
 * the transform↔link frame/out-of-domain agreement — because each of those has
 * a dedicated code and must remain reportable (a stricter guard here would
 * collapse them into a generic `LINK_MALFORMED`).
 *
 * The test-side contract validator in `tests/contracts/view-validators.ts`
 * remains the authoritative full-shape validator for the frozen Phase 1
 * contracts; this module is the Node-safe product mirror used at runtime.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type {
  InterStudyLink,
  IntraStudyLink,
  LinkableState,
  SpatialTransform,
  ViewLink,
} from '@nuclear/shared-types';

const LINKABLE_STATES: ReadonlySet<string> = new Set([
  'spatial',
  'camera',
  'presentation',
  'projection',
  'composition',
]);
const OUT_OF_DOMAIN: ReadonlySet<string> = new Set(['clamp', 'hide', 'warn']);
const TRANSFORM_TYPES: ReadonlySet<string> = new Set(['rigid', 'affine', 'identity']);
const TRANSFORM_METHODS: ReadonlySet<string> = new Set([
  'dicom-registration',
  'rigid-coregistration',
  'manual-alignment',
  'identity',
]);

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const tuple = (value: unknown, length: number): value is readonly number[] =>
  Array.isArray(value) && value.length === length && value.every(finite);

/** Homogeneous affine 4x4: 16 finite entries with `[0,0,0,1]` bottom row. */
const isHomogeneousAffineMatrix4x4 = (value: unknown): boolean =>
  tuple(value, 16) && value[12] === 0 && value[13] === 0 && value[14] === 0 && value[15] === 1;

/** Structural `SourceFingerprint` shape (optional digest/byte fields ignored). */
const isFingerprintShape = (value: unknown): boolean =>
  record(value) &&
  typeof value.studyInstanceUID === 'string' &&
  typeof value.seriesInstanceUID === 'string' &&
  finite(value.instanceCount) &&
  typeof value.contentDigest === 'string';

/** Structural `GeometryVerificationSnapshot` shape — arrays present, no geometry math. */
const isGeometrySnapshotShape = (value: unknown): boolean => {
  if (!record(value)) return false;
  if (typeof value.assetId !== 'string' || typeof value.frameOfReferenceUID !== 'string') return false;
  if (!isFingerprintShape(value.sourceFingerprint) || typeof value.geometricDigest !== 'string') return false;
  if (!tuple(value.orientation, 6) || !tuple(value.spacingMm, 3) || !tuple(value.originLpsMm, 3)) return false;
  if (!record(value.boundsLpsMm) || !tuple(value.boundsLpsMm.min, 3) || !tuple(value.boundsLpsMm.max, 3)) {
    return false;
  }
  const metadata = value.workerMetadata;
  return (
    record(metadata) &&
    typeof metadata.workerVersion === 'string' &&
    typeof metadata.operation === 'string' &&
    typeof metadata.timestamp === 'string'
  );
};

const isLinkableStateList = (value: unknown): value is readonly LinkableState[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string' && LINKABLE_STATES.has(item));

/**
 * Structural `IntraStudyLink` guard. Accepts `geometryEvidence.verified`
 * `false`/`true` (the literal `true` requirement is a semantic rule reported as
 * `CO_REFERENCE_NOT_VERIFIED` by `assertCoReferenceEligibility`) and does not
 * compare the link/evidence frames (`LINK_INTRA_STUDY_EVIDENCE_FRAME_MISMATCH`)
 * or enforce the one-to-one correlation (`LINK_INTRA_STUDY_EVIDENCE_MISMATCH`).
 */
export function isIntraStudyLink(value: unknown): value is IntraStudyLink {
  if (!record(value) || value.kind !== 'co-referenced') return false;
  if (
    typeof value.sourceViewId !== 'string' ||
    typeof value.targetViewId !== 'string' ||
    typeof value.frameOfReferenceUID !== 'string'
  ) {
    return false;
  }
  if (!isLinkableStateList(value.synchronizedState)) return false;
  if (!record(value.geometryEvidence)) return false;
  const evidence = value.geometryEvidence;
  if (typeof evidence.verified !== 'boolean' || typeof evidence.frameOfReferenceUID !== 'string') {
    return false;
  }
  if (!Array.isArray(evidence.assetIds) || !evidence.assetIds.every((item) => typeof item === 'string')) {
    return false;
  }
  // Empty arrays are structurally valid here; emptiness is reported by the
  // eligibility layer as `LINK_INTRA_STUDY_EVIDENCE_MISMATCH`.
  return Array.isArray(evidence.snapshots) && evidence.snapshots.every(isGeometrySnapshotShape);
}

/**
 * Structural `InterStudyLink` guard. Requires `toleranceMm` to be a number and
 * `outOfDomainBehavior` to be a known value, but leaves the tolerance
 * finiteness/sign, the same-frame refusal and the mode/transform consistency to
 * `LINK_INTER_STUDY_*` codes. `spatialTransform` is not shape-validated here;
 * an invalid transform is reported as `LINK_INTER_STUDY_TRANSFORM_INVALID`.
 */
export function isInterStudyLink(value: unknown): value is InterStudyLink {
  if (!record(value) || value.kind !== 'inter-study') return false;
  if (typeof value.sourceViewId !== 'string' || typeof value.targetViewId !== 'string') return false;
  if (
    typeof value.sourceFrameOfReferenceUID !== 'string' ||
    typeof value.targetFrameOfReferenceUID !== 'string'
  ) {
    return false;
  }
  if (!isLinkableStateList(value.synchronizedState)) return false;
  if (value.direction !== 'source-to-target') return false;
  if (value.mode !== 'relative' && value.mode !== 'transformed') return false;
  if (typeof value.toleranceMm !== 'number') return false;
  return typeof value.outOfDomainBehavior === 'string' && OUT_OF_DOMAIN.has(value.outOfDomainBehavior);
}

/** Structural `ViewLink` guard: either an intra-study or an inter-study link. */
export function isViewLink(value: unknown): value is ViewLink {
  return isIntraStudyLink(value) || isInterStudyLink(value);
}

/**
 * Structural `SpatialTransform` shape. Checks the full runtime-relevant shape
 * **except** `units === 'mm'` and `validity.isValid === true`, which the
 * inter-study eligibility layer reports as `LINK_INTER_STUDY_TRANSFORM_INVALID`
 * together with the transform shape itself. `validity` is still verified to be
 * a record with a boolean `isValid` so the eligibility layer can read it safely.
 */
export function isSpatialTransformShape(value: unknown): value is SpatialTransform {
  if (!record(value)) return false;
  const provenance = value.provenance;
  const validity = value.validity;
  return (
    typeof value.id === 'string' &&
    typeof value.sourceFrameOfReferenceUID === 'string' &&
    typeof value.targetFrameOfReferenceUID === 'string' &&
    typeof value.transformType === 'string' &&
    TRANSFORM_TYPES.has(value.transformType) &&
    isHomogeneousAffineMatrix4x4(value.matrix4x4) &&
    record(provenance) &&
    typeof provenance.method === 'string' &&
    TRANSFORM_METHODS.has(provenance.method) &&
    (provenance.description === undefined || typeof provenance.description === 'string') &&
    (provenance.workerVersion === undefined || typeof provenance.workerVersion === 'string') &&
    (provenance.timestamp === undefined || typeof provenance.timestamp === 'string') &&
    record(validity) &&
    typeof validity.isValid === 'boolean' &&
    typeof validity.outOfDomainBehavior === 'string' &&
    OUT_OF_DOMAIN.has(validity.outOfDomainBehavior) &&
    (validity.errorMarginMm === undefined ||
      (typeof validity.errorMarginMm === 'number' &&
        Number.isFinite(validity.errorMarginMm) &&
        validity.errorMarginMm >= 0))
  );
}
