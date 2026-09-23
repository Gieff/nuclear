/**
 * NuClear P4.4b — chain/convergence inter-study fixtures.
 *
 * Kept separate from `inter-study-fixtures.ts` to respect the universal file
 * size limit; both import the real TypeScript product sources through the
 * shared `ts-resolve-hook`. Pure Node: no DOM, no WebGL, no Cornerstone.
 */
import type {
  FrameOfReferenceUID,
  ImagingAsset,
  InterStudyLink,
  PreparedViewId,
  StateLock,
  ViewId,
} from '../../../packages/shared-types/src/index.js';
import {
  MOCK_FOLLOWUP_FOR_UID,
  MOCK_FOR_UID,
  MOCK_THIRD_FOR_UID,
  makeLinkBetween,
  makePreparedView,
  mockCtAsset,
  mockFollowupAsset,
  mockThirdFrameAsset,
  newInterStudyWorkspace,
  type Workspace,
} from './inter-study-fixtures.ts';

const CHAIN_FRAMES: readonly FrameOfReferenceUID[] = [
  MOCK_FOLLOWUP_FOR_UID,
  MOCK_FOR_UID,
  MOCK_THIRD_FOR_UID,
];

function frameAt(index: number): FrameOfReferenceUID {
  return CHAIN_FRAMES[index % CHAIN_FRAMES.length];
}

function assetAt(frame: FrameOfReferenceUID): ImagingAsset {
  if (frame === MOCK_FOLLOWUP_FOR_UID) return mockFollowupAsset;
  if (frame === MOCK_THIRD_FOR_UID) return mockThirdFrameAsset;
  return mockCtAsset;
}

export interface ChainOptions {
  readonly outOfDomainBehavior?: 'clamp' | 'hide' | 'warn';
  readonly lockedViewIndices?: readonly number[];
}

export interface ChainWorkspace {
  readonly workspace: Workspace;
  readonly viewIds: readonly ViewId[];
  readonly preparedIds: readonly PreparedViewId[];
  readonly links: readonly InterStudyLink[];
}

/** Linear chain `view0 -> view1 -> ... -> view{hops}` over three distinct frames. */
export function buildChainWorkspace(hops: number, options: ChainOptions = {}): ChainWorkspace {
  const behavior = options.outOfDomainBehavior ?? 'clamp';
  const locked = new Set(options.lockedViewIndices ?? []);
  const workspace = newInterStudyWorkspace();
  const viewIds: ViewId[] = [];
  const preparedIds: PreparedViewId[] = [];
  for (let index = 0; index <= hops; index += 1) {
    const viewId = `view-chain-${index}` as ViewId;
    const preparedViewId = `prepared-chain-${index}` as PreparedViewId;
    viewIds.push(viewId);
    preparedIds.push(preparedViewId);
    workspace.registerPreparedView(
      makePreparedView({
        preparedViewId,
        viewId,
        frameOfReferenceUID: frameAt(index),
        asset: assetAt(frameAt(index)),
        ...(locked.has(index) ? { locks: [{ state: 'spatial', owner: 'user', locked: true } as StateLock] } : {}),
      }),
    );
  }
  const links: InterStudyLink[] = [];
  for (let index = 0; index < hops; index += 1) {
    const registered = workspace.registerInterStudyLink({
      link: makeLinkBetween(viewIds[index], viewIds[index + 1], frameAt(index), frameAt(index + 1), {
        outOfDomainBehavior: behavior,
      }),
      sourcePreparedViewId: preparedIds[index],
      targetPreparedViewId: preparedIds[index + 1],
    });
    links.push(registered.link);
  }
  return { workspace, viewIds, preparedIds, links };
}

export interface ConvergenceWorkspace {
  readonly workspace: Workspace;
  readonly originViewId: ViewId;
  readonly originPreparedId: PreparedViewId;
  readonly targetPreparedId: PreparedViewId;
}

/** `a -> b -> d`, `a -> c -> d` (legal at rest; one propagation converges on d). */
export function buildConvergenceWorkspace(): ConvergenceWorkspace {
  const workspace = newInterStudyWorkspace();
  const name = (suffix: string): { viewId: ViewId; preparedViewId: PreparedViewId } => ({
    viewId: `view-conv-${suffix}` as ViewId,
    preparedViewId: `prepared-conv-${suffix}` as PreparedViewId,
  });
  const a = name('a');
  const b = name('b');
  const c = name('c');
  const d = name('d');
  const nodes: ReadonlyArray<readonly [{ viewId: ViewId; preparedViewId: PreparedViewId }, FrameOfReferenceUID, ImagingAsset]> = [
    [a, MOCK_FOLLOWUP_FOR_UID, mockFollowupAsset],
    [b, MOCK_FOR_UID, mockCtAsset],
    [c, MOCK_FOR_UID, mockCtAsset],
    [d, MOCK_FOLLOWUP_FOR_UID, mockFollowupAsset],
  ];
  const frameOf = new Map<ViewId, FrameOfReferenceUID>();
  for (const [node, frame, asset] of nodes) {
    frameOf.set(node.viewId, frame);
    workspace.registerPreparedView(
      makePreparedView({
        preparedViewId: node.preparedViewId,
        viewId: node.viewId,
        frameOfReferenceUID: frame,
        asset,
      }),
    );
  }
  const edges: ReadonlyArray<readonly [ViewId, ViewId]> = [
    [a.viewId, b.viewId],
    [a.viewId, c.viewId],
    [b.viewId, d.viewId],
    [c.viewId, d.viewId],
  ];
  const preparedOf = new Map<ViewId, PreparedViewId>(nodes.map(([node]) => [node.viewId, node.preparedViewId]));
  for (const [sourceViewId, targetViewId] of edges) {
    const sourceFrame = frameOf.get(sourceViewId) as FrameOfReferenceUID;
    const targetFrame = frameOf.get(targetViewId) as FrameOfReferenceUID;
    workspace.registerInterStudyLink({
      link: makeLinkBetween(sourceViewId, targetViewId, sourceFrame, targetFrame),
      sourcePreparedViewId: preparedOf.get(sourceViewId) as PreparedViewId,
      targetPreparedViewId: preparedOf.get(targetViewId) as PreparedViewId,
    });
  }
  return { workspace, originViewId: a.viewId, originPreparedId: a.preparedViewId, targetPreparedId: d.preparedViewId };
}
