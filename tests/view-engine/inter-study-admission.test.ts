/**
 * NuClear P4.4b — inter-study link admission & registration gates (ADR-012).
 *
 * Pure Node: no DOM, WebGL or Cornerstone. Every refusal asserts the exact
 * `LinkError.code`, a `Remediation:` clause and an unchanged registry (same
 * object identities and link counts). Positive cases prove idempotent
 * registration with no `SharedStateGroup`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PreparedView, ViewId } from '../../packages/shared-types/src/index.js';
import type { SharedStateGroupId } from '../../packages/view-engine/src/shared-state/types.ts';
import {
  BASELINE_PREPARED,
  BASELINE_VIEW,
  FOLLOWUP_PREPARED,
  FOLLOWUP_VIEW,
  MOCK_FOLLOWUP_FOR_UID,
  MOCK_FOR_UID,
  MOCK_THIRD_FOR_UID,
  makeAdmissibleInterStudyLink,
  makeLinkBetween,
  makeProcrustesTransform,
  makeRelativeInterStudyLink,
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
    assert.equal(after[index].links.length, before[index].links.length, `view '${before[index].id}' links changed`);
    assert.deepEqual(after[index].state.spatial, before[index].state.spatial);
  }
}

function pairWorkspace(): Workspace {
  const workspace = newInterStudyWorkspace();
  registerBaselinePair(workspace);
  return workspace;
}

function registerBaseline(workspace: Workspace) {
  return workspace.registerInterStudyLink({
    link: makeAdmissibleInterStudyLink(),
    sourcePreparedViewId: BASELINE_PREPARED,
    targetPreparedViewId: FOLLOWUP_PREPARED,
  });
}

function register(
  workspace: Workspace,
  link: ReturnType<typeof makeAdmissibleInterStudyLink>,
  sourcePreparedViewId = BASELINE_PREPARED,
  targetPreparedViewId = FOLLOWUP_PREPARED,
) {
  return workspace.registerInterStudyLink({ link, sourcePreparedViewId, targetPreparedViewId });
}

describe('NuClear P4.4b — inter-study link admission & registration', () => {
  it('1. registers an admissible Procrustes link once on both frozen views', () => {
    const workspace = pairWorkspace();
    const registered = registerBaseline(workspace);

    assert.equal(registered.link.kind, 'inter-study');
    assert.equal(registered.source.links.length, 1);
    assert.equal(registered.target.links.length, 1);
    assert.equal(registered.source.links[0], registered.target.links[0], 'both views record the same frozen link');
    assert.equal(workspace.sharedStateGroups.snapshot().length, 0, 'inter-study never creates a group');
    for (const value of [registered, registered.source, registered.target]) {
      assert.ok(Object.isFrozen(value), 'published values are frozen');
    }
    assert.throws(() => {
      (registered as { link: unknown }).link = null;
    }, TypeError);

    const again = registerBaseline(workspace);
    assert.equal(again.source, registered.source, 're-registration is idempotent');
    assert.equal(again.target, registered.target);
    assert.equal(again.source.links.length, 1);
  });

  it('2. refuses MI evidence with and without a residual (LINK_TRANSFORM_INVALID)', () => {
    for (const errorMarginMm of [1.2, undefined] as Array<number | undefined>) {
      const workspace = pairWorkspace();
      const before = snapshot(workspace);
      const link = makeAdmissibleInterStudyLink({
        spatialTransform: makeProcrustesTransform({ method: 'rigid-coregistration', errorMarginMm }),
      });
      expectLinkError(() => register(workspace, link), 'LINK_TRANSFORM_INVALID');
      assertUnchanged(workspace, before);
    }
  });

  it('3. refuses a missing errorMarginMm (LINK_TRANSFORM_ERROR_MARGIN_MISSING)', () => {
    const workspace = pairWorkspace();
    const before = snapshot(workspace);
    const link = makeAdmissibleInterStudyLink({
      spatialTransform: makeProcrustesTransform({ errorMarginMm: undefined }),
    });
    expectLinkError(() => register(workspace, link), 'LINK_TRANSFORM_ERROR_MARGIN_MISSING');
    assertUnchanged(workspace, before);
  });

  it('4. admits errorMarginMm === toleranceMm (boundary) and refuses one above it', () => {
    const boundary = pairWorkspace();
    const admitted = register(boundary, makeAdmissibleInterStudyLink({
      toleranceMm: 2,
      spatialTransform: makeProcrustesTransform({ errorMarginMm: 2 }),
    }));
    assert.equal(admitted.source.links.length, 1);

    const over = pairWorkspace();
    const before = snapshot(over);
    expectLinkError(
      () => register(over, makeAdmissibleInterStudyLink({
        toleranceMm: 2,
        spatialTransform: makeProcrustesTransform({ errorMarginMm: 2.5 }),
      })),
      'LINK_REGISTRATION_ERROR_EXCEEDS_TOLERANCE',
    );
    assertUnchanged(over, before);
  });

  it('5. refuses relative mode (LINK_RELATIVE_MODE_UNSUPPORTED) and affine (LINK_TRANSFORM_INVALID)', () => {
    const relativeWorkspace = pairWorkspace();
    const relativeBefore = snapshot(relativeWorkspace);
    expectLinkError(() => register(relativeWorkspace, makeRelativeInterStudyLink()), 'LINK_RELATIVE_MODE_UNSUPPORTED');
    assertUnchanged(relativeWorkspace, relativeBefore);

    const affineWorkspace = pairWorkspace();
    const affineBefore = snapshot(affineWorkspace);
    expectLinkError(
      () => register(affineWorkspace, makeAdmissibleInterStudyLink({
        spatialTransform: makeProcrustesTransform({ transformType: 'affine' }),
      })),
      'LINK_TRANSFORM_INVALID',
    );
    assertUnchanged(affineWorkspace, affineBefore);
  });

  it('6. refuses a self-edge (LINK_SELF_REFERENCE)', () => {
    const workspace = pairWorkspace();
    const before = snapshot(workspace);
    expectLinkError(
      () => workspace.registerInterStudyLink({
        link: makeAdmissibleInterStudyLink(),
        sourcePreparedViewId: BASELINE_PREPARED,
        targetPreparedViewId: BASELINE_PREPARED,
      }),
      'LINK_SELF_REFERENCE',
    );
    assertUnchanged(workspace, before);
  });

  it('7. refuses an endpoint attached to a shared-state group (LINK_SHARED_STATE_CONFLICT)', () => {
    const workspace = pairWorkspace();
    const baseline = workspace.getPreparedView(BASELINE_PREPARED);
    const groupId = 'group-admission' as SharedStateGroupId;
    workspace.sharedStateGroups.createGroup({ id: groupId, spatial: baseline.state.spatial, camera: baseline.state.camera });
    workspace.sharedStateGroups.attach(groupId, BASELINE_PREPARED);
    const before = snapshot(workspace);
    expectLinkError(() => registerBaseline(workspace), 'LINK_SHARED_STATE_CONFLICT');
    assertUnchanged(workspace, before);
    assert.equal(workspace.sharedStateGroups.groupOf(FOLLOWUP_PREPARED), undefined);
  });

  it('8. refuses a view/link FrameOfReferenceUID mismatch', () => {
    const workspace = pairWorkspace();
    const before = snapshot(workspace);
    const link = makeLinkBetween(BASELINE_VIEW, FOLLOWUP_VIEW, MOCK_FOR_UID, MOCK_FOLLOWUP_FOR_UID);
    expectLinkError(() => register(workspace, link), 'LINK_INTER_STUDY_TRANSFORM_FRAME_MISMATCH');
    assertUnchanged(workspace, before);
  });

  it('9. refuses a cycle-closing edge and undirected-view bidirectional link', () => {
    const chain = buildChainWorkspace(2);
    const before = snapshot(chain.workspace);
    const closing = makeLinkBetween(chain.viewIds[2], chain.viewIds[0], MOCK_THIRD_FOR_UID, MOCK_FOLLOWUP_FOR_UID);
    expectLinkError(
      () => register(chain.workspace, closing, chain.preparedIds[2], chain.preparedIds[0]),
      'LINK_PROPAGATION_CYCLE',
    );
    assertUnchanged(chain.workspace, before);

    const pair = pairWorkspace();
    registerBaseline(pair);
    const reversed = makeLinkBetween(FOLLOWUP_VIEW, BASELINE_VIEW, MOCK_FOR_UID, MOCK_FOLLOWUP_FOR_UID);
    expectLinkError(() => register(pair, reversed, FOLLOWUP_PREPARED, BASELINE_PREPARED), 'LINK_PROPAGATION_CYCLE');
  });

  it('10. accepts multiple incoming edges as legal static topology', () => {
    const convergence = buildConvergenceWorkspace();
    assert.equal(convergence.workspace.getPreparedView(convergence.targetPreparedId).links.length, 2);
    assert.equal(convergence.workspace.sharedStateGroups.snapshot().length, 0);
    assert.notEqual(convergence.originViewId as ViewId, null);
  });
});
