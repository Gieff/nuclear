/**
 * NuClear P4.1 — pure `ImagingWorkspace` core tests.
 *
 * Runs entirely in Node with no DOM, WebGL or Cornerstone. Covers the logical
 * capacity (four groups / sixteen slots), role and group invariants, the
 * explicit bind/unbind/status transitions, study/asset registration and the
 * fail-closed negative cases required by the P4.1 slice.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  AssetId,
  ImagingAsset,
  PreparedViewId,
  StudyId,
  StudyInstanceUID,
  ViewGroup,
  ViewGroupId,
  ViewSlot,
  ViewSlotId,
} from '../../packages/shared-types/src/index.js';
import {
  ImagingWorkspace,
  MAX_VIEW_GROUPS,
  MAX_VIEW_SLOTS,
  VIEW_SLOT_ROLES,
  ViewSlotRegistry,
  WorkspaceError,
  asLayout,
  createDefaultViewSlotLayout,
  expectWorkspaceError,
  makeDemand,
  mockCtAsset,
  mockPetAsset,
  mockStudyReference,
  mutableDefaultLayout,
} from './fixtures/workspace-fixtures.ts';

const CT_PREPARED_VIEW = 'prepared-view-ct' as PreparedViewId;
const PET_PREPARED_VIEW = 'prepared-view-pet' as PreparedViewId;

describe('NuClear P4.1 — ImagingWorkspace core', () => {
  it('1. default registry allocates four groups and sixteen slots in role order', () => {
    const layout = createDefaultViewSlotLayout();
    assert.equal(layout.groups.length, MAX_VIEW_GROUPS);
    assert.equal(layout.slots.length, MAX_VIEW_SLOTS);

    const registry = ViewSlotRegistry.fromLayout(layout);
    assert.deepEqual(registry.snapshot(), createDefaultViewSlotLayout());

    const groups = registry.listGroups();
    const slots = registry.listSlots();
    assert.equal(groups.length, MAX_VIEW_GROUPS);
    assert.equal(slots.length, MAX_VIEW_SLOTS);
    for (const group of groups) {
      const members = slots.filter((slot) => slot.groupId === group.id);
      assert.equal(members.length, VIEW_SLOT_ROLES.length);
      assert.deepEqual(group.slotIds, members.map((slot) => slot.id));
      assert.deepEqual(
        members.map((slot) => slot.role),
        [...VIEW_SLOT_ROLES],
      );
      for (const slot of members) {
        assert.equal(slot.status, 'empty');
      }
    }
  });

  it('2. registers a study and its CT asset; snapshot round-trips through JSON', () => {
    const workspace = new ImagingWorkspace();
    workspace.registerStudy(mockStudyReference);
    workspace.registerAsset(mockCtAsset);

    assert.deepEqual(workspace.getStudy(mockStudyReference.id), mockStudyReference);
    assert.deepEqual(workspace.getAsset(mockCtAsset.id), mockCtAsset);
    assert.deepEqual(workspace.listStudies(), [mockStudyReference]);
    assert.deepEqual(workspace.listAssets(), [mockCtAsset]);

    const snapshot = workspace.snapshot();
    assert.deepEqual(snapshot, JSON.parse(JSON.stringify(snapshot)));
    assert.equal(snapshot.groups.length, MAX_VIEW_GROUPS);
    assert.equal(snapshot.slots.length, MAX_VIEW_SLOTS);

    workspace.registerAsset(mockPetAsset);
    assert.deepEqual(workspace.listAssets(), [mockCtAsset, mockPetAsset]);
  });

  it('3. bind -> prepared -> unavailable -> unbind follows explicit transitions', () => {
    const registry = ViewSlotRegistry.createDefault();
    const slotId = registry.listSlots()[0].id;

    const bound = registry.bind(slotId, CT_PREPARED_VIEW);
    assert.equal(bound.status, 'bound');
    assert.equal(bound.preparedViewId, CT_PREPARED_VIEW);

    const prepared = registry.markPrepared(slotId);
    assert.equal(prepared.status, 'prepared');
    assert.equal(registry.getSlot(slotId).status, 'prepared');

    const unavailable = registry.markUnavailable(slotId);
    assert.equal(unavailable.status, 'unavailable');
    assert.equal(unavailable.preparedViewId, CT_PREPARED_VIEW);

    const rebound = registry.bind(slotId, PET_PREPARED_VIEW);
    assert.equal(rebound.status, 'bound');
    assert.equal(rebound.preparedViewId, PET_PREPARED_VIEW);
    registry.markPrepared(slotId);
    registry.markUnavailable(slotId);

    const empty = registry.unbind(slotId);
    assert.equal(empty.status, 'empty');
    assert.equal(empty.preparedViewId, undefined);
    assert.equal(empty.resourceDemand, undefined);
    assert.equal(registry.getSlot(slotId).status, 'empty');
  });

  it('4. setDemand on a bound slot is visible and cleared by unbind', () => {
    const registry = ViewSlotRegistry.createDefault();
    const slotId = registry.listSlots()[0].id;
    registry.bind(slotId, CT_PREPARED_VIEW);

    const demand = makeDemand(mockCtAsset.id);
    const withDemand = registry.setDemand(slotId, demand);
    assert.deepEqual(withDemand.resourceDemand, demand);
    assert.deepEqual(registry.getSlot(slotId).resourceDemand, demand);

    const cleared = registry.unbind(slotId);
    assert.equal(cleared.resourceDemand, undefined);
    assert.equal(registry.getSlot(slotId).resourceDemand, undefined);
  });

  it('4b. rebinding a slot clears demand declared for the previous view', () => {
    const registry = ViewSlotRegistry.createDefault();
    const slotId = registry.listSlots()[0].id;

    registry.bind(slotId, CT_PREPARED_VIEW);
    registry.setDemand(slotId, makeDemand(mockCtAsset.id));
    assert.equal(registry.getSlot(slotId).resourceDemand?.assetId, mockCtAsset.id);

    registry.markUnavailable(slotId);
    const rebound = registry.bind(slotId, PET_PREPARED_VIEW);
    assert.equal(rebound.preparedViewId, PET_PREPARED_VIEW);
    assert.equal(rebound.resourceDemand, undefined, 'stale demand must not survive a rebind');
  });

  it('5. returned slots and lists are fresh copies that never mutate the registry', () => {
    const registry = ViewSlotRegistry.createDefault();
    const slotId = registry.listSlots()[0].id;

    const first = registry.getSlot(slotId);
    (first as unknown as { status: string }).status = 'prepared';
    assert.equal(registry.getSlot(slotId).status, 'empty');

    const list = registry.listSlots() as ViewSlot[];
    assert.equal(list.length, MAX_VIEW_SLOTS);
    (list[0] as unknown as { status: string }).status = 'bound';
    list.pop();
    assert.equal(registry.listSlots().length, MAX_VIEW_SLOTS);
    assert.equal(registry.getSlot(list[0].id).status, 'empty');

    const groups = registry.listGroups() as ViewGroup[];
    groups.pop();
    assert.equal(registry.listGroups().length, MAX_VIEW_GROUPS);
  });

  it('6. duplicate study, duplicate asset and asset without a study fail closed', () => {
    const workspace = new ImagingWorkspace();
    workspace.registerStudy(mockStudyReference);
    workspace.registerAsset(mockCtAsset);

    expectWorkspaceError(
      () => workspace.registerStudy(mockStudyReference),
      'WORKSPACE_DUPLICATE_STUDY',
    );
    expectWorkspaceError(() => workspace.registerAsset(mockCtAsset), 'WORKSPACE_DUPLICATE_ASSET');

    const foreignAsset: ImagingAsset = {
      ...mockPetAsset,
      id: 'asset-pet-foreign' as AssetId,
      studyInstanceUID: '1.2.840.10008.1.1.20990101.999' as StudyInstanceUID,
    };
    expectWorkspaceError(() => workspace.registerAsset(foreignAsset), 'WORKSPACE_UNKNOWN_STUDY');
    expectWorkspaceError(() => workspace.getStudy('study-missing' as StudyId), 'WORKSPACE_UNKNOWN_STUDY');
    expectWorkspaceError(() => workspace.getAsset('asset-missing' as AssetId), 'WORKSPACE_UNKNOWN_ASSET');
    assert.equal(workspace.listAssets().length, 1, 'a refused registration must not mutate state');
  });

  it('7. illegal slot transitions fail closed and leave status unchanged', () => {
    const registry = ViewSlotRegistry.createDefault();
    const slotId = registry.listSlots()[0].id;

    expectWorkspaceError(() => registry.markPrepared(slotId), 'WORKSPACE_ILLEGAL_SLOT_TRANSITION');
    expectWorkspaceError(() => registry.markUnavailable(slotId), 'WORKSPACE_ILLEGAL_SLOT_TRANSITION');
    expectWorkspaceError(() => registry.unbind(slotId), 'WORKSPACE_ILLEGAL_SLOT_TRANSITION');

    registry.bind(slotId, CT_PREPARED_VIEW);
    expectWorkspaceError(() => registry.bind(slotId, PET_PREPARED_VIEW), 'WORKSPACE_ILLEGAL_SLOT_TRANSITION');
    registry.markPrepared(slotId);
    expectWorkspaceError(() => registry.bind(slotId, PET_PREPARED_VIEW), 'WORKSPACE_ILLEGAL_SLOT_TRANSITION');
    assert.equal(registry.getSlot(slotId).status, 'prepared');
    assert.equal(registry.getSlot(slotId).preparedViewId, CT_PREPARED_VIEW);
  });

  it('8. setDemand requires a bound or prepared slot', () => {
    const registry = ViewSlotRegistry.createDefault();
    const slotId = registry.listSlots()[0].id;

    expectWorkspaceError(
      () => registry.setDemand(slotId, makeDemand()),
      'WORKSPACE_DEMAND_REQUIRES_BINDING',
    );

    registry.bind(slotId, CT_PREPARED_VIEW);
    const bound = registry.setDemand(slotId, makeDemand(mockCtAsset.id, 'prepared-hidden'));
    assert.equal(bound.resourceDemand?.priority, 'prepared-hidden');

    registry.markPrepared(slotId);
    const prepared = registry.setDemand(slotId, makeDemand(mockPetAsset.id));
    assert.equal(prepared.resourceDemand?.assetId, mockPetAsset.id);

    registry.markUnavailable(slotId);
    expectWorkspaceError(
      () => registry.setDemand(slotId, makeDemand()),
      'WORKSPACE_DEMAND_REQUIRES_BINDING',
    );
  });

  it('9. unknown slot and group ids fail closed', () => {
    const registry = ViewSlotRegistry.createDefault();
    expectWorkspaceError(
      () => registry.getSlot('view-slot-99-mip' as ViewSlotId),
      'WORKSPACE_UNKNOWN_SLOT',
    );
    expectWorkspaceError(
      () => registry.getGroup('view-group-99' as ViewGroupId),
      'WORKSPACE_UNKNOWN_GROUP',
    );
    expectWorkspaceError(
      () => registry.bind('view-slot-99-mip' as ViewSlotId, CT_PREPARED_VIEW),
      'WORKSPACE_UNKNOWN_SLOT',
    );
  });

  it('10. invalid layouts (role, group, duplicate id, 17 slots) are refused', () => {
    const foreignRole = mutableDefaultLayout();
    (foreignRole.slots[0] as unknown as { role: string }).role = 'AXIAL';
    expectWorkspaceError(
      () => ViewSlotRegistry.fromLayout(asLayout(foreignRole)),
      'WORKSPACE_SLOT_LAYOUT_INVALID',
    );

    const mismatchedGroup = mutableDefaultLayout();
    (mismatchedGroup.slots[0] as unknown as { groupId: string }).groupId = 'view-group-99';
    expectWorkspaceError(
      () => ViewSlotRegistry.fromLayout(asLayout(mismatchedGroup)),
      'WORKSPACE_SLOT_LAYOUT_INVALID',
    );

    const duplicateSlot = mutableDefaultLayout();
    (duplicateSlot.slots[1] as unknown as { id: string }).id = duplicateSlot.slots[0].id;
    expectWorkspaceError(
      () => ViewSlotRegistry.fromLayout(asLayout(duplicateSlot)),
      'WORKSPACE_SLOT_LAYOUT_INVALID',
    );

    const oversized = mutableDefaultLayout();
    oversized.slots.push({ ...oversized.slots[0], id: 'view-slot-extra' as ViewSlotId });
    assert.equal(oversized.slots.length, MAX_VIEW_SLOTS + 1);
    expectWorkspaceError(
      () => ViewSlotRegistry.fromLayout(asLayout(oversized)),
      'WORKSPACE_SLOT_LAYOUT_INVALID',
    );

    const duplicateGroup = mutableDefaultLayout();
    (duplicateGroup.groups[1] as unknown as { id: string }).id = duplicateGroup.groups[0].id;
    expectWorkspaceError(
      () => ViewSlotRegistry.fromLayout(asLayout(duplicateGroup)),
      'WORKSPACE_SLOT_LAYOUT_INVALID',
    );

    const tooManyGroups = mutableDefaultLayout();
    tooManyGroups.groups.push({ ...tooManyGroups.groups[0], id: 'view-group-5' as ViewGroupId });
    assert.equal(tooManyGroups.groups.length, MAX_VIEW_GROUPS + 1);
    expectWorkspaceError(
      () => ViewSlotRegistry.fromLayout(asLayout(tooManyGroups)),
      'WORKSPACE_SLOT_LAYOUT_INVALID',
    );

    const shortGroup = mutableDefaultLayout();
    (shortGroup.groups[0] as unknown as { slotIds: ViewSlotId[] }).slotIds =
      shortGroup.groups[0].slotIds.slice(0, VIEW_SLOT_ROLES.length - 1);
    expectWorkspaceError(
      () => ViewSlotRegistry.fromLayout(asLayout(shortGroup)),
      'WORKSPACE_SLOT_LAYOUT_INVALID',
    );

    // C2: an empty workspace (zero groups) is refused; the lower bound is 1.
    const emptyLayout = mutableDefaultLayout();
    emptyLayout.groups = [];
    emptyLayout.slots = [];
    assert.throws(
      () => ViewSlotRegistry.fromLayout(asLayout(emptyLayout)),
      (error: unknown) => {
        assert.ok(error instanceof WorkspaceError);
        assert.equal(error.code, 'WORKSPACE_SLOT_LAYOUT_INVALID');
        assert.match(error.message, /declares no view groups/);
        assert.match(error.message, /between 1 and 4 groups/);
        return true;
      },
    );

    const valid = ViewSlotRegistry.fromLayout(asLayout(mutableDefaultLayout()));
    assert.equal(valid.listSlots().length, MAX_VIEW_SLOTS);

    // "Up to 16" (architecture §8): a smaller but structurally coherent layout
    // is legitimate, not a violation of the default four-group workspace.
    const reduced = mutableDefaultLayout();
    const keptGroups = reduced.groups.slice(0, 2);
    const keptGroupIds = new Set(keptGroups.map((group) => group.id));
    const reducedRegistry = ViewSlotRegistry.fromLayout(
      asLayout({ groups: keptGroups, slots: reduced.slots.filter((slot) => keptGroupIds.has(slot.groupId)) }),
    );
    assert.equal(reducedRegistry.listGroups().length, 2);
    assert.equal(reducedRegistry.listSlots().length, 8);
  });
});
