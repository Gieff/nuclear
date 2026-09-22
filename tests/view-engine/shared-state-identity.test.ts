/**
 * NuClear P4.3 — shared-state identity suite (ADR-011 §3 + binding addendum).
 *
 * Pure Node: no DOM, WebGL or Cornerstone. Tests `a`–`e` prove the identity
 * half of the `private holder → atomic replacement → new projection → frozen
 * published DTO` contract: creation/frozen pair, shared identity, replace
 * regeneration, `ViewSlot` stability and per-view metadata preservation.
 * Shared builders and product seams come from `./fixtures/shared-state-fixtures.ts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CachedPreviewReference, PreviewId, SingleMedicalViewState } from '../../packages/shared-types/src/index.js';
import { mockIntraStudyLink, mockPetView, mockPetViewProvenance } from '../fixtures/view-contracts.fixture.ts';
import { mockPetAsset } from './fixtures/workspace-fixtures.ts';
import { FUSION_PREPARED, GROUP_A, PET_PREPARED, PreparedViewRegistry, SharedStateGroupRegistry, assemblePreparedView, freshPair, registerFusionView, registerPetView, workspaceWithBothAssets } from './fixtures/shared-state-fixtures.ts';

describe('NuClear P4.3 — shared-state identity (ADR-011 §3 + addendum)', () => {
  it('a. createGroup stores a frozen, read-only spatial/camera pair', () => {
    const registry = new SharedStateGroupRegistry(new PreparedViewRegistry());
    const pair = freshPair();
    const group = registry.createGroup({ id: GROUP_A, spatial: pair.spatial, camera: pair.camera });

    assert.equal(group.id, GROUP_A);
    assert.equal(registry.hasGroup(GROUP_A), true);
    assert.equal(registry.getGroup(GROUP_A), group);
    // Freeze-in-place preserves the caller's frozen references (no clone).
    assert.equal(group.spatial, pair.spatial);
    assert.equal(group.camera, pair.camera);
    assert.ok(Object.isFrozen(group.spatial), 'the shared spatial state must be frozen');
    assert.ok(Object.isFrozen(group.camera), 'the shared camera state must be frozen');
    assert.ok(Object.isFrozen(group.spatial.orientation), 'nested arrays must be frozen');
    assert.ok(Object.isFrozen(group.camera.panMm), 'nested camera arrays must be frozen');

    const originalOffset = group.spatial.sliceOffsetMm;
    assert.throws(
      () => {
        (group.spatial as { sliceOffsetMm: number }).sliceOffsetMm = 42;
      },
      TypeError,
      'mutating shared spatial state must throw in strict mode',
    );
    assert.throws(
      () => {
        (group.camera as { zoom: number }).zoom = 9;
      },
      TypeError,
      'mutating shared camera state must throw in strict mode',
    );
    assert.equal(group.spatial.sliceOffsetMm, originalOffset, 'a refused mutation must not change state');
  });
  it('b. two attached views share the holder pair by exact object identity', () => {
    const workspace = workspaceWithBothAssets();
    const pair = freshPair();
    const group = workspace.sharedStateGroups.createGroup({
      id: GROUP_A,
      spatial: pair.spatial,
      camera: pair.camera,
    });
    registerPetView(workspace);
    registerFusionView(workspace);

    const pet = workspace.sharedStateGroups.attach(GROUP_A, PET_PREPARED);
    const fusion = workspace.sharedStateGroups.attach(GROUP_A, FUSION_PREPARED);

    assert.equal(pet.state.spatial, group.spatial);
    assert.equal(fusion.state.spatial, group.spatial);
    assert.equal(pet.state.camera, group.camera);
    assert.equal(fusion.state.camera, group.camera);
    assert.equal(pet.state.spatial, fusion.state.spatial, 'all attached views observe one shared pair');
    assert.equal(pet.state.camera, fusion.state.camera);
    assert.equal(
      workspace.getPreparedView(PET_PREPARED),
      pet,
      'attach publishes the projected view as the registry entry',
    );
    assert.deepEqual(
      [...workspace.sharedStateGroups.listMembers(GROUP_A)],
      [PET_PREPARED, FUSION_PREPARED],
    );
  });
  it('c. replace keeps holder/id identity, regenerates projections, keeps old projections frozen', () => {
    const workspace = workspaceWithBothAssets();
    const group = workspace.sharedStateGroups.createGroup({
      id: GROUP_A,
      spatial: freshPair().spatial,
      camera: freshPair().camera,
    });
    registerPetView(workspace);
    registerFusionView(workspace);
    workspace.sharedStateGroups.attach(GROUP_A, PET_PREPARED);
    workspace.sharedStateGroups.attach(GROUP_A, FUSION_PREPARED);

    const beforePet = workspace.getPreparedView(PET_PREPARED);
    const beforeFusion = workspace.getPreparedView(FUSION_PREPARED);
    const oldSpatial = group.spatial;
    const oldCamera = group.camera;

    const nextPair = freshPair();
    (nextPair.spatial as { sliceOffsetMm: number }).sliceOffsetMm = 12.5;
    (nextPair.camera as { zoom: number }).zoom = 2.5;
    assert.notEqual(nextPair.camera.zoom, oldCamera.zoom, 'the replacement must be observable');

    const replaced = workspace.sharedStateGroups.replace(GROUP_A, nextPair);
    assert.equal(replaced.length, 2);

    // Stable identity: the holder object and every PreparedViewId survive.
    assert.equal(workspace.sharedStateGroups.getGroup(GROUP_A), group, 'holder identity is unchanged');
    assert.equal(workspace.getPreparedView(PET_PREPARED).id, PET_PREPARED);
    assert.equal(workspace.getPreparedView(FUSION_PREPARED).id, FUSION_PREPARED);
    assert.deepEqual(
      [...workspace.sharedStateGroups.listMembers(GROUP_A)],
      [PET_PREPARED, FUSION_PREPARED],
    );

    // The holder now commits the new frozen pair.
    assert.equal(group.spatial, nextPair.spatial);
    assert.equal(group.camera, nextPair.camera);
    assert.ok(Object.isFrozen(nextPair.spatial));
    assert.ok(Object.isFrozen(nextPair.camera));

    // Regenerated: new frozen projections referencing the new pair exactly.
    const afterPet = workspace.getPreparedView(PET_PREPARED);
    const afterFusion = workspace.getPreparedView(FUSION_PREPARED);
    assert.notEqual(afterPet, beforePet, 'the registered projection object is regenerated');
    assert.notEqual(afterFusion, beforeFusion, 'the registered projection object is regenerated');
    assert.equal(afterPet.state.spatial, nextPair.spatial);
    assert.equal(afterFusion.state.spatial, nextPair.spatial);
    assert.equal(afterPet.state.camera, nextPair.camera);
    assert.equal(afterFusion.state.camera, nextPair.camera);
    assert.ok(Object.isFrozen(afterPet.state), 'the regenerated state container is frozen');
    assert.ok(Object.isFrozen(afterPet));

    // The old projections still hold (and keep frozen) the old pair.
    assert.equal(beforePet.state.spatial, oldSpatial);
    assert.equal(beforePet.state.camera, oldCamera);
    assert.equal(beforeFusion.state.spatial, oldSpatial);
    assert.equal(beforeFusion.state.camera, oldCamera);
    assert.ok(Object.isFrozen(beforePet.state.spatial));
    assert.equal(beforePet.state.camera.zoom, oldCamera.zoom, 'the old projection is unchanged');
  });
  it('d. ViewSlot identity and content are stable across replace', () => {
    const workspace = workspaceWithBothAssets();
    workspace.sharedStateGroups.createGroup({
      id: GROUP_A,
      spatial: freshPair().spatial,
      camera: freshPair().camera,
    });
    registerPetView(workspace);
    const slotId = workspace.slots.listSlots()[0].id;
    workspace.bindSlotToPreparedView(slotId, PET_PREPARED);
    workspace.sharedStateGroups.attach(GROUP_A, PET_PREPARED);
    const slotBefore = workspace.slots.getSlot(slotId);

    workspace.sharedStateGroups.replace(GROUP_A, freshPair());

    const slotAfter = workspace.slots.getSlot(slotId);
    assert.equal(slotAfter, slotBefore, 'the slot object identity is unchanged');
    assert.deepEqual(slotAfter, slotBefore);
    assert.equal(slotAfter.preparedViewId, PET_PREPARED);
    assert.equal(slotAfter.status, 'bound');
  });
  it('e. per-view metadata is preserved by identity/value across replace', () => {
    const workspace = workspaceWithBothAssets();
    const cachedPreviewReference: CachedPreviewReference = {
      previewId: 'preview-shared' as PreviewId,
      renderStateHash: 'sha256:shared',
      sourceFingerprintSet: [structuredClone(mockPetAsset.sourceFingerprint)],
      pixelDimensions: [256, 256],
      colorProfile: 'sRGB',
      generatedAt: '2026-09-22T00:00:00Z',
      rendererMetadata: { rendererName: 'nuclear', rendererVersion: '0.0.0' },
    };
    const view = assemblePreparedView({
      preparedViewId: PET_PREPARED,
      state: structuredClone(mockPetView),
      provenance: structuredClone(mockPetViewProvenance),
      links: [mockIntraStudyLink],
      // P4.5: a view locking the shared pair (spatial/camera) is refused by
      // `attach`. This case isolates metadata preservation, so it uses a lock on
      // a non-shared state; the shared-pair refusal is covered by locks.test.ts.
      locks: [{ state: 'presentation', owner: 'user', locked: true }],
      cachedPreviewReference,
    });
    workspace.registerPreparedView(view);
    workspace.sharedStateGroups.createGroup({
      id: GROUP_A,
      spatial: freshPair().spatial,
      camera: freshPair().camera,
    });
    workspace.sharedStateGroups.attach(GROUP_A, PET_PREPARED);

    const before = workspace.getPreparedView(PET_PREPARED);
    workspace.sharedStateGroups.replace(GROUP_A, freshPair());
    const after = workspace.getPreparedView(PET_PREPARED);

    // The PET view is single-layer; narrow the union to read `presentation`.
    const beforeSingle = before.state as SingleMedicalViewState;
    const afterSingle = after.state as SingleMedicalViewState;
    assert.equal(after.sourceViewId, before.sourceViewId);
    assert.equal(after.state.id, before.state.id);
    assert.equal(after.state.dataBinding, before.state.dataBinding);
    assert.equal(after.state.projection, before.state.projection);
    assert.equal(after.state.coordinateTransforms, before.state.coordinateTransforms);
    assert.equal(
      afterSingle.presentation,
      beforeSingle.presentation,
      'non-shared presentation identity is preserved',
    );
    assert.equal(after.state.composition, before.state.composition);
    assert.equal(after.provenance, before.provenance);
    assert.deepEqual([...after.links], [...before.links]);
    assert.equal(after.links[0].kind, 'co-referenced');
    assert.equal(after.locks.length, 1);
    assert.equal(after.locks[0].state, 'presentation');
    assert.equal(after.locks[0].locked, true);
    assert.equal(after.cachedPreviewReference, before.cachedPreviewReference);
    assert.equal(after.cachedPreviewReference?.previewId, 'preview-shared');
  });
});
