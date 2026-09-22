/**
 * @nuclear/view-engine — intra-study co-reference eligibility (C3 / P4.0.1).
 *
 * ADR-010 §7.2: co-reference requires the same worker-verified
 * `FrameOfReferenceUID`, worker-verified geometric compatibility and a
 * one-to-one correlation between every geometry snapshot and a registered
 * `ImagingAsset` (`assetId`, `seriesInstanceUID`, `SourceFingerprint`). An
 * equal `geometricDigest` is explicitly **not** a requirement: native CT and
 * PET in one Frame of Reference legitimately have different grids, spacing and
 * digests. A snapshot's `geometricDigest` must only agree with its own
 * fingerprint digest when that digest is defined.
 *
 * Pure and read-only: it consumes a contract-shaped `IntraStudyLink` plus a
 * caller-supplied asset lookup, never mutates its arguments, imports no
 * workspace module and declares no resource demand. P4.4 consumes it.
 *
 * Input assumption: `link` has already passed `isIntraStudyLink`, so its
 * `assetIds`/`snapshots` are non-empty, one-to-one and fingerprint-shaped.
 */
import type { AssetId, ImagingAsset, IntraStudyLink } from '@nuclear/shared-types';
import { CoReferenceError } from './errors.js';
import { structurallyEqual } from '../internal/json-equality.js';

export interface CoReferenceEligibilityInput {
  readonly link: IntraStudyLink;
  readonly lookupAsset: (assetId: AssetId) => ImagingAsset | undefined;
}

function describeLink(link: IntraStudyLink): string {
  return `Co-referenced link '${link.sourceViewId}' and '${link.targetViewId}'`;
}

/**
 * Validates that every snapshot of an intra-study link is one-to-one
 * correlated with a registered asset in the link Frame of Reference; throws
 * `CoReferenceError` on the first mismatch (verification, asset, frame of
 * reference, study, series, fingerprint, geometric digest).
 */
export function assertCoReferenceEligibility(input: CoReferenceEligibilityInput): void {
  const { link, lookupAsset } = input;

  if (link.geometryEvidence.verified !== true) {
    throw new CoReferenceError(
      'CO_REFERENCE_NOT_VERIFIED',
      `${describeLink(link)} carries geometry evidence that the scientific worker did not verify. ` +
        'Remediation: only declare a co-referenced link over geometry evidence whose verified flag is true.',
    );
  }

  const { snapshots, frameOfReferenceUID } = link.geometryEvidence;
  const evidenceStudy = snapshots[0]?.sourceFingerprint.studyInstanceUID;

  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index];
    const asset = lookupAsset(snapshot.assetId);
    if (asset === undefined) {
      throw new CoReferenceError(
        'CO_REFERENCE_UNKNOWN_ASSET',
        `${describeLink(link)} references snapshot asset '${snapshot.assetId}', which no registered ImagingAsset resolves. ` +
          'Remediation: register the asset (or correct the snapshot assetId) before declaring the link.',
      );
    }
    if (snapshot.frameOfReferenceUID !== frameOfReferenceUID) {
      throw new CoReferenceError(
        'CO_REFERENCE_FRAME_OF_REFERENCE_MISMATCH',
        `${describeLink(link)} snapshot asset '${snapshot.assetId}' declares FrameOfReferenceUID ` +
          `'${snapshot.frameOfReferenceUID}' instead of the evidence FrameOfReferenceUID '${frameOfReferenceUID}'. ` +
          'Remediation: only co-reference snapshots recorded in the link Frame of Reference.',
      );
    }
    if (asset.frameOfReferenceUID !== frameOfReferenceUID) {
      throw new CoReferenceError(
        'CO_REFERENCE_FRAME_OF_REFERENCE_MISMATCH',
        `${describeLink(link)} snapshot asset '${snapshot.assetId}' resolves to FrameOfReferenceUID ` +
          `'${asset.frameOfReferenceUID}' instead of the evidence FrameOfReferenceUID '${frameOfReferenceUID}'. ` +
          'Remediation: only co-reference assets registered in the link Frame of Reference.',
      );
    }
    if (snapshot.sourceFingerprint.studyInstanceUID !== evidenceStudy) {
      throw new CoReferenceError(
        'CO_REFERENCE_STUDY_MISMATCH',
        `${describeLink(link)} snapshot asset '${snapshot.assetId}' carries a fingerprint study ` +
          `'${snapshot.sourceFingerprint.studyInstanceUID}' inconsistent with the evidence study '${evidenceStudy}'. ` +
          'Remediation: correlate every snapshot to a single study.',
      );
    }
    if (asset.studyInstanceUID !== evidenceStudy) {
      throw new CoReferenceError(
        'CO_REFERENCE_STUDY_MISMATCH',
        `${describeLink(link)} snapshot asset '${snapshot.assetId}' resolves to study '${asset.studyInstanceUID}' ` +
          `instead of the evidence study '${evidenceStudy}'. ` +
          'Remediation: register the asset under the same study as its snapshot fingerprint.',
      );
    }
    if (asset.seriesInstanceUID !== snapshot.sourceFingerprint.seriesInstanceUID) {
      throw new CoReferenceError(
        'CO_REFERENCE_SERIES_MISMATCH',
        `${describeLink(link)} snapshot asset '${snapshot.assetId}' resolves to series ` +
          `'${asset.seriesInstanceUID ?? 'none'}' instead of the snapshot fingerprint series ` +
          `'${snapshot.sourceFingerprint.seriesInstanceUID}'. ` +
          'Remediation: correlate each snapshot to the asset series its fingerprint names.',
      );
    }
    if (!structurallyEqual(snapshot.sourceFingerprint, asset.sourceFingerprint)) {
      throw new CoReferenceError(
        'CO_REFERENCE_FINGERPRINT_MISMATCH',
        `${describeLink(link)} snapshot asset '${snapshot.assetId}' carries a SourceFingerprint ` +
          `(contentDigest '${snapshot.sourceFingerprint.contentDigest}') that does not structurally match ` +
          `the registered asset fingerprint (contentDigest '${asset.sourceFingerprint.contentDigest}'). ` +
          'Remediation: record the registered SourceFingerprint verbatim in the snapshot.',
      );
    }
    const declaredDigest = snapshot.sourceFingerprint.geometricDigest;
    if (declaredDigest !== undefined && snapshot.geometricDigest !== declaredDigest) {
      throw new CoReferenceError(
        'CO_REFERENCE_GEOMETRIC_DIGEST_MISMATCH',
        `${describeLink(link)} snapshot asset '${snapshot.assetId}' declares geometricDigest ` +
          `'${snapshot.geometricDigest}' while its fingerprint declares '${declaredDigest}'. ` +
          'Remediation: align the snapshot geometricDigest with its own fingerprint (an equal digest across snapshots is not required).',
      );
    }
  }
}
