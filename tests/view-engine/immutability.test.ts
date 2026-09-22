/**
 * NuClear C4 (P4.2.1) — published-DTO immutability tests (ADR-011 §1/§2/§4).
 *
 * Pure Node: no DOM, WebGL or Cornerstone. Proves every value published by a
 * `view-engine` API is deep-frozen, that mutating a value obtained from an API
 * throws under ESM strict mode and never alters canonical state, that the
 * `PreparedView.state`/`provenance` object identity survives assembly, and that
 * freezing is idempotent and preserves the JSON value shape. The private
 * shared-state holder with atomic replacement (ADR-011 §3) is P4.3 and is
 * deliberately not exercised here.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  MedicalViewState,
  PreparedView,
  PreparedViewId,
  PreviewId,
  ViewProvenance,
} from '../../packages/shared-types/src/index.js';
import {
  mockIntraStudyLink,
  mockPetView,
  mockPetViewProvenance,
  mockViewLock,
} from '../fixtures/view-contracts.fixture.ts';
import {
  ImagingWorkspace,
  mockCtAsset,
  mockPetAsset,
  mockStudyReference,
} from './fixtures/workspace-fixtures.ts';

// `workspace-fixtures` registers the `.js`→`.ts` resolve hook as a static
// dependency, so the real product sources below import by value.
const preparedViewModule = await import('../../packages/view-engine/src/prepared-view/index.ts');
const workspaceModule = await import('../../packages/view-engine/src/workspace/index.ts');
const { deepFreeze } = await import('../../packages/view-engine/src/internal/deep-freeze.ts');

const { assemblePreparedView, PreparedViewRegistry } = preparedViewModule;
const { ViewSlotRegistry } = workspaceModule;

type Workspace = InstanceType<typeof ImagingWorkspace>;

const PET_PREPARED = 'prepared-view-immutable-pet' as PreparedViewId;

/**
 * Fresh, mutable copies of the shared view fixtures: each test owns its input
 * so a freeze caused by assembly/registration is observable on that input
 * (the shared fixture itself may already have been frozen by a prior test).
 */
function freshPetView(): MedicalViewState {
  return structuredClone(mockPetView);
}

function freshPetProvenance(): ViewProvenance {
  return structuredClone(mockPetViewProvenance);
}

function workspaceWithBothAssets(): Workspace {
  const workspace = new ImagingWorkspace();
  workspace.registerStudy(mockStudyReference);
  workspace.registerAsset(mockCtAsset);
  workspace.registerAsset(mockPetAsset);
  return workspace;
}

describe('NuClear C4 — published-DTO immutability (ADR-011)', () => {
  it('1. assembly deep-freezes the view, its state, provenance, links and locks', () => {
    const view = assemblePreparedView({
      preparedViewId: PET_PREPARED,
      state: freshPetView(),
      provenance: freshPetProvenance(),
      links: [mockIntraStudyLink],
      locks: [mockViewLock],
      cachedPreviewReference: {
        previewId: 'preview-immutable' as PreviewId,
        renderStateHash: 'sha256:immutable',
        sourceFingerprintSet: [mockPetAsset.sourceFingerprint],
        pixelDimensions: [512, 512],
        colorProfile: 'sRGB',
        generatedAt: '2026-09-22T00:00:00Z',
        rendererMetadata: { rendererName: 'nuclear', rendererVersion: '0.0.0' },
      },
    });

    assert.ok(Object.isFrozen(view), 'the PreparedView container must be frozen');
    assert.ok(Object.isFrozen(view.state), 'the referenced state must be frozen');
    assert.ok(Object.isFrozen(view.state.camera), 'nested camera state must be frozen');
    assert.ok(Object.isFrozen(view.state.camera.panMm), 'nested camera arrays must be frozen');
    assert.ok(Object.isFrozen(view.provenance), 'provenance must be frozen');
    assert.ok(
      Object.isFrozen(view.provenance.sourceAssetIds),
      'nested provenance arrays must be frozen',
    );
    assert.ok(Object.isFrozen(view.provenance.sourceFingerprints[0]), 'nested fingerprints must be frozen');
    assert.ok(Object.isFrozen(view.links), 'the links array must be frozen');
    assert.ok(Object.isFrozen(view.links[0]), 'each link must be frozen');
    assert.ok(Object.isFrozen(view.locks), 'the locks array must be frozen');
    assert.ok(Object.isFrozen(view.locks[0]), 'each lock must be frozen');
    assert.ok(Object.isFrozen(view.cachedPreviewReference), 'cachedPreviewReference must be frozen');
    assert.ok(
      Object.isFrozen(view.cachedPreviewReference?.sourceFingerprintSet),
      'nested cached-preview arrays must be frozen',
    );
  });

  it('2. workspace and slot-registry publish frozen studies, assets, slots and snapshots', () => {
    const workspace = workspaceWithBothAssets();

    const study = workspace.getStudy(mockStudyReference.id);
    const asset = workspace.getAsset(mockCtAsset.id);
    assert.ok(Object.isFrozen(study), 'getStudy must publish a frozen value');
    assert.ok(Object.isFrozen(study.patient), 'nested study objects must be frozen');
    assert.ok(Object.isFrozen(asset), 'getAsset must publish a frozen value');
    assert.ok(Object.isFrozen(asset.metadata), 'nested asset metadata must be frozen');
    assert.ok(Object.isFrozen(asset.geometry.origin), 'nested asset arrays must be frozen');
    assert.ok(Object.isFrozen(workspace.listStudies()), 'listStudies must publish a frozen array');
    assert.ok(Object.isFrozen(workspace.listAssets()), 'listAssets must publish a frozen array');

    const view = assemblePreparedView({
      preparedViewId: PET_PREPARED,
      state: freshPetView(),
      provenance: freshPetProvenance(),
    });
    workspace.registerPreparedView(view);
    const slotId = workspace.slots.listSlots()[0].id;
    const bound = workspace.bindSlotToPreparedView(slotId, view.id);
    assert.ok(Object.isFrozen(bound), 'bind must publish a frozen slot');
    assert.ok(Object.isFrozen(workspace.slots.getSlot(slotId)), 'getSlot must publish a frozen slot');

    const groupId = workspace.slots.listGroups()[0].id;
    assert.ok(Object.isFrozen(workspace.slots.getGroup(groupId)), 'getGroup must publish a frozen group');

    const snapshot = workspace.snapshot();
    assert.ok(Object.isFrozen(snapshot), 'the snapshot container must be frozen');
    assert.ok(Object.isFrozen(snapshot.studies), 'snapshot.studies must be frozen');
    assert.ok(Object.isFrozen(snapshot.studies[0]), 'snapshot study members must be frozen');
    assert.ok(Object.isFrozen(snapshot.assets), 'snapshot.assets must be frozen');
    assert.ok(Object.isFrozen(snapshot.assets[0]), 'snapshot asset members must be frozen');
    assert.ok(Object.isFrozen(snapshot.groups), 'snapshot.groups must be frozen');
    assert.ok(Object.isFrozen(snapshot.groups[0]), 'snapshot group members must be frozen');
    assert.ok(Object.isFrozen(snapshot.groups[0].slotIds), 'nested slot-id tuples must be frozen');
    assert.ok(Object.isFrozen(snapshot.slots), 'snapshot.slots must be frozen');
    assert.ok(Object.isFrozen(snapshot.slots[0]), 'snapshot slot members must be frozen');
    assert.ok(Object.isFrozen(snapshot.preparedViews), 'snapshot.preparedViews must be frozen');
    assert.ok(Object.isFrozen(snapshot.preparedViews[0]), 'snapshot prepared views must be frozen');
    assert.equal(snapshot.preparedViews[0], view, 'prepared views stay published by identity');
  });

  it('3. post-registration mutation of the caller object throws and cannot alter canonical state', () => {
    const workspace = workspaceWithBothAssets();
    const state = freshPetView();
    const provenance = freshPetProvenance();
    const view = assemblePreparedView({ preparedViewId: PET_PREPARED, state, provenance });
    workspace.registerPreparedView(view);

    assert.equal(view.state, state, 'state identity must survive assembly');
    assert.equal(view.provenance, provenance, 'provenance identity must survive assembly');
    assert.ok(Object.isFrozen(state), 'assembly must freeze the caller state in place');
    assert.ok(Object.isFrozen(provenance), 'assembly must freeze the caller provenance in place');

    assert.throws(
      () => {
        (provenance as { sourceAssetIds: unknown }).sourceAssetIds = [];
      },
      TypeError,
      'mutating the original provenance must throw in strict mode',
    );
    assert.throws(
      () => {
        (state.camera as { zoom: number }).zoom = 77;
      },
      TypeError,
      'mutating the original nested camera state must throw in strict mode',
    );

    const registered = workspace.getPreparedView(PET_PREPARED);
    assert.equal(registered, view, 'getPreparedView must return the registered identity');
    assert.deepEqual(
      registered.provenance.sourceAssetIds,
      mockPetViewProvenance.sourceAssetIds,
      'the validated provenance must still read back unchanged',
    );
    assert.equal(
      registered.state.camera.zoom,
      mockPetView.camera.zoom,
      'the validated camera state must still read back unchanged',
    );
  });

  it('4. deepFreeze is idempotent, cycle-safe and preserves the JSON value shape', () => {
    const original = { a: [1, { b: 'x' }], c: { d: [true, null] } };
    const frozen = deepFreeze(original);
    const frozenTwice = deepFreeze(deepFreeze(frozen));

    assert.equal(frozenTwice, frozen, 're-freezing must return the same reference');
    assert.ok(Object.isFrozen(frozen));
    assert.ok(Object.isFrozen(frozen.a));
    assert.ok(Object.isFrozen(frozen.a[1]));
    assert.ok(Object.isFrozen(frozen.c));
    assert.ok(Object.isFrozen(frozen.c.d));
    assert.deepEqual(JSON.parse(JSON.stringify(frozen)), frozen, 'freezing must not change the value');

    // A shared (diamond) reference is frozen once and identity is preserved.
    const shared = deepFreeze({ voxel: 7 });
    const graph = deepFreeze({ first: shared, second: shared });
    assert.equal(graph.first, graph.second, 'shared identity must be preserved');
    assert.ok(Object.isFrozen(graph.first));

    const registry = ViewSlotRegistry.createDefault();
    assert.ok(Object.isFrozen(deepFreeze(registry.getSlot(registry.listSlots()[0].id))));

    const workspace = workspaceWithBothAssets();
    const view = assemblePreparedView({
      preparedViewId: PET_PREPARED,
      state: freshPetView(),
      provenance: freshPetProvenance(),
    });
    workspace.registerPreparedView(view);
    workspace.bindSlotToPreparedView(workspace.slots.listSlots()[0].id, view.id);
    const snapshot = workspace.snapshot();
    assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  });

  it('5. the registry deep-freezes a hand-built PreparedView defensively', () => {
    const registry = new PreparedViewRegistry();
    const handBuilt: PreparedView = {
      id: PET_PREPARED,
      sourceViewId: mockPetView.id,
      state: freshPetView(),
      links: [],
      locks: [],
      provenance: freshPetProvenance(),
    };
    assert.equal(Object.isFrozen(handBuilt), false, 'the hand-built view starts mutable');

    const registered = registry.register(handBuilt);
    assert.equal(registered, handBuilt, 'registration must preserve object identity');
    assert.ok(Object.isFrozen(handBuilt), 'registration must freeze the stored view');
    assert.ok(Object.isFrozen(handBuilt.state), 'registration must freeze the referenced state');
    assert.ok(Object.isFrozen(handBuilt.provenance), 'registration must freeze the provenance');
    assert.throws(
      () => {
        (handBuilt.state.camera as { zoom: number }).zoom = 5;
      },
      TypeError,
      'mutating a defensively frozen hand-built view must throw',
    );
    assert.equal(
      registry.get(PET_PREPARED).state.camera.zoom,
      mockPetView.camera.zoom,
      'the registered view must still read back unchanged',
    );
  });
});
