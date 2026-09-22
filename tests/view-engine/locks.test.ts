/**
 * NuClear P4.5 — lock guard and shared-state mutation enforcement.
 *
 * Pure Node: no DOM, WebGL or Cornerstone. The static import of the workspace
 * fixtures registers the `.js`→`.ts` resolve hook before the product modules
 * are dynamically imported by value. Guards are unit-tested over all six
 * lockable states; `replace`/`attach` are tested for fail-closed refusal with
 * object-identity evidence (no partial update).
 *
 * `replace` refusal requires a member that locks the shared pair. Since
 * `attach` now refuses such a view, the locked member is produced by the
 * internal P4.3 projection swap (`replaceRegisteredPreparedView`), which
 * simulates a lock acquired *after* attach — exactly the case `replace` must
 * re-check from the live registered views rather than a cached snapshot.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  CameraState,
  LockableState,
  MedicalViewState,
  PreparedView,
  PreparedViewId,
  SpatialState,
  StateLock,
  ViewProvenance,
} from '../../packages/shared-types/src/index.js';
import type { SharedStateGroupId } from '../../packages/view-engine/src/shared-state/types.js';
import {
  mockFusionView,
  mockFusionViewProvenance,
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

const locksModule = await import('../../packages/view-engine/src/locks/index.ts');
const preparedViewModule = await import('../../packages/view-engine/src/prepared-view/index.ts');
const preparedViewRegistryModule = await import(
  '../../packages/view-engine/src/prepared-view/registry.ts'
);

const { LOCKABLE_STATES, LockError, assertStatesUnlocked, assertViewsUnlocked, isStateLocked, lockedStates } =
  locksModule;
const { assemblePreparedView } = preparedViewModule;
const { replaceRegisteredPreparedView } = preparedViewRegistryModule;

type Workspace = InstanceType<typeof ImagingWorkspace>;

const GROUP = 'lock-group' as SharedStateGroupId;
const PET = 'prepared-lock-pet' as PreparedViewId;
const FUSION = 'prepared-lock-fusion' as PreparedViewId;

function lockOn(state: LockableState): StateLock {
  return { state, owner: 'user', locked: true };
}

function assembleView(
  id: PreparedViewId,
  state: MedicalViewState,
  provenance: ViewProvenance,
  locks?: readonly StateLock[],
): PreparedView {
  return assemblePreparedView({
    preparedViewId: id,
    state: structuredClone(state),
    provenance: structuredClone(provenance),
    ...(locks === undefined ? {} : { locks }),
  });
}

function freshPair(): { spatial: SpatialState; camera: CameraState } {
  return {
    spatial: structuredClone(mockPetView.spatial),
    camera: structuredClone(mockPetView.camera),
  };
}

function newGroupedWorkspace(): { workspace: Workspace; registry: Workspace['sharedStateGroups'] } {
  const workspace = new ImagingWorkspace();
  workspace.registerStudy(mockStudyReference);
  workspace.registerAsset(mockCtAsset);
  workspace.registerAsset(mockPetAsset);
  const pair = freshPair();
  const registry = workspace.sharedStateGroups;
  registry.createGroup({ id: GROUP, spatial: pair.spatial, camera: pair.camera });
  return { workspace, registry };
}

/** Registers and attaches an unlocked view, returning the registered view. */
function attachUnlocked(
  workspace: Workspace,
  id: PreparedViewId,
  state: MedicalViewState,
  provenance: ViewProvenance,
): PreparedView {
  const view = assembleView(id, state, provenance);
  workspace.registerPreparedView(view);
  workspace.sharedStateGroups.attach(GROUP, id);
  return view;
}

/** Simulates a lock acquired after attach via the internal P4.3 projection swap. */
function lockRegistered(
  workspace: Workspace,
  id: PreparedViewId,
  state: MedicalViewState,
  provenance: ViewProvenance,
  lockState: LockableState,
): void {
  replaceRegisteredPreparedView(
    workspace.preparedViews,
    assembleView(id, state, provenance, [lockOn(lockState)]),
  );
}

function holderPair(registry: Workspace['sharedStateGroups']): {
  spatial: SpatialState;
  camera: CameraState;
} {
  const group = registry.getGroup(GROUP);
  return { spatial: group.spatial, camera: group.camera };
}

function expectLockError(run: () => unknown, state: LockableState, operation: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof LockError, `expected LockError, got ${String(error)}`);
    assert.equal(error.name, 'LockError');
    assert.equal(error.code, 'LOCK_STATE_PROTECTED');
    assert.ok(error.message.includes(`'${state}'`), `message must name state '${state}'`);
    assert.ok(error.message.includes("'user'"), 'message must name the lock owner');
    assert.ok(error.message.includes(operation), 'message must name the attempted operation');
    assert.ok(error.message.includes('Remediation:'), 'message must carry a remediation clause');
    return true;
  });
}

describe('NuClear P4.5 — lock guard (ADR-010 §4)', () => {
  it('a. LOCKABLE_STATES lists all six states in canonical order', () => {
    assert.deepEqual(
      [...LOCKABLE_STATES],
      ['spatial', 'camera', 'presentation', 'projection', 'composition', 'binding'],
    );
  });

  it('b. lockedStates / isStateLocked cover all six states and ignore non-enforcing locks', () => {
    const view = assembleView(
      PET,
      mockPetView,
      mockPetViewProvenance,
      LOCKABLE_STATES.map(lockOn),
    );
    const set = lockedStates(view);
    assert.equal(set.size, 6, 'every state is locked');
    for (const state of LOCKABLE_STATES) {
      assert.ok(set.has(state), `expected '${state}' in lockedStates`);
      assert.equal(isStateLocked(view, state), true, `expected '${state}' locked`);
    }
    // A runtime-only locked:false payload (typed literal bypass) is not enforcing.
    const nonEnforcing = assembleView(FUSION, mockFusionView, mockFusionViewProvenance, [
      { state: 'camera', owner: 'user', locked: false } as unknown as StateLock,
    ]);
    assert.equal(isStateLocked(nonEnforcing, 'camera'), false);
    assert.equal(lockedStates(nonEnforcing).size, 0);
  });

  it('c. assertStatesUnlocked refuses the first locked state in call order', () => {
    const cameraLocked = assembleView(PET, mockPetView, mockPetViewProvenance, [lockOn('camera')]);
    expectLockError(
      () => assertStatesUnlocked(cameraLocked, ['spatial', 'camera'], "replace shared-state group 'g'"),
      'camera',
      "replace shared-state group 'g'",
    );
    const bothLocked = assembleView(PET, mockPetView, mockPetViewProvenance, [
      lockOn('spatial'),
      lockOn('camera'),
    ]);
    assert.throws(
      () => assertStatesUnlocked(bothLocked, ['camera', 'spatial'], 'op'),
      (error: unknown) => error instanceof LockError && error.message.includes("'camera'"),
    );
    assert.doesNotThrow(() => assertStatesUnlocked(cameraLocked, ['spatial', 'presentation'], 'op'));
  });

  it('d. assertViewsUnlocked reports the first offending view then state', () => {
    const unlocked = assembleView(FUSION, mockFusionView, mockFusionViewProvenance);
    const spatialLocked = assembleView(PET, mockPetView, mockPetViewProvenance, [lockOn('spatial')]);
    assert.throws(
      () => assertViewsUnlocked([unlocked, spatialLocked], ['spatial', 'camera'], 'op'),
      (error: unknown) => {
        assert.ok(error instanceof LockError);
        assert.ok(error.message.includes(String(PET)), 'the locked view is named');
        assert.ok(error.message.includes("'spatial'"));
        assert.ok(!error.message.includes(String(FUSION)), 'the unlocked view is not named');
        return true;
      },
    );
    assert.doesNotThrow(() => assertViewsUnlocked([unlocked], ['spatial', 'camera'], 'op'));
  });
});

describe('NuClear P4.5 — lock enforcement on shared-state mutation', () => {
  it('e. replace is refused when a member locks spatial', () => {
    const { workspace, registry } = newGroupedWorkspace();
    attachUnlocked(workspace, PET, mockPetView, mockPetViewProvenance);
    lockRegistered(workspace, PET, mockPetView, mockPetViewProvenance, 'spatial');
    const holder = holderPair(registry);
    const member = workspace.getPreparedView(PET);

    const replacement = freshPair();
    expectLockError(() => registry.replace(GROUP, replacement), 'spatial', `replace shared-state group '${GROUP}'`);

    assert.equal(registry.getGroup(GROUP).spatial, holder.spatial, 'holder spatial unchanged');
    assert.equal(registry.getGroup(GROUP).camera, holder.camera, 'holder camera unchanged');
    assert.equal(workspace.getPreparedView(PET), member, 'member projection unchanged');
    assert.equal(Object.isFrozen(replacement.spatial), false, 'a refused payload is never frozen');
    assert.equal(Object.isFrozen(replacement.camera), false, 'a refused payload is never frozen');
  });

  it('f. replace is refused when a member locks camera', () => {
    const { workspace, registry } = newGroupedWorkspace();
    attachUnlocked(workspace, PET, mockPetView, mockPetViewProvenance);
    lockRegistered(workspace, PET, mockPetView, mockPetViewProvenance, 'camera');
    const holder = holderPair(registry);

    expectLockError(
      () => registry.replace(GROUP, freshPair()),
      'camera',
      `replace shared-state group '${GROUP}'`,
    );
    assert.equal(registry.getGroup(GROUP).spatial, holder.spatial);
    assert.equal(registry.getGroup(GROUP).camera, holder.camera);
  });

  it('g. a two-member group with only the second locked leaves everything unchanged', () => {
    const { workspace, registry } = newGroupedWorkspace();
    attachUnlocked(workspace, PET, mockPetView, mockPetViewProvenance);
    attachUnlocked(workspace, FUSION, mockFusionView, mockFusionViewProvenance);
    lockRegistered(workspace, FUSION, mockFusionView, mockFusionViewProvenance, 'camera');
    const holder = holderPair(registry);
    const beforePet = workspace.getPreparedView(PET);
    const beforeFusion = workspace.getPreparedView(FUSION);

    expectLockError(() => registry.replace(GROUP, freshPair()), 'camera', `replace shared-state group '${GROUP}'`);

    assert.equal(registry.getGroup(GROUP).spatial, holder.spatial);
    assert.equal(registry.getGroup(GROUP).camera, holder.camera);
    assert.equal(workspace.getPreparedView(PET), beforePet, 'the untouched first member is identical');
    assert.equal(workspace.getPreparedView(FUSION), beforeFusion, 'the locked second member is identical');
  });

  it('h. attach is refused for a view locking spatial or camera', () => {
    for (const state of ['spatial', 'camera'] as const) {
      const { workspace, registry } = newGroupedWorkspace();
      const view = assembleView(PET, mockPetView, mockPetViewProvenance, [lockOn(state)]);
      workspace.registerPreparedView(view);

      expectLockError(
        () => registry.attach(GROUP, PET),
        state,
        `attach prepared view '${PET}' to shared-state group '${GROUP}'`,
      );
      assert.equal(registry.listMembers(GROUP).length, 0, 'a refused attach adds no member');
      assert.equal(workspace.getPreparedView(PET), view, 'the registered view is unchanged');
    }
  });

  it('i. a lock on a non-shared state (presentation) does not block replace', () => {
    const { workspace, registry } = newGroupedWorkspace();
    attachUnlocked(workspace, PET, mockPetView, mockPetViewProvenance);
    lockRegistered(workspace, PET, mockPetView, mockPetViewProvenance, 'presentation');
    const replacement = freshPair();

    const replaced = registry.replace(GROUP, replacement);

    assert.ok(Object.isFrozen(replaced), 'the replacement result is frozen');
    assert.equal(replaced.length, 1);
    assert.equal(registry.getGroup(GROUP).spatial, replacement.spatial);
    assert.equal(registry.getGroup(GROUP).camera, replacement.camera);
    assert.ok(
      replaced[0].locks.some((lock) => lock.state === 'presentation' && lock.locked === true),
      'the non-shared presentation lock is preserved across the projection',
    );
    assert.equal(replaced[0].state.composition.mode, mockMedicalView.composition.mode);
  });
});
