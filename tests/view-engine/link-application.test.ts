/**
 * NuClear P4.4 — pure co-referenced link application tests (P4.3 atomic path).
 *
 * Pure Node: no DOM, WebGL or Cornerstone. Proves that applying a co-referenced
 * link goes through the shared-state projection path — both views observe the
 * same frozen `spatial`/`camera` pair, both record the link once, the registry
 * matches the returned views, pre-application frozen views are untouched, and
 * re-applying is idempotent. Negatives assert each refusal leaves the registry,
 * groups and views unchanged.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PreparedViewId, ViewId } from '../../packages/shared-types/src/index.js';
import type { SharedStateGroupId } from '../../packages/view-engine/src/shared-state/types.ts';
import { mockViewProvenance } from '../fixtures/clinical-contracts.fixture.ts';
import {
  mockIntraStudyLink,
  mockInterStudyLink,
  mockMedicalView,
  mockPetView,
  mockPetViewProvenance,
} from '../fixtures/view-contracts.fixture.ts';
import {
  ImagingWorkspace,
  mockCtAsset,
  mockPetAsset,
  mockStudyReference,
} from './fixtures/workspace-fixtures.ts';

const preparedViewModule = await import('../../packages/view-engine/src/prepared-view/index.ts');
const linkingModule = await import('../../packages/view-engine/src/linking/index.ts');

const { assemblePreparedView } = preparedViewModule;
const { LinkError, CoReferenceError } = linkingModule;

const CT_PREPARED = 'prepared-link-ct' as PreparedViewId;
const PET_PREPARED = 'prepared-link-pet' as PreparedViewId;
const LINK_GROUP = 'link-group-intra' as SharedStateGroupId;
const GROUP_A = 'link-group-a' as SharedStateGroupId;
const GROUP_B = 'link-group-b' as SharedStateGroupId;

function buildWorkspace(): InstanceType<typeof ImagingWorkspace> {
  const workspace = new ImagingWorkspace();
  workspace.registerStudy(mockStudyReference);
  workspace.registerAsset(mockCtAsset);
  workspace.registerAsset(mockPetAsset);
  workspace.registerPreparedView(assemblePreparedView({
    preparedViewId: CT_PREPARED,
    state: structuredClone(mockMedicalView),
    provenance: structuredClone(mockViewProvenance),
  }));
  workspace.registerPreparedView(assemblePreparedView({
    preparedViewId: PET_PREPARED,
    state: structuredClone(mockPetView),
    provenance: structuredClone(mockPetViewProvenance),
  }));
  return workspace;
}

const request = {
  link: mockIntraStudyLink,
  sourcePreparedViewId: CT_PREPARED,
  targetPreparedViewId: PET_PREPARED,
  sharedStateGroupId: LINK_GROUP,
} as const;

const expectLinkError = (run: () => unknown, code: string): void => {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof LinkError, `expected LinkError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(error.message.includes('Remediation:'), 'expected a remediation clause');
    return true;
  });
};

describe('NuClear P4.4 — co-referenced link application', () => {
  it('1. shares one frozen spatial/camera pair and records the link on both views', () => {
    const workspace = buildWorkspace();
    const beforeCt = workspace.getPreparedView(CT_PREPARED);
    const beforePet = workspace.getPreparedView(PET_PREPARED);
    const beforePetSpatial = beforePet.state.spatial;

    const applied = workspace.applyCoReferencedLink(request);

    assert.equal(applied.link, mockIntraStudyLink);
    assert.equal(applied.sharedStateGroupId, LINK_GROUP);
    assert.equal(applied.source.id, CT_PREPARED);
    assert.equal(applied.target.id, PET_PREPARED);

    const group = workspace.sharedStateGroups.getGroup(LINK_GROUP);
    assert.equal(applied.source.state.spatial, applied.target.state.spatial);
    assert.equal(applied.source.state.camera, applied.target.state.camera);
    assert.equal(applied.source.state.spatial, group.spatial);
    assert.equal(applied.target.state.camera, group.camera);
    assert.ok(Object.isFrozen(applied.source.state.spatial), 'the shared pair stays frozen');
    assert.ok(Object.isFrozen(applied.target.state.camera), 'the shared pair stays frozen');
    assert.ok(Object.isFrozen(applied), 'the applied-link wrapper must be frozen');
    assert.throws(
      () => {
        (applied as { link: unknown }).link = null;
      },
      TypeError,
      'mutating the returned wrapper must throw',
    );

    assert.equal(applied.source.links.filter((link) => link === mockIntraStudyLink).length, 1);
    assert.equal(applied.target.links.filter((link) => link === mockIntraStudyLink).length, 1);

    assert.equal(workspace.getPreparedView(CT_PREPARED), applied.source);
    assert.equal(workspace.getPreparedView(PET_PREPARED), applied.target);
    assert.deepEqual([...workspace.sharedStateGroups.listMembers(LINK_GROUP)], [CT_PREPARED, PET_PREPARED]);

    // The pre-application frozen views are unchanged and were not mutated in place.
    assert.notEqual(applied.source, beforeCt);
    assert.notEqual(applied.target, beforePet);
    assert.equal(beforeCt.links.length, 0);
    assert.equal(beforePet.links.length, 0);
    assert.ok(Object.isFrozen(beforeCt));
    assert.ok(Object.isFrozen(beforePetSpatial));
    assert.notEqual(applied.target.state.spatial, beforePetSpatial, 'the target was projected onto the shared pair');
  });

  it('2. re-applying the same link is idempotent (same objects, no duplicate link)', () => {
    const workspace = buildWorkspace();
    const first = workspace.applyCoReferencedLink(request);
    const second = workspace.applyCoReferencedLink(request);

    assert.equal(second.source, first.source);
    assert.equal(second.target, first.target);
    assert.equal(second.link, first.link);
    assert.equal(first.source.links.length, 1);
    assert.equal(first.target.links.length, 1);
    assert.deepEqual([...workspace.sharedStateGroups.listMembers(LINK_GROUP)], [CT_PREPARED, PET_PREPARED]);

    // A structurally equal but distinct link object must dedupe too, and the
    // canonical stored (frozen) link is what the wrapper returns.
    const equalLink = structuredClone(mockIntraStudyLink);
    assert.notEqual(equalLink, mockIntraStudyLink, 'the re-apply link is a distinct object');
    const equivalent = workspace.applyCoReferencedLink({ ...request, link: equalLink });
    assert.equal(equivalent.source, first.source, 'a structurally equal re-apply must not re-project');
    assert.equal(equivalent.target, first.target);
    assert.equal(equivalent.link, first.link, 'the canonical stored link is returned');
    assert.equal(first.source.links.length, 1, 'no duplicate link for a structurally equal re-apply');
  });

  it('3. refuses an inter-study link with LINK_APPLICATION_REQUIRES_CO_REFERENCE and mutates nothing', () => {
    const workspace = buildWorkspace();
    const ctBefore = workspace.getPreparedView(CT_PREPARED);
    const petBefore = workspace.getPreparedView(PET_PREPARED);

    expectLinkError(
      () => workspace.applyCoReferencedLink({ ...request, link: mockInterStudyLink }),
      'LINK_APPLICATION_REQUIRES_CO_REFERENCE',
    );

    assert.equal(workspace.getPreparedView(CT_PREPARED), ctBefore);
    assert.equal(workspace.getPreparedView(PET_PREPARED), petBefore);
    assert.equal(workspace.sharedStateGroups.hasGroup(LINK_GROUP), false);
    assert.equal(workspace.sharedStateGroups.listGroups().length, 0);
    assert.equal(workspace.sharedStateGroups.groupOf(CT_PREPARED), undefined);
  });

  it('4. refuses a source/target view-id mismatch with LINK_VIEW_MISMATCH', () => {
    const workspace = buildWorkspace();
    const ctBefore = workspace.getPreparedView(CT_PREPARED);
    const petBefore = workspace.getPreparedView(PET_PREPARED);

    expectLinkError(
      () => workspace.applyCoReferencedLink({ ...request, link: { ...mockIntraStudyLink, sourceViewId: 'view-other' as ViewId } }),
      'LINK_VIEW_MISMATCH',
    );

    assert.equal(workspace.getPreparedView(CT_PREPARED), ctBefore);
    assert.equal(workspace.getPreparedView(PET_PREPARED), petBefore);
    assert.equal(workspace.sharedStateGroups.listGroups().length, 0);
    assert.equal(workspace.sharedStateGroups.groupOf(PET_PREPARED), undefined);
  });

  it('5. refuses a self-referenced view with LINK_SELF_REFERENCE', () => {
    const workspace = buildWorkspace();
    const ctBefore = workspace.getPreparedView(CT_PREPARED);

    expectLinkError(
      () => workspace.applyCoReferencedLink({ ...request, targetPreparedViewId: CT_PREPARED }),
      'LINK_SELF_REFERENCE',
    );

    assert.equal(workspace.getPreparedView(CT_PREPARED), ctBefore);
    assert.equal(workspace.sharedStateGroups.listGroups().length, 0);
  });

  it('6. refuses views already attached to different groups with LINK_SHARED_STATE_CONFLICT', () => {
    const workspace = buildWorkspace();
    const ct = workspace.getPreparedView(CT_PREPARED);
    const pet = workspace.getPreparedView(PET_PREPARED);
    workspace.sharedStateGroups.createGroup({ id: GROUP_A, spatial: ct.state.spatial, camera: ct.state.camera });
    workspace.sharedStateGroups.createGroup({ id: GROUP_B, spatial: pet.state.spatial, camera: pet.state.camera });
    workspace.sharedStateGroups.attach(GROUP_A, CT_PREPARED);
    workspace.sharedStateGroups.attach(GROUP_B, PET_PREPARED);
    const ctAttached = workspace.getPreparedView(CT_PREPARED);
    const petAttached = workspace.getPreparedView(PET_PREPARED);

    expectLinkError(() => workspace.applyCoReferencedLink(request), 'LINK_SHARED_STATE_CONFLICT');

    assert.equal(workspace.getPreparedView(CT_PREPARED), ctAttached);
    assert.equal(workspace.getPreparedView(PET_PREPARED), petAttached);
    assert.equal(workspace.sharedStateGroups.groupOf(CT_PREPARED)?.id, GROUP_A);
    assert.equal(workspace.sharedStateGroups.groupOf(PET_PREPARED)?.id, GROUP_B);
    assert.equal(workspace.sharedStateGroups.hasGroup(LINK_GROUP), false);
  });

  it('7. propagates an ineligible (unverified) link with no group or view mutation', () => {
    const workspace = buildWorkspace();
    const ctBefore = workspace.getPreparedView(CT_PREPARED);
    const petBefore = workspace.getPreparedView(PET_PREPARED);
    const unverified = {
      ...mockIntraStudyLink,
      geometryEvidence: { ...mockIntraStudyLink.geometryEvidence, verified: false },
    } as unknown as typeof mockIntraStudyLink;

    assert.throws(
      () => workspace.applyCoReferencedLink({ ...request, link: unverified }),
      (error: unknown) => {
        assert.ok(error instanceof CoReferenceError, `expected CoReferenceError, got ${String(error)}`);
        assert.equal(error.code, 'CO_REFERENCE_NOT_VERIFIED');
        assert.ok(error.message.includes('Remediation:'), 'expected a remediation clause');
        return true;
      },
    );

    assert.equal(workspace.getPreparedView(CT_PREPARED), ctBefore);
    assert.equal(workspace.getPreparedView(PET_PREPARED), petBefore);
    assert.equal(workspace.sharedStateGroups.listGroups().length, 0);
    assert.equal(workspace.sharedStateGroups.groupOf(CT_PREPARED), undefined);
    assert.equal(workspace.sharedStateGroups.groupOf(PET_PREPARED), undefined);
  });

  it('8. reuses an existing empty group when neither view is attached', () => {
    const workspace = buildWorkspace();
    const ct = workspace.getPreparedView(CT_PREPARED);
    workspace.sharedStateGroups.createGroup({ id: LINK_GROUP, spatial: ct.state.spatial, camera: ct.state.camera });

    const applied = workspace.applyCoReferencedLink(request);

    assert.equal(workspace.sharedStateGroups.getGroup(LINK_GROUP).id, LINK_GROUP);
    assert.deepEqual([...workspace.sharedStateGroups.listMembers(LINK_GROUP)], [CT_PREPARED, PET_PREPARED]);
    assert.equal(applied.source.state.spatial, workspace.sharedStateGroups.getGroup(LINK_GROUP).spatial);
  });

  it('9. refuses a malformed runtime link with a typed LinkError, not a TypeError', () => {
    const workspace = buildWorkspace();
    const ctBefore = workspace.getPreparedView(CT_PREPARED);

    for (const malformed of [null, undefined, 'not-a-link', { kind: 'mystery' }] as unknown[]) {
      assert.throws(
        () => workspace.applyCoReferencedLink({ ...request, link: malformed as typeof mockIntraStudyLink }),
        (error: unknown) => {
          assert.ok(
            error instanceof LinkError,
            `expected LinkError for ${String(malformed)}, got ${String(error)}`,
          );
          assert.equal(error.code, 'LINK_MALFORMED');
          assert.ok(error.message.includes('Remediation:'), 'expected a remediation clause');
          return true;
        },
      );
    }

    assert.equal(workspace.getPreparedView(CT_PREPARED), ctBefore, 'a refused link mutates no view');
    assert.equal(workspace.sharedStateGroups.listGroups().length, 0, 'a refused link creates no group');
  });
});
