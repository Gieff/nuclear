/**
 * NuClear C5 + C6 — provenance↔asset correlation and slot→PreparedView binding.
 *
 * Pure Node (no DOM/WebGL/Cornerstone), real public API. C5 pins the
 * positional one-to-one correlation (ADR-010 §7.3): length → study → series →
 * fingerprint, all against the stored validated assets, with no workspace
 * mutation on refusal. C6 pins the explicit fail-closed slot binding
 * precedence: view-exists → slot transition.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  PreparedView,
  PreparedViewId,
  SourceFingerprint,
  StudyInstanceUID,
  ViewProvenance,
  ViewSlotId,
} from '../../packages/shared-types/src/index.js';
import { MOCK_CT_SERIES_UID, mockViewProvenance } from '../fixtures/clinical-contracts.fixture.ts';
import {
  mockFusionView,
  mockPetView,
  mockPetViewProvenance,
} from '../fixtures/view-contracts.fixture.ts';
import {
  ImagingWorkspace,
  mockCtAsset,
  mockPetAsset,
  mockStudyReference,
  expectWorkspaceError,
} from './fixtures/workspace-fixtures.ts';

// `workspace-fixtures` registers the `.js`→`.ts` resolve hook as a static
// dependency, so the real product sources below import by value.
const preparedViewModule = await import('../../packages/view-engine/src/prepared-view/index.ts');
const { assemblePreparedView, PreparedViewError } = preparedViewModule;

type Workspace = InstanceType<typeof ImagingWorkspace>;

const PET_VIEW = 'prepared-view-c5-pet' as PreparedViewId;
const FUSION_VIEW = 'prepared-view-c5-fusion' as PreparedViewId;
const REFUSED_VIEW = 'prepared-view-c5-refused' as PreparedViewId;
const UNKNOWN_VIEW = 'prepared-view-c5-missing' as PreparedViewId;
const OTHER_VIEW = 'prepared-view-c6-other' as PreparedViewId;

function workspaceWithBothAssets(): Workspace {
  const workspace = new ImagingWorkspace();
  workspace.registerStudy(mockStudyReference);
  workspace.registerAsset(mockCtAsset);
  workspace.registerAsset(mockPetAsset);
  return workspace;
}

function petOnlyWorkspace(): Workspace {
  const workspace = new ImagingWorkspace();
  workspace.registerStudy(mockStudyReference);
  workspace.registerAsset(mockPetAsset);
  return workspace;
}

/** Asserts the exact `PreparedViewError` code and that the message names each fragment. */
function expectPreparedViewError(
  run: () => unknown,
  code: string,
  fragments: readonly string[],
): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof PreparedViewError, `expected PreparedViewError, got ${String(error)}`);
    assert.equal(error.code, code);
    for (const fragment of fragments) {
      assert.ok(
        error.message.includes(fragment),
        `expected message to name '${fragment}', got: ${error.message}`,
      );
    }
    return true;
  });
}

const regPetView = (provenance: ViewProvenance, id: PreparedViewId): PreparedView =>
  assemblePreparedView({ preparedViewId: id, state: mockPetView, provenance });

describe('NuClear C5 — provenance ↔ registered-asset cross-validation', () => {
  it('1. accepts the coherent CT-then-PET provenance for a fusion view', () => {
    const workspace = workspaceWithBothAssets();
    const view = assemblePreparedView({
      preparedViewId: FUSION_VIEW,
      state: mockFusionView,
      provenance: mockViewProvenance,
    });
    assert.equal(workspace.registerPreparedView(view), view);
    assert.equal(workspace.listPreparedViews().length, 1);
  });

  it('2. accepts a PET-only provenance with the PET asset, series and fingerprint', () => {
    const workspace = petOnlyWorkspace();
    const view = regPetView(mockPetViewProvenance, PET_VIEW);
    assert.equal(workspace.registerPreparedView(view), view);
    assert.equal(workspace.getPreparedView(PET_VIEW), view);
  });

  it('3. accepts a structurally equal fingerprint whose keys are reordered', () => {
    const workspace = petOnlyWorkspace();
    const registered = mockPetAsset.sourceFingerprint;
    const reordered: SourceFingerprint = {
      contentDigest: registered.contentDigest,
      studyInstanceUID: registered.studyInstanceUID,
      seriesInstanceUID: registered.seriesInstanceUID,
      instanceCount: registered.instanceCount,
      sopInstanceUIDsHash: registered.sopInstanceUIDsHash,
      totalBytes: registered.totalBytes,
      geometricDigest: registered.geometricDigest,
    };
    const provenance: ViewProvenance = {
      ...mockPetViewProvenance,
      sourceFingerprints: [reordered],
    };
    const view = regPetView(provenance, PET_VIEW);
    assert.equal(workspace.registerPreparedView(view), view);
  });

  it('4. refuses a PET asset whose provenance carries the CT series', () => {
    const workspace = workspaceWithBothAssets();
    const conflicting: ViewProvenance = {
      ...mockPetViewProvenance,
      sourceSeriesInstanceUIDs: [MOCK_CT_SERIES_UID],
    };
    const view = regPetView(conflicting, REFUSED_VIEW);
    expectPreparedViewError(
      () => workspace.registerPreparedView(view),
      'PREPARED_VIEW_PROVENANCE_SERIES_MISMATCH',
      [REFUSED_VIEW, mockPetAsset.id, 'index 0', MOCK_CT_SERIES_UID],
    );
    assert.equal(workspace.listPreparedViews().length, 0);
  });

  it('5. refuses a PET asset whose provenance carries the CT fingerprint', () => {
    const workspace = workspaceWithBothAssets();
    const conflicting: ViewProvenance = {
      ...mockPetViewProvenance,
      sourceFingerprints: [mockCtAsset.sourceFingerprint],
    };
    const view = regPetView(conflicting, REFUSED_VIEW);
    expectPreparedViewError(
      () => workspace.registerPreparedView(view),
      'PREPARED_VIEW_PROVENANCE_FINGERPRINT_MISMATCH',
      [REFUSED_VIEW, mockPetAsset.id, 'contentDigest', mockCtAsset.sourceFingerprint.contentDigest],
    );
    assert.equal(workspace.listPreparedViews().length, 0);
  });

  it('6. refuses provenance arrays with different lengths before any asset check', () => {
    const workspace = workspaceWithBothAssets();
    const conflicting: ViewProvenance = { ...mockPetViewProvenance, sourceSeriesInstanceUIDs: [] };
    const view = regPetView(conflicting, REFUSED_VIEW);
    expectPreparedViewError(
      () => workspace.registerPreparedView(view),
      'PREPARED_VIEW_PROVENANCE_LENGTH_MISMATCH',
      [REFUSED_VIEW, '1 sourceAssetIds', '0 sourceSeriesInstanceUIDs'],
    );
    assert.equal(workspace.listPreparedViews().length, 0);
  });

  it('7. refuses a provenance study that differs from the stored asset study', () => {
    const workspace = workspaceWithBothAssets();
    const foreignStudy = '1.2.840.10008.1.1.20990101.999' as StudyInstanceUID;
    const conflicting: ViewProvenance = { ...mockPetViewProvenance, studyInstanceUID: foreignStudy };
    const view = regPetView(conflicting, REFUSED_VIEW);
    expectPreparedViewError(
      () => workspace.registerPreparedView(view),
      'PREPARED_VIEW_PROVENANCE_STUDY_MISMATCH',
      [REFUSED_VIEW, mockPetAsset.id, 'index 0', foreignStudy, mockPetAsset.studyInstanceUID],
    );
    assert.equal(workspace.listPreparedViews().length, 0);
  });

  it('8. every refusal leaves the workspace exactly as it was', () => {
    const workspace = workspaceWithBothAssets();
    const good = regPetView(mockPetViewProvenance, PET_VIEW);
    workspace.registerPreparedView(good);
    const before = JSON.stringify(workspace.snapshot());

    const variants: readonly ViewProvenance[] = [
      { ...mockPetViewProvenance, sourceSeriesInstanceUIDs: [MOCK_CT_SERIES_UID] },
      { ...mockPetViewProvenance, sourceFingerprints: [mockCtAsset.sourceFingerprint] },
      { ...mockPetViewProvenance, sourceSeriesInstanceUIDs: [] },
      { ...mockPetViewProvenance, studyInstanceUID: '1.2.840.10008.1.1.20990101.998' as StudyInstanceUID },
    ];
    for (const provenance of variants) {
      const refused = regPetView(provenance, REFUSED_VIEW);
      assert.throws(() => workspace.registerPreparedView(refused));
      assert.equal(workspace.listPreparedViews().length, 1);
      assert.equal(workspace.listPreparedViews()[0], good);
      assert.equal(JSON.stringify(workspace.snapshot()), before);
    }
  });
});

describe('NuClear C6 — explicit fail-closed slot → PreparedView binding', () => {
  function workspaceWithRegisteredView(): { workspace: Workspace; view: PreparedView } {
    const workspace = petOnlyWorkspace();
    const view = regPetView(mockPetViewProvenance, PET_VIEW);
    workspace.registerPreparedView(view);
    return { workspace, view };
  }

  it('1. binds a registered prepared view and preserves its identity', () => {
    const { workspace, view } = workspaceWithRegisteredView();
    const slotId = workspace.slots.listSlots()[0].id;
    const bound = workspace.bindSlotToPreparedView(slotId, view.id);
    assert.equal(bound.status, 'bound');
    assert.equal(bound.preparedViewId, view.id);
    assert.equal(workspace.slots.getSlot(slotId).preparedViewId, view.id);
    assert.equal(workspace.getPreparedView(view.id), view);
    assert.equal(workspace.listPreparedViews()[0], view);
  });

  it('2. refuses an unknown prepared view before touching the slot', () => {
    const { workspace } = workspaceWithRegisteredView();
    const slotId = workspace.slots.listSlots()[0].id;
    expectPreparedViewError(
      () => workspace.bindSlotToPreparedView(slotId, UNKNOWN_VIEW),
      'PREPARED_VIEW_UNKNOWN_ID',
      [UNKNOWN_VIEW, slotId],
    );
    assert.equal(workspace.slots.getSlot(slotId).status, 'empty');
  });

  it('3. refuses an unknown slot after the view-exists precedence check', () => {
    const { workspace, view } = workspaceWithRegisteredView();
    expectWorkspaceError(
      () => workspace.bindSlotToPreparedView('view-slot-99-mip' as ViewSlotId, view.id),
      'WORKSPACE_UNKNOWN_SLOT',
    );
  });

  it('4. refuses binding a registered view onto an already-bound slot', () => {
    const { workspace, view } = workspaceWithRegisteredView();
    const other = assemblePreparedView({
      preparedViewId: OTHER_VIEW,
      state: mockPetView,
      provenance: mockPetViewProvenance,
    });
    workspace.registerPreparedView(other);
    const slotId = workspace.slots.listSlots()[0].id;
    workspace.bindSlotToPreparedView(slotId, view.id);
    expectWorkspaceError(
      () => workspace.bindSlotToPreparedView(slotId, other.id),
      'WORKSPACE_ILLEGAL_SLOT_TRANSITION',
    );
    assert.equal(workspace.slots.getSlot(slotId).preparedViewId, view.id);
  });

  it('5. a registered prepared view with zero bound slots remains legal', () => {
    const { workspace, view } = workspaceWithRegisteredView();
    assert.equal(workspace.listPreparedViews().length, 1);
    assert.ok(workspace.slots.listSlots().every((slot) => slot.status === 'empty'));
    assert.equal(workspace.getPreparedView(view.id), view);
    const slotId = workspace.slots.listSlots()[1].id;
    assert.equal(workspace.bindSlotToPreparedView(slotId, view.id).preparedViewId, view.id);
  });
});
