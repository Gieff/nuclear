/**
 * NuClear P4.2 — pure `PreparedView` assembly and provenance tests.
 *
 * Pure Node: no DOM, WebGL or Cornerstone. Fixture seam: the shared
 * `mockMedicalView` binds the literal `'asset-ct'`, absent from
 * `mockViewProvenance`, and the accepted P3 suite asserts that literal id. So
 * positive assembly uses the internally consistent `mockPetView` /
 * `mockFusionView` pairs, and case 13 records the mismatch as an explicit
 * fail-closed regression guard.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  PreparedViewId,
  StateLock,
  ViewLink,
  ViewProvenance,
} from '../../packages/shared-types/src/index.js';
import {
  mockFusionView,
  mockFusionViewProvenance,
  mockIntraStudyLink,
  mockMedicalView,
  mockPetView,
  mockPetViewProvenance,
  mockViewLock,
} from '../fixtures/view-contracts.fixture.ts';
import { mockViewProvenance } from '../fixtures/clinical-contracts.fixture.ts';
import {
  ImagingWorkspace,
  WorkspaceError,
  mockCtAsset,
  mockPetAsset,
  mockStudyReference,
} from './fixtures/workspace-fixtures.ts';

// `workspace-fixtures` registers the `.js`→`.ts` resolve hook as a static
// dependency, so the real product sources below import by value.
const preparedViewModule = await import('../../packages/view-engine/src/prepared-view/index.ts');
const { assemblePreparedView, boundAssetIds, PreparedViewRegistry, PreparedViewError } =
  preparedViewModule;

const PET_PREPARED = 'prepared-view-pet-test' as PreparedViewId;
const FUSION_PREPARED = 'prepared-view-fusion-test' as PreparedViewId;
const UNKNOWN_PREPARED = 'prepared-view-missing' as PreparedViewId;

const oneCtWorkspace = (): ImagingWorkspace => {
  const workspace = new ImagingWorkspace();
  workspace.registerStudy(mockStudyReference);
  workspace.registerAsset(mockCtAsset);
  return workspace;
};

const expectPreparedViewError = (run: () => unknown, code: string): void => {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof PreparedViewError, `expected PreparedViewError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    return true;
  });
};

describe('NuClear P4.2 — PreparedView assembly and provenance', () => {
  it('1. derives sourceViewId from the state and preserves state/provenance identity', () => {
    const view = assemblePreparedView({ preparedViewId: PET_PREPARED, state: mockPetView, provenance: mockPetViewProvenance });
    assert.equal(view.id, PET_PREPARED);
    assert.equal(view.sourceViewId, mockPetView.id, 'sourceViewId must derive from MedicalViewState.id');
    assert.equal(view.state, mockPetView, 'state must be stored by reference for P4.3 identity');
    assert.equal(view.provenance, mockPetViewProvenance, 'provenance must be stored by reference');
    assert.deepEqual(view.links, []);
    assert.deepEqual(view.locks, []);
    assert.deepEqual([...boundAssetIds(view.state)], [mockPetAsset.id]);
  });

  it('2. links/locks default to empty arrays and are shallow-copied', () => {
    const defaulted = assemblePreparedView({ preparedViewId: PET_PREPARED, state: mockPetView, provenance: mockPetViewProvenance });
    assert.deepEqual(defaulted.links, []);
    assert.deepEqual(defaulted.locks, []);
    assert.equal('cachedPreviewReference' in defaulted, false);

    const links: ViewLink[] = [mockIntraStudyLink];
    const locks: StateLock[] = [mockViewLock];
    const view = assemblePreparedView({ preparedViewId: PET_PREPARED, state: mockPetView, provenance: mockPetViewProvenance, links, locks });
    assert.notEqual(view.links, links, 'links must be a new array');
    assert.notEqual(view.locks, locks, 'locks must be a new array');
    assert.deepEqual(view.links, [mockIntraStudyLink]);
    assert.deepEqual(view.locks, [mockViewLock]);

    links.pop();
    locks.pop();
    assert.equal(links.length, 0);
    assert.equal(locks.length, 0);
    assert.equal(view.links.length, 1, 'mutating the input array must not change the assembled view');
    assert.equal(view.locks.length, 1, 'mutating the input array must not change the assembled view');
  });

  it('3. registry register/get/list/has/snapshot preserve object identity', () => {
    const registry = new PreparedViewRegistry();
    const view = assemblePreparedView({ preparedViewId: PET_PREPARED, state: mockPetView, provenance: mockPetViewProvenance });
    assert.equal(registry.has(PET_PREPARED), false);
    assert.equal(registry.register(view), view);
    assert.equal(registry.has(PET_PREPARED), true);
    assert.equal(registry.get(PET_PREPARED), view);
    assert.equal(registry.list()[0], view);
    assert.equal(registry.snapshot()[0], view);
    assert.equal(registry.list().length, 1);
  });

  it('4. workspace accepts a prepared view once its provenance assets and study are registered', () => {
    const workspace = new ImagingWorkspace();
    workspace.registerStudy(mockStudyReference);
    workspace.registerAsset(mockCtAsset);
    workspace.registerAsset(mockPetAsset);

    // `mockViewProvenance` names the CT and PET assets; a fusion state binds
    // exactly those two ids, so the provenance/state pair is coherent.
    const view = assemblePreparedView({ preparedViewId: FUSION_PREPARED, state: mockFusionView, provenance: mockViewProvenance });
    assert.deepEqual([...boundAssetIds(mockFusionView)], [mockCtAsset.id, mockPetAsset.id]);
    assert.equal(workspace.registerPreparedView(view), view);
    assert.equal(workspace.getPreparedView(FUSION_PREPARED), view);
    assert.equal(workspace.listPreparedViews()[0], view);

    const snapshot = workspace.snapshot();
    assert.equal(snapshot.preparedViews.length, 1);
    assert.equal(snapshot.preparedViews[0], view);
    assert.deepEqual(snapshot.preparedViews, [view]);
  });

  it('5. a fusion view assembles when every bound asset id is declared in provenance', () => {
    assert.deepEqual([...boundAssetIds(mockFusionView)], [mockCtAsset.id, mockPetAsset.id]);
    const view = assemblePreparedView({ preparedViewId: FUSION_PREPARED, state: mockFusionView, provenance: mockFusionViewProvenance });
    assert.equal(view.sourceViewId, mockFusionView.id);
    assert.equal(view.state, mockFusionView);
    assert.equal(view.provenance, mockFusionViewProvenance);
  });

  it('6. the assembled view is JSON-serializable while state identity is preserved', () => {
    const view = assemblePreparedView({ preparedViewId: PET_PREPARED, state: mockPetView, provenance: mockPetViewProvenance, links: [mockIntraStudyLink], locks: [mockViewLock] });
    const clone = JSON.parse(JSON.stringify(view)) as Record<string, unknown>;
    assert.equal(clone.id, view.id);
    assert.equal(clone.sourceViewId, view.sourceViewId);
    assert.deepEqual(clone.links, view.links);
    assert.deepEqual(clone.locks, view.locks);
    assert.deepEqual(clone.provenance, view.provenance);
    assert.equal('cachedPreviewReference' in clone, false);
    // Deliberately no deep-compare of `state`: identity, not value equality, is the contract.
    assert.equal(view.state, mockPetView);
  });

  it('7. missing provenance fails closed', () => {
    expectPreparedViewError(
      () => assemblePreparedView({ preparedViewId: PET_PREPARED, state: mockPetView, provenance: undefined }),
      'PREPARED_VIEW_MISSING_PROVENANCE',
    );
  });

  it('8. empty provenance fails closed', () => {
    const noAssets: ViewProvenance = { ...mockPetViewProvenance, sourceAssetIds: [] };
    expectPreparedViewError(
      () => assemblePreparedView({ preparedViewId: PET_PREPARED, state: mockPetView, provenance: noAssets }),
      'PREPARED_VIEW_EMPTY_PROVENANCE',
    );
    const noFingerprints: ViewProvenance = { ...mockPetViewProvenance, sourceFingerprints: [] };
    expectPreparedViewError(
      () => assemblePreparedView({ preparedViewId: PET_PREPARED, state: mockPetView, provenance: noFingerprints }),
      'PREPARED_VIEW_EMPTY_PROVENANCE',
    );
  });

  it('9. a bound asset absent from provenance fails closed and names the asset', () => {
    const provenanceWithoutPet: ViewProvenance = { ...mockViewProvenance, sourceAssetIds: [mockCtAsset.id] };
    assert.throws(
      () => assemblePreparedView({ preparedViewId: FUSION_PREPARED, state: mockFusionView, provenance: provenanceWithoutPet }),
      (error: unknown) => {
        assert.ok(error instanceof PreparedViewError);
        assert.equal(error.code, 'PREPARED_VIEW_BINDING_NOT_IN_PROVENANCE');
        assert.ok(error.message.includes(mockPetAsset.id), 'message must name the missing asset id');
        assert.ok(error.message.includes(FUSION_PREPARED), 'message must name the prepared view id');
        return true;
      },
    );
  });

  it('10. duplicate locks for the same state and owner fail closed', () => {
    const duplicateLocks: StateLock[] = [mockViewLock, { ...mockViewLock }];
    expectPreparedViewError(
      () => assemblePreparedView({ preparedViewId: PET_PREPARED, state: mockPetView, provenance: mockPetViewProvenance, locks: duplicateLocks }),
      'PREPARED_VIEW_DUPLICATE_LOCK',
    );

    // A distinct owner on the same state is not a duplicate.
    const mixedLocks: StateLock[] = [mockViewLock, { state: 'camera', owner: 'system', locked: true }];
    const view = assemblePreparedView({ preparedViewId: PET_PREPARED, state: mockPetView, provenance: mockPetViewProvenance, locks: mixedLocks });
    assert.equal(view.locks.length, 2);
  });

  it('11. registry refuses a duplicate id and an unknown lookup', () => {
    const registry = new PreparedViewRegistry();
    const view = assemblePreparedView({ preparedViewId: PET_PREPARED, state: mockPetView, provenance: mockPetViewProvenance });
    registry.register(view);
    expectPreparedViewError(() => registry.register(view), 'PREPARED_VIEW_DUPLICATE_ID');
    expectPreparedViewError(() => registry.get(UNKNOWN_PREPARED), 'PREPARED_VIEW_UNKNOWN_ID');
    assert.equal(registry.list().length, 1, 'a refused registration must not mutate the registry');
  });

  it('12. workspace refuses provenance naming an unregistered asset without mutating state', () => {
    const workspace = oneCtWorkspace();
    const view = assemblePreparedView({ preparedViewId: PET_PREPARED, state: mockPetView, provenance: mockPetViewProvenance });
    assert.throws(
      () => workspace.registerPreparedView(view),
      (error: unknown) => {
        assert.ok(error instanceof WorkspaceError);
        assert.equal(error.code, 'WORKSPACE_UNKNOWN_ASSET');
        assert.ok(error.message.includes(mockPetAsset.id), 'message must name the unregistered asset id');
        return true;
      },
    );
    assert.equal(workspace.listPreparedViews().length, 0);
    assert.equal(workspace.snapshot().preparedViews.length, 0);
    assert.deepEqual(workspace.listAssets(), [mockCtAsset]);
    assert.equal(view.state, mockPetView, 'a refused registration must not mutate the view');
  });

  it('13. fixture seam: mockMedicalView binds a literal id absent from mockViewProvenance', () => {
    assert.deepEqual([...boundAssetIds(mockMedicalView)], ['asset-ct']);
    expectPreparedViewError(
      () => assemblePreparedView({ preparedViewId: PET_PREPARED, state: mockMedicalView, provenance: mockViewProvenance }),
      'PREPARED_VIEW_BINDING_NOT_IN_PROVENANCE',
    );
  });

  it('14. validation order is pinned: provenance checks run before the lock check', () => {
    const provenanceWithoutPet: ViewProvenance = { ...mockViewProvenance, sourceAssetIds: [mockCtAsset.id] };
    const duplicateLocks: StateLock[] = [mockViewLock, { ...mockViewLock }];
    // Both a binding mismatch and duplicate locks are present; the provenance
    // binding check must win, so nothing can silently reorder the guards.
    expectPreparedViewError(
      () =>
        assemblePreparedView({
          preparedViewId: FUSION_PREPARED,
          state: mockFusionView,
          provenance: provenanceWithoutPet,
          locks: duplicateLocks,
        }),
      'PREPARED_VIEW_BINDING_NOT_IN_PROVENANCE',
    );
  });
});
