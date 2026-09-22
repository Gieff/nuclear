/**
 * NuClear P4.3 — shared-state invariants suite (ADR-011 §3 + binding addendum).
 *
 * Pure Node: no DOM, WebGL or Cornerstone. Tests `f`–`m` pin the fail-closed
 * replacement and membership invariants. Shared builders and product seams
 * come from `./fixtures/shared-state-fixtures.ts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorkspaceError } from './fixtures/workspace-fixtures.ts';
import { FUSION_PREPARED, GROUP_A, GROUP_B, PET_PREPARED, PreparedViewError, PreparedViewRegistry, SharedStateError, SharedStateGroupRegistry, UNKNOWN_GROUP, UNKNOWN_PREPARED, freshPair, preparedViewModule, registerFusionView, registerPetView, sharedStateModule, workspaceWithBothAssets, type Pair } from './fixtures/shared-state-fixtures.ts';

describe('NuClear P4.3 — shared-state invariants (ADR-011 §3 + addendum)', () => {
  it('f. an invalid replacement is refused and leaves holder and views object-identical', () => {
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

    const canonicalSpatial = group.spatial;
    const canonicalCamera = group.camera;
    const canonicalPet = workspace.getPreparedView(PET_PREPARED);
    const canonicalFusion = workspace.getPreparedView(FUSION_PREPARED);

    const cases: ReadonlyArray<{
      readonly code: 'WORKSPACE_NON_FINITE_NUMBER' | 'WORKSPACE_UNDEFINED_VALUE' | 'WORKSPACE_UNSUPPORTED_VALUE';
      readonly corrupt: (pair: Pair) => void;
    }> = [
      {
        code: 'WORKSPACE_NON_FINITE_NUMBER',
        corrupt: (pair) => {
          (pair.spatial as { sliceOffsetMm: number }).sliceOffsetMm = NaN;
        },
      },
      {
        code: 'WORKSPACE_UNDEFINED_VALUE',
        corrupt: (pair) => {
          (pair.spatial as unknown as Record<string, unknown>).patientPosition = undefined;
        },
      },
      {
        code: 'WORKSPACE_UNSUPPORTED_VALUE',
        corrupt: (pair) => {
          (pair.spatial as unknown as Record<string, unknown>).acquiredAt = new Date('2026-09-22T00:00:00Z');
        },
      },
      {
        code: 'WORKSPACE_UNSUPPORTED_VALUE',
        corrupt: (pair) => {
          (pair.camera as unknown as Record<string, unknown>).matrix = new Map<string, number>();
        },
      },
    ];

    for (const testCase of cases) {
      const pair = freshPair();
      testCase.corrupt(pair);
      assert.equal(Object.isFrozen(pair.spatial), false, 'the invalid payload starts mutable');
      assert.equal(Object.isFrozen(pair.camera), false, 'the invalid payload starts mutable');

      assert.throws(
        () => workspace.sharedStateGroups.replace(GROUP_A, pair),
        (error: unknown) => {
          assert.ok(error instanceof WorkspaceError, `expected WorkspaceError, got ${String(error)}`);
          assert.equal(error.code, testCase.code);
          return true;
        },
      );

      assert.equal(group.spatial, canonicalSpatial, 'the holder keeps the previous spatial pair');
      assert.equal(group.camera, canonicalCamera, 'the holder keeps the previous camera pair');
      assert.equal(workspace.getPreparedView(PET_PREPARED), canonicalPet, 'the bound view is unchanged');
      assert.equal(workspace.getPreparedView(FUSION_PREPARED), canonicalFusion, 'the bound view is unchanged');
      assert.equal(Object.isFrozen(pair.spatial), false, 'a refused payload is never frozen into the holder');
      assert.equal(Object.isFrozen(pair.camera), false, 'a refused payload is never frozen into the holder');
    }
  });
  it('g. duplicate/unknown group and attach/detach invariants fail closed', () => {
    const workspace = workspaceWithBothAssets();
    const registry = workspace.sharedStateGroups;
    registry.createGroup({ id: GROUP_A, spatial: freshPair().spatial, camera: freshPair().camera });
    registry.createGroup({ id: GROUP_B, spatial: freshPair().spatial, camera: freshPair().camera });
    registerPetView(workspace);
    registerFusionView(workspace);

    // Duplicate group id is refused before its input is frozen.
    const duplicatePair = freshPair();
    assert.throws(
      () =>
        registry.createGroup({
          id: GROUP_A,
          spatial: duplicatePair.spatial,
          camera: duplicatePair.camera,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SharedStateError);
        assert.equal(error.code, 'SHARED_STATE_DUPLICATE_GROUP');
        assert.ok(error.message.includes(String(GROUP_A)), 'message must name the offending group id');
        return true;
      },
    );
    assert.equal(Object.isFrozen(duplicatePair.spatial), false, 'a refused duplicate does not freeze the caller');
    assert.equal(registry.listGroups().length, 2, 'a refused duplicate must not create a group');

    // Unknown group: read, attach, replace and listMembers all fail closed.
    for (const run of [
      () => registry.getGroup(UNKNOWN_GROUP),
      () => registry.attach(UNKNOWN_GROUP, PET_PREPARED),
      () => registry.replace(UNKNOWN_GROUP, freshPair()),
      () => registry.listMembers(UNKNOWN_GROUP),
    ]) {
      assert.throws(run, (error: unknown) => {
        assert.ok(error instanceof SharedStateError, `expected SharedStateError, got ${String(error)}`);
        assert.equal(error.code, 'SHARED_STATE_UNKNOWN_GROUP');
        assert.ok(error.message.includes(String(UNKNOWN_GROUP)), 'message must name the offending group id');
        return true;
      });
    }
    assert.equal(registry.listGroups().length, 2, 'unknown-group refusals must not create groups');

    // The group check precedes the prepared-view lookup.
    assert.throws(
      () => registry.attach(UNKNOWN_GROUP, UNKNOWN_PREPARED),
      (error: unknown) => error instanceof SharedStateError && error.code === 'SHARED_STATE_UNKNOWN_GROUP',
    );

    // Known group + unknown view propagates the prepared-view error.
    assert.throws(
      () => registry.attach(GROUP_A, UNKNOWN_PREPARED),
      (error: unknown) => {
        assert.ok(error instanceof PreparedViewError, `expected PreparedViewError, got ${String(error)}`);
        assert.equal(error.code, 'PREPARED_VIEW_UNKNOWN_ID');
        return true;
      },
    );

    // Attach succeeds once, then double-attach (same and second group) fails.
    const attached = registry.attach(GROUP_A, PET_PREPARED);
    assert.equal(attached.id, PET_PREPARED);
    assert.throws(
      () => registry.attach(GROUP_A, PET_PREPARED),
      (error: unknown) =>
        error instanceof SharedStateError &&
        error.code === 'SHARED_STATE_VIEW_ALREADY_ATTACHED' &&
        error.message.includes(String(GROUP_A)),
    );
    assert.throws(
      () => registry.attach(GROUP_B, PET_PREPARED),
      (error: unknown) =>
        error instanceof SharedStateError &&
        error.code === 'SHARED_STATE_VIEW_ALREADY_ATTACHED' &&
        error.message.includes(String(GROUP_A)),
    );
    assert.deepEqual([...registry.listMembers(GROUP_A)], [PET_PREPARED], 'a refused re-attach keeps membership');

    // Detach an unattached view fails; detach + re-attach succeeds.
    assert.throws(
      () => registry.detach(FUSION_PREPARED),
      (error: unknown) =>
        error instanceof SharedStateError && error.code === 'SHARED_STATE_VIEW_NOT_ATTACHED',
    );
    const detached = registry.detach(PET_PREPARED);
    assert.equal(detached.id, PET_PREPARED);
    assert.equal(registry.listMembers(GROUP_A).length, 0, 'detach removes the membership');
    const reattached = registry.attach(GROUP_B, PET_PREPARED);
    assert.equal(reattached.id, PET_PREPARED);
    assert.deepEqual([...registry.listMembers(GROUP_B)], [PET_PREPARED]);
    assert.deepEqual([...registry.listMembers(GROUP_A)], [], 'the old group has no members after detach');
  });
  it('h. snapshot is frozen and lists group ids with member ids', () => {
    const workspace = workspaceWithBothAssets();
    const registry = workspace.sharedStateGroups;
    const groupA = registry.createGroup({
      id: GROUP_A,
      spatial: freshPair().spatial,
      camera: freshPair().camera,
    });
    const groupB = registry.createGroup({
      id: GROUP_B,
      spatial: freshPair().spatial,
      camera: freshPair().camera,
    });
    registerPetView(workspace);
    registerFusionView(workspace);
    registry.attach(GROUP_A, PET_PREPARED);
    registry.attach(GROUP_B, FUSION_PREPARED);

    assert.deepEqual(
      registry.listGroups().map((group) => group.id),
      [GROUP_A, GROUP_B],
    );
    assert.equal(registry.listGroups()[0], groupA);

    const snapshot = registry.snapshot();
    assert.ok(Object.isFrozen(snapshot), 'the snapshot array must be frozen');
    assert.equal(snapshot.length, 2);
    assert.equal(snapshot[0].id, GROUP_A);
    assert.equal(snapshot[1].id, GROUP_B);
    assert.deepEqual([...snapshot[0].preparedViewIds], [PET_PREPARED]);
    assert.deepEqual([...snapshot[1].preparedViewIds], [FUSION_PREPARED]);
    assert.ok(Object.isFrozen(snapshot[0]), 'each snapshot entry must be frozen');
    assert.ok(Object.isFrozen(snapshot[0].preparedViewIds), 'member id tuples must be frozen');
    assert.equal(snapshot[0].spatial, groupA.spatial, 'snapshot publishes the holder pair by identity');
    assert.equal(snapshot[1].camera, groupB.camera);

    const workspaceSnapshot = workspace.snapshot();
    assert.ok(Object.isFrozen(workspaceSnapshot.sharedStateGroups));
    assert.equal(workspaceSnapshot.sharedStateGroups.length, 2);
    assert.equal(workspaceSnapshot.sharedStateGroups[0].id, GROUP_A);
    assert.deepEqual(
      JSON.parse(JSON.stringify(workspaceSnapshot.sharedStateGroups)),
      workspaceSnapshot.sharedStateGroups,
      'the shared-state snapshot must stay JSON-lossless',
    );
  });
  it('i. replace returns a frozen array of the exact published projection objects', () => {
    const workspace = workspaceWithBothAssets();
    workspace.sharedStateGroups.createGroup({
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

    const replaced = workspace.sharedStateGroups.replace(GROUP_A, freshPair());

    assert.ok(Object.isFrozen(replaced), 'the returned array must be frozen');
    assert.equal(replaced.length, 2);
    assert.equal(
      replaced[0],
      workspace.getPreparedView(PET_PREPARED),
      'the returned member is the same object now published by getPreparedView',
    );
    assert.equal(
      replaced[1],
      workspace.getPreparedView(FUSION_PREPARED),
      'the returned member is the same object now published by getPreparedView',
    );
    assert.notEqual(replaced[0], beforePet, 'the pre-replace projection is superseded');
    assert.notEqual(replaced[1], beforeFusion, 'the pre-replace projection is superseded');
    assert.ok(Object.isFrozen(replaced[0]));
    assert.ok(Object.isFrozen(replaced[1]));
  });
  it('j. internal mutation surfaces are not exported or reachable publicly', () => {
    assert.equal('currentSharedStatePair' in sharedStateModule, false, 'holder read guard stays private');
    assert.equal('commitSharedStatePair' in sharedStateModule, false, 'holder mutator stays private');
    assert.equal(
      'replaceRegisteredPreparedView' in preparedViewModule,
      false,
      'the projection-swap friend must not leak through the prepared-view barrel',
    );
    const publicRegistry = new PreparedViewRegistry();
    assert.equal(
      typeof (publicRegistry as unknown as Record<string, unknown>).replace,
      'undefined',
      'the public PreparedViewRegistry.replace swap capability must be gone',
    );
  });
  it('k. a zero-member group replace returns a frozen empty array and swaps the pair', () => {
    const registry = new SharedStateGroupRegistry(new PreparedViewRegistry());
    const pair = freshPair();
    const group = registry.createGroup({ id: GROUP_A, spatial: pair.spatial, camera: pair.camera });
    const oldSpatial = group.spatial;
    const oldCamera = group.camera;

    const nextPair = freshPair();
    const replaced = registry.replace(GROUP_A, nextPair);

    assert.ok(Object.isFrozen(replaced), 'the returned array must be frozen even with no members');
    assert.equal(replaced.length, 0);
    assert.equal(group.spatial, nextPair.spatial, 'the holder commits the new spatial pair');
    assert.equal(group.camera, nextPair.camera, 'the holder commits the new camera pair');
    assert.notEqual(group.spatial, oldSpatial, 'the old pair is superseded');
    assert.notEqual(group.camera, oldCamera, 'the old pair is superseded');
    assert.ok(Object.isFrozen(nextPair.spatial));
    assert.ok(Object.isFrozen(nextPair.camera));
  });
  it('l. bigint, symbol and function replacement members are refused, leaving state identical', () => {
    const workspace = workspaceWithBothAssets();
    const group = workspace.sharedStateGroups.createGroup({
      id: GROUP_A,
      spatial: freshPair().spatial,
      camera: freshPair().camera,
    });
    registerPetView(workspace);
    workspace.sharedStateGroups.attach(GROUP_A, PET_PREPARED);
    const canonicalSpatial = group.spatial;
    const canonicalCamera = group.camera;
    const canonicalPet = workspace.getPreparedView(PET_PREPARED);
    const canonicalSnapshot = JSON.stringify(workspace.sharedStateGroups.snapshot());

    const cases: ReadonlyArray<{
      readonly label: string;
      readonly corrupt: (pair: Pair) => void;
    }> = [
      {
        label: 'bigint member',
        corrupt: (pair) => {
          (pair.spatial as unknown as Record<string, unknown>).sliceOffsetMm = 42n;
        },
      },
      {
        label: 'symbol member',
        corrupt: (pair) => {
          (pair.camera as unknown as Record<string, unknown>).zoom = Symbol('zoom');
        },
      },
      {
        label: 'function member',
        corrupt: (pair) => {
          (pair.spatial as unknown as Record<string, unknown>).patientPosition = () => 0;
        },
      },
    ];

    for (const testCase of cases) {
      const pair = freshPair();
      testCase.corrupt(pair);

      assert.throws(
        () => workspace.sharedStateGroups.replace(GROUP_A, pair),
        (error: unknown) => {
          assert.ok(
            error instanceof WorkspaceError,
            `${testCase.label}: expected WorkspaceError, got ${String(error)}`,
          );
          assert.equal(error.code, 'WORKSPACE_UNSUPPORTED_VALUE', `${testCase.label}: wrong error code`);
          return true;
        },
      );

      assert.equal(group.spatial, canonicalSpatial, `${testCase.label}: holder spatial is unchanged`);
      assert.equal(group.camera, canonicalCamera, `${testCase.label}: holder camera is unchanged`);
      assert.equal(workspace.getPreparedView(PET_PREPARED), canonicalPet, `${testCase.label}: view is unchanged`);
      assert.equal(
        JSON.stringify(workspace.sharedStateGroups.snapshot()),
        canonicalSnapshot,
        `${testCase.label}: the published snapshot is unchanged`,
      );
    }
  });
  it('m. listGroups is frozen and a holder id cannot be corrupted', () => {
    const workspace = workspaceWithBothAssets();
    const registry = workspace.sharedStateGroups;
    const group = registry.createGroup({
      id: GROUP_A,
      spatial: freshPair().spatial,
      camera: freshPair().camera,
    });

    const groups = registry.listGroups();
    assert.ok(Object.isFrozen(groups), 'listGroups must return a frozen array');
    assert.equal(groups[0], group, 'the holder identity is preserved');
    assert.ok(Object.isFrozen(group), 'the holder instance itself must be frozen');

    assert.throws(
      () => {
        (group as { id: string }).id = 'corrupted';
      },
      TypeError,
      'mutating the holder id must throw in strict mode',
    );
    assert.equal(group.id, GROUP_A, 'a refused mutation must not change the holder');
    assert.equal(registry.snapshot()[0].id, GROUP_A, 'the published snapshot id stays canonical');
    assert.equal(registry.listGroups()[0].id, GROUP_A, 'the re-listed holder id stays canonical');
  });
});
