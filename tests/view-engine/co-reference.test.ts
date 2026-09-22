/**
 * NuClear C3 (P4.0.1) — pure intra-study co-reference eligibility tests.
 *
 * Pure Node: no DOM, WebGL or Cornerstone. Uses the real shared contract
 * fixtures and the real `view-engine` helper (imported through the repository
 * `.js`→`.ts` resolve hook). ADR-010 §7.2: co-reference requires the same
 * worker-verified FrameOfReferenceUID plus one-to-one snapshot ↔ asset ↔
 * series ↔ fingerprint correlation, but NOT an equal `geometricDigest`.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type {
  AssetId,
  FrameOfReferenceUID,
  ImagingAsset,
  IntraStudyLink,
  StudyInstanceUID,
} from '../../packages/shared-types/src/index.js';
import {
  MOCK_PET_SERIES_UID,
  mockCtAsset,
  mockPetAsset,
} from '../fixtures/clinical-contracts.fixture.ts';
import { mockIntraStudyLink } from '../fixtures/view-contracts.fixture.ts';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const { assertCoReferenceEligibility, CoReferenceError } = await import(
  '../../packages/view-engine/src/linking/index.ts'
);

const registry = new Map<AssetId, ImagingAsset>([
  [mockCtAsset.id, mockCtAsset],
  [mockPetAsset.id, mockPetAsset],
]);

const lookup = (assetId: AssetId): ImagingAsset | undefined => registry.get(assetId);

const lookupWith = (
  assetId: AssetId,
  asset: ImagingAsset,
): ((assetId: AssetId) => ImagingAsset | undefined) =>
  (candidate) => (candidate === assetId ? asset : registry.get(candidate));

const expectCode = (run: () => unknown, code: string, messageIncludes?: string): void => {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof CoReferenceError, `expected CoReferenceError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    assert.ok(error.message.includes('Remediation:'), 'expected a remediation clause');
    if (messageIncludes !== undefined) {
      assert.ok(
        error.message.includes(messageIncludes),
        `expected '${messageIncludes}' in '${error.message}'`,
      );
    }
    return true;
  });
};

const withSnapshots = (snapshots: IntraStudyLink['geometryEvidence']['snapshots']): IntraStudyLink => ({
  ...mockIntraStudyLink,
  geometryEvidence: { ...mockIntraStudyLink.geometryEvidence, snapshots },
});

describe('NuClear C3 — intra-study co-reference eligibility', () => {
  it('1. accepts native CT/PET snapshots with different digests in one verified FoR', () => {
    const digests = mockIntraStudyLink.geometryEvidence.snapshots.map((snapshot) => snapshot.geometricDigest);
    assert.equal(new Set(digests).size, 2, 'fixture must exercise two distinct geometric digests');
    assert.doesNotThrow(() => assertCoReferenceEligibility({ link: mockIntraStudyLink, lookupAsset: lookup }));
  });

  it('2. refuses unverified geometry evidence with CO_REFERENCE_NOT_VERIFIED', () => {
    const unverifiedLink = {
      ...mockIntraStudyLink,
      geometryEvidence: { ...mockIntraStudyLink.geometryEvidence, verified: false },
    } as unknown as IntraStudyLink;
    expectCode(
      () => assertCoReferenceEligibility({ link: unverifiedLink, lookupAsset: lookup }),
      'CO_REFERENCE_NOT_VERIFIED',
    );
  });

  it('3. refuses an unresolvable snapshot asset with CO_REFERENCE_UNKNOWN_ASSET', () => {
    expectCode(
      () => assertCoReferenceEligibility({ link: mockIntraStudyLink, lookupAsset: () => undefined }),
      'CO_REFERENCE_UNKNOWN_ASSET',
      mockCtAsset.id,
    );
  });

  it('4. refuses a snapshot/asset FrameOfReferenceUID differing from the link with CO_REFERENCE_FRAME_OF_REFERENCE_MISMATCH', () => {
    const wrongSnapshotFrame = withSnapshots(mockIntraStudyLink.geometryEvidence.snapshots.map((snapshot, index) =>
      index === 0 ? { ...snapshot, frameOfReferenceUID: 'for:different' as FrameOfReferenceUID } : snapshot));
    expectCode(
      () => assertCoReferenceEligibility({ link: wrongSnapshotFrame, lookupAsset: lookup }),
      'CO_REFERENCE_FRAME_OF_REFERENCE_MISMATCH',
      mockCtAsset.id,
    );

    const wrongAssetFrame: ImagingAsset = { ...mockCtAsset, frameOfReferenceUID: 'for:different' as FrameOfReferenceUID };
    expectCode(
      () => assertCoReferenceEligibility({ link: mockIntraStudyLink, lookupAsset: lookupWith(mockCtAsset.id, wrongAssetFrame) }),
      'CO_REFERENCE_FRAME_OF_REFERENCE_MISMATCH',
      mockCtAsset.id,
    );
  });

  it('5. refuses a study mismatch between snapshot fingerprint and asset with CO_REFERENCE_STUDY_MISMATCH', () => {
    const wrongAssetStudy: ImagingAsset = { ...mockCtAsset, studyInstanceUID: 'study:different' as StudyInstanceUID };
    expectCode(
      () => assertCoReferenceEligibility({ link: mockIntraStudyLink, lookupAsset: lookupWith(mockCtAsset.id, wrongAssetStudy) }),
      'CO_REFERENCE_STUDY_MISMATCH',
      mockCtAsset.id,
    );

    const wrongSnapshotStudy = withSnapshots(mockIntraStudyLink.geometryEvidence.snapshots.map((snapshot, index) =>
      index === 1
        ? { ...snapshot, sourceFingerprint: { ...snapshot.sourceFingerprint, studyInstanceUID: 'study:different' as StudyInstanceUID } }
        : snapshot));
    expectCode(
      () => assertCoReferenceEligibility({ link: wrongSnapshotStudy, lookupAsset: lookup }),
      'CO_REFERENCE_STUDY_MISMATCH',
      mockPetAsset.id,
    );
  });

  it('6. refuses a snapshot fingerprint of a different series with CO_REFERENCE_SERIES_MISMATCH', () => {
    const wrongSeriesLink = withSnapshots(mockIntraStudyLink.geometryEvidence.snapshots.map((snapshot, index) =>
      index === 0
        ? { ...snapshot, sourceFingerprint: { ...snapshot.sourceFingerprint, seriesInstanceUID: MOCK_PET_SERIES_UID } }
        : snapshot));
    expectCode(
      () => assertCoReferenceEligibility({ link: wrongSeriesLink, lookupAsset: lookup }),
      'CO_REFERENCE_SERIES_MISMATCH',
      mockCtAsset.id,
    );
  });

  it('7. refuses a different-contentDigest asset fingerprint with CO_REFERENCE_FINGERPRINT_MISMATCH', () => {
    const wrongFingerprintAsset: ImagingAsset = {
      ...mockCtAsset,
      sourceFingerprint: { ...mockCtAsset.sourceFingerprint, contentDigest: 'sha256:different-content-digest' },
    };
    expectCode(
      () => assertCoReferenceEligibility({ link: mockIntraStudyLink, lookupAsset: lookupWith(mockCtAsset.id, wrongFingerprintAsset) }),
      'CO_REFERENCE_FINGERPRINT_MISMATCH',
      mockCtAsset.id,
    );
  });

  it('8. refuses a snapshot digest disagreeing with its own defined fingerprint digest with CO_REFERENCE_GEOMETRIC_DIGEST_MISMATCH', () => {
    const wrongDigestLink = withSnapshots(mockIntraStudyLink.geometryEvidence.snapshots.map((snapshot, index) =>
      index === 0 ? { ...snapshot, geometricDigest: 'sha256:different-from-fingerprint' } : snapshot));
    expectCode(
      () => assertCoReferenceEligibility({ link: wrongDigestLink, lookupAsset: lookup }),
      'CO_REFERENCE_GEOMETRIC_DIGEST_MISMATCH',
      mockCtAsset.id,
    );
  });
});
