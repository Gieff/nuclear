/**
 * NuClear P4.4b — workspace-level inter-study spatial propagation (ADR-012).
 *
 * Pure Node: no DOM, WebGL or Cornerstone. Proves the staged atomic publication
 * (OD-1), hand-computed rigid mapping, deterministic chains, convergent-path and
 * lock refusals, and the typed clamp/hide/warn out-of-domain outcomes (OD-5).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Point3D, PreparedView, ViewId } from '../../packages/shared-types/src/index.js';
import {
  BASELINE_PREPARED,
  BASELINE_VIEW,
  FOLLOWUP_PREPARED,
  FOLLOWUP_VIEW,
  MOCK_FOLLOWUP_FOR_UID,
  makeAdmissibleInterStudyLink,
  makePreparedView,
  makeRelativeInterStudyLink,
  mockCtAsset,
  mockFollowupAsset,
  mockMismatchedDomainAsset,
  newInterStudyWorkspace,
  registerBaselinePair,
  type Workspace,
} from './fixtures/inter-study-fixtures.ts';
import { buildChainWorkspace, buildConvergenceWorkspace } from './fixtures/inter-study-chain-fixtures.ts';

const linkingModule = await import('../../packages/view-engine/src/linking/index.ts');
const { LinkError } = linkingModule;

function expectLinkError(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof LinkError, `expected LinkError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(error.message.includes('Remediation:'), 'expected a remediation clause');
    return true;
  });
}

function snapshot(workspace: Workspace): readonly PreparedView[] {
  return workspace.listPreparedViews();
}

function assertUnchanged(workspace: Workspace, before: readonly PreparedView[]): void {
  const after = workspace.listPreparedViews();
  assert.equal(after.length, before.length);
  for (let index = 0; index < before.length; index += 1) {
    assert.equal(after[index], before[index], `view '${before[index].id}' identity changed`);
    assert.deepEqual(after[index].state.spatial, before[index].state.spatial);
  }
}

function requireView(workspace: Workspace, viewId: ViewId): PreparedView {
  const view = workspace.listPreparedViews().find((candidate) => candidate.sourceViewId === viewId);
  if (view === undefined) throw new Error(`Test setup: no prepared view for source view '${viewId}'.`);
  return view;
}

function makeIntent(workspace: Workspace, originViewId: ViewId, location: Point3D, epoch = 1) {
  const origin = requireView(workspace, originViewId);
  return {
    originViewId,
    nextSpatialState: { ...origin.state.spatial, referenceLocation: location },
    causalityToken: { originViewId, linkId: 'intent-link', epoch },
  };
}

function assertClosePoint(actual: Point3D | undefined, expected: readonly number[]): void {
  assert.ok(actual !== undefined, 'expected a reference location');
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(Math.abs(actual[axis] - expected[axis]) <= 1e-9, `axis ${axis}: ${actual[axis]} vs ${expected[axis]}`);
  }
}

function registerBaselineLink(workspace: Workspace) {
  return workspace.registerInterStudyLink({
    link: makeAdmissibleInterStudyLink(),
    sourcePreparedViewId: BASELINE_PREPARED,
    targetPreparedViewId: FOLLOWUP_PREPARED,
  });
}

describe('NuClear P4.4b — inter-study spatial propagation', () => {
  it('1. propagates one transformed hop and publishes origin and target', () => {
    const workspace = newInterStudyWorkspace();
    registerBaselinePair(workspace);
    registerBaselineLink(workspace);
    const result = workspace.applySpatialIntent(makeIntent(workspace, BASELINE_VIEW, [10, 20, -230]));

    assert.deepEqual(result.origin.state.spatial.referenceLocation, [10, 20, -230]);
    assert.deepEqual(result.causalityToken, { originViewId: BASELINE_VIEW, linkId: 'intent-link', epoch: 1 });
    assert.equal(result.targets.length, 1);
    assert.equal(result.targets[0].outcome, 'updated');
    assert.equal(result.targets[0].outOfDomainCode, undefined);
    assert.deepEqual(result.targets[0].spatial?.referenceLocation, [15, 17, -228]);
    assert.deepEqual(workspace.getPreparedView(FOLLOWUP_PREPARED).state.spatial.referenceLocation, [15, 17, -228]);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.origin));
    assert.equal(workspace.sharedStateGroups.snapshot().length, 0);
  });

  it('2. propagates 3-view and 4-view chains deterministically', () => {
    for (const hops of [2, 3]) {
      const chain = buildChainWorkspace(hops);
      const result = chain.workspace.applySpatialIntent(makeIntent(chain.workspace, chain.viewIds[0], [0, 0, -250]));
      assert.deepEqual(result.origin.state.spatial.referenceLocation, [0, 0, -250]);
      assert.equal(result.targets.length, hops);
      for (let step = 1; step <= hops; step += 1) {
        assert.equal(result.targets[step - 1].outcome, 'updated');
        assert.deepEqual(result.targets[step - 1].spatial?.referenceLocation, [5 * step, -3 * step, -250 + 2 * step]);
      }
    }
  });

  it('3. re-running the same intent yields structurally equal spatial states', () => {
    const chain = buildChainWorkspace(2);
    const first = chain.workspace.applySpatialIntent(makeIntent(chain.workspace, chain.viewIds[0], [10, 20, -230]));
    const second = chain.workspace.applySpatialIntent(makeIntent(chain.workspace, chain.viewIds[0], [10, 20, -230]));
    for (let index = 0; index < first.targets.length; index += 1) {
      assert.deepEqual(second.targets[index].spatial, first.targets[index].spatial);
    }
  });

  it('4. validates the causality token and refuses an unknown origin', () => {
    const workspace = newInterStudyWorkspace();
    registerBaselinePair(workspace);
    registerBaselineLink(workspace);
    const origin = requireView(workspace, BASELINE_VIEW);
    const nextSpatialState = { ...origin.state.spatial, referenceLocation: [0, 0, -250] as Point3D };

    expectLinkError(
      () => workspace.applySpatialIntent({ originViewId: BASELINE_VIEW, nextSpatialState, causalityToken: { originViewId: FOLLOWUP_VIEW, linkId: 'x', epoch: 1 } }),
      'LINK_ORIGIN_UNKNOWN',
    );
    expectLinkError(
      () => workspace.applySpatialIntent({ originViewId: BASELINE_VIEW, nextSpatialState, causalityToken: { originViewId: BASELINE_VIEW, linkId: 'x', epoch: Number.NaN } }),
      'LINK_MALFORMED',
    );
    const missing = 'view-missing' as ViewId;
    expectLinkError(
      () => workspace.applySpatialIntent({ originViewId: missing, nextSpatialState, causalityToken: { originViewId: missing, linkId: 'x', epoch: 1 } }),
      'LINK_ORIGIN_UNKNOWN',
    );
  });

  it('5. refuses a pre-attached relative edge during traversal', () => {
    const workspace = newInterStudyWorkspace();
    workspace.registerPreparedView(makePreparedView({
      preparedViewId: BASELINE_PREPARED,
      viewId: BASELINE_VIEW,
      frameOfReferenceUID: MOCK_FOLLOWUP_FOR_UID,
      asset: mockFollowupAsset,
      links: [makeRelativeInterStudyLink()],
    }));
    workspace.registerPreparedView(makePreparedView({
      preparedViewId: FOLLOWUP_PREPARED,
      viewId: FOLLOWUP_VIEW,
      frameOfReferenceUID: mockCtAsset.frameOfReferenceUID,
      asset: mockCtAsset,
    }));
    const before = snapshot(workspace);
    expectLinkError(
      () => workspace.applySpatialIntent(makeIntent(workspace, BASELINE_VIEW, [0, 0, -250])),
      'LINK_RELATIVE_MODE_UNSUPPORTED',
    );
    assertUnchanged(workspace, before);
  });

  it('6. refuses a convergent path and publishes nothing', () => {
    const convergence = buildConvergenceWorkspace();
    const before = snapshot(convergence.workspace);
    expectLinkError(
      () => convergence.workspace.applySpatialIntent(makeIntent(convergence.workspace, convergence.originViewId, [0, 0, -250])),
      'LINK_PROPAGATION_CONFLICT',
    );
    assertUnchanged(convergence.workspace, before);
  });

  it('7. refuses a locked target and a locked origin', () => {
    const targetLocked = newInterStudyWorkspace();
    registerBaselinePair(targetLocked, { targetLocks: [{ state: 'spatial', owner: 'user', locked: true }] });
    registerBaselineLink(targetLocked);
    let before = snapshot(targetLocked);
    expectLinkError(
      () => targetLocked.applySpatialIntent(makeIntent(targetLocked, BASELINE_VIEW, [0, 0, -250])),
      'LINK_TARGET_SPATIAL_LOCKED',
    );
    assertUnchanged(targetLocked, before);

    const originLocked = newInterStudyWorkspace();
    registerBaselinePair(originLocked, { sourceLocks: [{ state: 'spatial', owner: 'user', locked: true }] });
    registerBaselineLink(originLocked);
    before = snapshot(originLocked);
    expectLinkError(
      () => originLocked.applySpatialIntent(makeIntent(originLocked, BASELINE_VIEW, [0, 0, -250])),
      'LINK_TARGET_SPATIAL_LOCKED',
    );
    assertUnchanged(originLocked, before);
  });

  it('8. clamps an out-of-domain target and records the OD-5 outcome', () => {
    const workspace = newInterStudyWorkspace();
    registerBaselinePair(workspace);
    registerBaselineLink(workspace);
    const result = workspace.applySpatialIntent(makeIntent(workspace, BASELINE_VIEW, [0, 0, 0]));
    assert.equal(result.targets[0].outcome, 'clamped');
    assert.equal(result.targets[0].outOfDomainCode, 'LINK_TARGET_OUT_OF_DOMAIN');
    assertClosePoint(result.targets[0].spatial?.referenceLocation, [5, -3, -1.25]);
    assertClosePoint(workspace.getPreparedView(FOLLOWUP_PREPARED).state.spatial.referenceLocation, [5, -3, -1.25]);
  });

  it('9. records non-mutating hide/warn outcomes and stops the branch', () => {
    for (const [behavior, expected] of [['hide', 'hidden'], ['warn', 'warned']] as const) {
      const chain = buildChainWorkspace(2, { outOfDomainBehavior: behavior });
      const before = snapshot(chain.workspace);
      const result = chain.workspace.applySpatialIntent(makeIntent(chain.workspace, chain.viewIds[0], [0, 0, 0]));
      assert.equal(result.targets.length, 1, `${behavior}: the branch stops at the target`);
      assert.equal(result.targets[0].outcome, expected);
      assert.equal(result.targets[0].outOfDomainCode, 'LINK_TARGET_OUT_OF_DOMAIN');
      assert.equal(result.targets[0].spatial, undefined);
      assert.equal(chain.workspace.getPreparedView(chain.preparedIds[1]), before[1], `${behavior}: target unchanged`);
      assert.equal(chain.workspace.getPreparedView(chain.preparedIds[2]), before[2], `${behavior}: beyond unchanged`);
      assert.deepEqual(chain.workspace.getPreparedView(chain.preparedIds[0]).state.spatial.referenceLocation, [0, 0, 0]);
    }
  });

  it('10. refuses when target domain evidence is unavailable', () => {
    const workspace = newInterStudyWorkspace();
    registerBaselinePair(workspace, { targetAsset: mockMismatchedDomainAsset });
    registerBaselineLink(workspace);
    const before = snapshot(workspace);
    expectLinkError(
      () => workspace.applySpatialIntent(makeIntent(workspace, BASELINE_VIEW, [0, 0, -250])),
      'LINK_TARGET_DOMAIN_UNAVAILABLE',
    );
    assertUnchanged(workspace, before);
  });

  it('11. a late locked target refuses atomically (origin and intermediate unchanged)', () => {
    const chain = buildChainWorkspace(2, { lockedViewIndices: [2] });
    const before = snapshot(chain.workspace);
    expectLinkError(
      () => chain.workspace.applySpatialIntent(makeIntent(chain.workspace, chain.viewIds[0], [0, 0, -250])),
      'LINK_TARGET_SPATIAL_LOCKED',
    );
    assertUnchanged(chain.workspace, before);
  });
});
