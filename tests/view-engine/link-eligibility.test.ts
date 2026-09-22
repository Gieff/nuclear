/**
 * NuClear P4.4 — pure `ViewLink` eligibility tests (ADR-010 §3/§7.2).
 *
 * Pure Node: no DOM, WebGL or Cornerstone. Uses the real shared contract
 * fixtures and the real `view-engine` linking surface (imported through the
 * repository `.js`→`.ts` resolve hook). Positive cases lock in that a
 * co-referenced link with two distinct `geometricDigest`s in one verified Frame
 * of Reference is accepted, and that both inter-study modes accept a valid
 * differential/transform. Negatives assert the exact fail-closed codes,
 * including the composition proof that an unverified link surfaces the reused
 * `CoReferenceError CO_REFERENCE_NOT_VERIFIED`.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type {
  AssetId,
  FrameOfReferenceUID,
  ImagingAsset,
  InterStudyLink,
  IntraStudyLink,
  SpatialTransform,
  Vector3D,
} from '../../packages/shared-types/src/index.js';
import {
  mockCtAsset,
  mockPetAsset,
  mockRigidFollowupTransform,
} from '../fixtures/clinical-contracts.fixture.ts';
import { mockInterStudyLink, mockIntraStudyLink } from '../fixtures/view-contracts.fixture.ts';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const { assertViewLinkEligible, isIntraStudyLink, isInterStudyLink, isViewLink, LinkError, CoReferenceError } =
  await import('../../packages/view-engine/src/linking/index.ts');

const registry = new Map<AssetId, ImagingAsset>([
  [mockCtAsset.id, mockCtAsset],
  [mockPetAsset.id, mockPetAsset],
]);
const lookup = (assetId: AssetId): ImagingAsset | undefined => registry.get(assetId);

const expectLinkError = (run: () => unknown, code: string, messageIncludes?: string): void => {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof LinkError, `expected LinkError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(error.message.includes('Remediation:'), 'expected a remediation clause');
    if (messageIncludes !== undefined) {
      assert.ok(error.message.includes(messageIncludes), `expected '${messageIncludes}' in '${error.message}'`);
    }
    return true;
  });
};

const expectCoReferenceError = (run: () => unknown, code: string): void => {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof CoReferenceError, `expected CoReferenceError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(error.message.includes('Remediation:'), 'expected a remediation clause');
    return true;
  });
};

const relativeLink = (overrides: Partial<InterStudyLink> = {}): InterStudyLink => ({
  kind: 'inter-study',
  mode: 'relative',
  sourceViewId: mockInterStudyLink.sourceViewId,
  targetViewId: mockInterStudyLink.targetViewId,
  sourceFrameOfReferenceUID: mockInterStudyLink.sourceFrameOfReferenceUID,
  targetFrameOfReferenceUID: mockInterStudyLink.targetFrameOfReferenceUID,
  synchronizedState: ['spatial'],
  direction: 'source-to-target',
  navigationDifferentialMm: [0, 0, 5],
  toleranceMm: 2,
  outOfDomainBehavior: 'warn',
  ...overrides,
});

const eligible = (link: unknown): void => assertViewLinkEligible({ link, lookupAsset: lookup });

describe('NuClear P4.4 — ViewLink eligibility', () => {
  it('1. accepts a co-referenced link with two distinct digests in one verified FoR', () => {
    const digests = mockIntraStudyLink.geometryEvidence.snapshots.map((snapshot) => snapshot.geometricDigest);
    assert.equal(new Set(digests).size, 2, 'fixture must exercise two distinct geometric digests');
    assert.doesNotThrow(() => eligible(mockIntraStudyLink));
  });

  it('2. accepts a valid transformed inter-study link', () => {
    assert.doesNotThrow(() => eligible(mockInterStudyLink));
  });

  it('3. accepts a relative inter-study link carrying navigationDifferentialMm', () => {
    assert.equal(relativeLink().mode, 'relative');
    assert.doesNotThrow(() => eligible(relativeLink({ navigationDifferentialMm: [0, 0, 5] as Vector3D })));
  });

  it('4. refuses malformed values with LINK_MALFORMED', () => {
    expectLinkError(() => eligible(null), 'LINK_MALFORMED');
    expectLinkError(() => eligible('not-a-link'), 'LINK_MALFORMED');
    expectLinkError(() => eligible({}), 'LINK_MALFORMED');
    expectLinkError(() => eligible({ kind: 'co-referenced' }), 'LINK_MALFORMED');
    expectLinkError(() => eligible({ kind: 'mystery' }), 'LINK_MALFORMED');
  });

  it('5. refuses an intra-study link whose evidence frame differs with LINK_INTRA_STUDY_EVIDENCE_FRAME_MISMATCH', () => {
    const wrongFrame: IntraStudyLink = {
      ...mockIntraStudyLink,
      geometryEvidence: {
        ...mockIntraStudyLink.geometryEvidence,
        frameOfReferenceUID: 'for:different' as FrameOfReferenceUID,
      },
    };
    expectLinkError(
      () => eligible(wrongFrame),
      'LINK_INTRA_STUDY_EVIDENCE_FRAME_MISMATCH',
      mockIntraStudyLink.frameOfReferenceUID,
    );
  });

  it('6. refuses a correlation mismatch with LINK_INTRA_STUDY_EVIDENCE_MISMATCH', () => {
    const emptyEvidence: IntraStudyLink = {
      ...mockIntraStudyLink,
      geometryEvidence: { ...mockIntraStudyLink.geometryEvidence, assetIds: [], snapshots: [] },
    };
    expectLinkError(() => eligible(emptyEvidence), 'LINK_INTRA_STUDY_EVIDENCE_MISMATCH');

    const duplicateAssetIds: IntraStudyLink = {
      ...mockIntraStudyLink,
      geometryEvidence: {
        ...mockIntraStudyLink.geometryEvidence,
        assetIds: [mockCtAsset.id, mockCtAsset.id],
      },
    };
    expectLinkError(() => eligible(duplicateAssetIds), 'LINK_INTRA_STUDY_EVIDENCE_MISMATCH');

    const differentStudy: IntraStudyLink = {
      ...mockIntraStudyLink,
      geometryEvidence: {
        ...mockIntraStudyLink.geometryEvidence,
        snapshots: mockIntraStudyLink.geometryEvidence.snapshots.map((snapshot, index) =>
          index === 1
            ? { ...snapshot, sourceFingerprint: { ...snapshot.sourceFingerprint, studyInstanceUID: 'study:other' as typeof snapshot.sourceFingerprint.studyInstanceUID } }
            : snapshot,
        ),
      },
    };
    expectLinkError(() => eligible(differentStudy), 'LINK_INTRA_STUDY_EVIDENCE_MISMATCH');
  });

  it('7. composes assertCoReferenceEligibility: an unverified link raises CoReferenceError CO_REFERENCE_NOT_VERIFIED', () => {
    const unverified = {
      ...mockIntraStudyLink,
      geometryEvidence: { ...mockIntraStudyLink.geometryEvidence, verified: false },
    } as unknown as IntraStudyLink;
    expectCoReferenceError(() => eligible(unverified), 'CO_REFERENCE_NOT_VERIFIED');
  });

  it('8. refuses same source/target frame with LINK_INTER_STUDY_SAME_FRAME', () => {
    const sameFrame: InterStudyLink = {
      ...mockInterStudyLink,
      targetFrameOfReferenceUID: mockInterStudyLink.sourceFrameOfReferenceUID,
    };
    expectLinkError(() => eligible(sameFrame), 'LINK_INTER_STUDY_SAME_FRAME');
  });

  it('9. refuses a missing/invalid differential and an inconsistent mode', () => {
    expectLinkError(
      () => eligible(relativeLink({ navigationDifferentialMm: undefined })),
      'LINK_INTER_STUDY_MISSING_DIFFERENTIAL',
    );
    expectLinkError(
      () => eligible(relativeLink({ navigationDifferentialMm: [0, 0, Number.NaN] as Vector3D })),
      'LINK_INTER_STUDY_DIFFERENTIAL_INVALID',
    );
    // A malformed runtime payload must still yield the TYPED LinkError: a
    // non-array differential has no `.join`, and a wrong-length array has no
    // `.join`-friendly 3-tuple. Both previously escaped as a TypeError.
    expectLinkError(
      () => eligible(relativeLink({ navigationDifferentialMm: 'bad' as unknown as Vector3D })),
      'LINK_INTER_STUDY_DIFFERENTIAL_INVALID',
    );
    expectLinkError(
      () => eligible(relativeLink({ navigationDifferentialMm: [0, 0] as unknown as Vector3D })),
      'LINK_INTER_STUDY_DIFFERENTIAL_INVALID',
    );
    expectLinkError(
      () => eligible(relativeLink({ spatialTransform: mockRigidFollowupTransform })),
      'LINK_INTER_STUDY_MODE_INCONSISTENT',
    );
    expectLinkError(
      () => eligible({ ...mockInterStudyLink, navigationDifferentialMm: [0, 0, 5] as Vector3D }),
      'LINK_INTER_STUDY_MODE_INCONSISTENT',
    );
  });

  it('10. refuses a missing/invalid transform and a frame/out-of-domain mismatch', () => {
    expectLinkError(
      () => eligible({ ...mockInterStudyLink, spatialTransform: undefined }),
      'LINK_INTER_STUDY_MISSING_TRANSFORM',
    );
    // Malformed transform payloads must still yield the TYPED LinkError: a
    // non-record transform and a record without `validity` both previously
    // dereferenced `transform.validity.isValid` before throwing, leaking a
    // TypeError instead of the typed refusal.
    expectLinkError(
      () => eligible({ ...mockInterStudyLink, spatialTransform: 'not-a-transform' as unknown as SpatialTransform }),
      'LINK_INTER_STUDY_TRANSFORM_INVALID',
    );
    expectLinkError(
      () => eligible({ ...mockInterStudyLink, spatialTransform: { ...mockRigidFollowupTransform, validity: undefined } as unknown as SpatialTransform }),
      'LINK_INTER_STUDY_TRANSFORM_INVALID',
    );
    expectLinkError(
      () => eligible({ ...mockInterStudyLink, spatialTransform: { ...mockRigidFollowupTransform, units: 'cm' } as unknown as SpatialTransform }),
      'LINK_INTER_STUDY_TRANSFORM_INVALID',
    );
    expectLinkError(
      () => eligible({ ...mockInterStudyLink, spatialTransform: { ...mockRigidFollowupTransform, validity: { ...mockRigidFollowupTransform.validity, isValid: false } } }),
      'LINK_INTER_STUDY_TRANSFORM_INVALID',
    );
    expectLinkError(
      () => eligible({ ...mockInterStudyLink, spatialTransform: { ...mockRigidFollowupTransform, sourceFrameOfReferenceUID: 'for:other' as FrameOfReferenceUID } }),
      'LINK_INTER_STUDY_TRANSFORM_FRAME_MISMATCH',
    );
    expectLinkError(
      () => eligible({ ...mockInterStudyLink, spatialTransform: { ...mockRigidFollowupTransform, validity: { ...mockRigidFollowupTransform.validity, outOfDomainBehavior: 'hide' } } }),
      'LINK_INTER_STUDY_OUT_OF_DOMAIN_MISMATCH',
    );
  });

  it('11. refuses a non-finite or negative tolerance with LINK_INTER_STUDY_TOLERANCE_INVALID', () => {
    expectLinkError(() => eligible({ ...mockInterStudyLink, toleranceMm: -1 }), 'LINK_INTER_STUDY_TOLERANCE_INVALID');
    expectLinkError(() => eligible({ ...mockInterStudyLink, toleranceMm: Number.NaN }), 'LINK_INTER_STUDY_TOLERANCE_INVALID');
  });

  it('12. guards accept the well-formed links and reject malformed shapes', () => {
    assert.equal(isIntraStudyLink(mockIntraStudyLink), true);
    assert.equal(isInterStudyLink(mockInterStudyLink), true);
    assert.equal(isViewLink(mockIntraStudyLink), true);
    assert.equal(isViewLink(mockInterStudyLink), true);

    assert.equal(isViewLink(null), false);
    assert.equal(isViewLink({}), false);
    assert.equal(isIntraStudyLink({ kind: 'inter-study' }), false);
    assert.equal(isInterStudyLink({ kind: 'co-referenced' }), false);
    assert.equal(isIntraStudyLink({ ...mockIntraStudyLink, synchronizedState: ['mystery'] }), false);
    assert.equal(isInterStudyLink({ ...mockInterStudyLink, direction: 'target-to-source' }), false);
    assert.equal(isInterStudyLink({ ...mockInterStudyLink, mode: 'mystery' }), false);
    assert.equal(isInterStudyLink({ ...mockInterStudyLink, toleranceMm: '2' }), false);
    assert.equal(isInterStudyLink({ ...mockInterStudyLink, outOfDomainBehavior: 'mystery' }), false);
  });

  it('13. guards are deliberately shape-only so semantic codes stay reachable', () => {
    // A stricter guard would collapse these into LINK_MALFORMED; the specific
    // codes are produced by the eligibility layer, so the guard must accept them.
    const unverified = { ...mockIntraStudyLink, geometryEvidence: { ...mockIntraStudyLink.geometryEvidence, verified: false } };
    const sameFrame = { ...mockInterStudyLink, targetFrameOfReferenceUID: mockInterStudyLink.sourceFrameOfReferenceUID };
    assert.equal(isIntraStudyLink(unverified), true);
    assert.equal(isInterStudyLink(sameFrame), true);
    assert.equal(isInterStudyLink({ ...mockInterStudyLink, toleranceMm: Number.NaN }), true);
  });
});
