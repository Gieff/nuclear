/**
 * NuClear P4.3 — shared-state group fixtures (ADR-011 §3 + binding addendum).
 *
 * Pure Node: no DOM, WebGL or Cornerstone. This module statically imports the
 * shared workspace fixtures (which register the `.js`→`.ts` resolve hook)
 * before dynamically importing the real product sources by value, then
 * re-exports the shared-state and prepared-view seams together with the
 * constants, types and builders shared by the identity and invariants suites.
 */
import type {
  CameraState,
  PreparedView,
  PreparedViewId,
  SpatialState,
} from '../../../packages/shared-types/src/index.js';
import type { SharedStateGroupId } from '../../../packages/view-engine/src/shared-state/types.js';
import {
  mockFusionView,
  mockFusionViewProvenance,
  mockPetView,
  mockPetViewProvenance,
} from '../../fixtures/view-contracts.fixture.ts';
import {
  ImagingWorkspace,
  mockCtAsset,
  mockPetAsset,
  mockStudyReference,
} from './workspace-fixtures.ts';

const sharedStateModule = await import('../../../packages/view-engine/src/shared-state/index.ts');
const preparedViewModule = await import('../../../packages/view-engine/src/prepared-view/index.ts');

export const { SharedStateGroupRegistry, SharedStateError } = sharedStateModule;
export const { assemblePreparedView, PreparedViewError, PreparedViewRegistry } = preparedViewModule;

/**
 * Test `j` inspects the module namespaces for leaked internals, so the
 * namespaces themselves are part of the shared fixture surface.
 */
export { sharedStateModule, preparedViewModule };

export const GROUP_A = 'shared-group-a' as SharedStateGroupId;
export const GROUP_B = 'shared-group-b' as SharedStateGroupId;
export const UNKNOWN_GROUP = 'shared-group-missing' as SharedStateGroupId;
export const PET_PREPARED = 'prepared-view-shared-pet' as PreparedViewId;
export const FUSION_PREPARED = 'prepared-view-shared-fusion' as PreparedViewId;
export const UNKNOWN_PREPARED = 'prepared-view-shared-missing' as PreparedViewId;

export type Workspace = InstanceType<typeof ImagingWorkspace>;
export type Pair = { spatial: SpatialState; camera: CameraState };

export function workspaceWithBothAssets(): Workspace {
  const workspace = new ImagingWorkspace();
  workspace.registerStudy(mockStudyReference);
  workspace.registerAsset(mockCtAsset);
  workspace.registerAsset(mockPetAsset);
  return workspace;
}

/** Fresh, mutable spatial/camera values; each test owns its input. */
export function freshPair(): Pair {
  return {
    spatial: structuredClone(mockPetView.spatial),
    camera: structuredClone(mockPetView.camera),
  };
}

export function registerPetView(workspace: Workspace, id: PreparedViewId = PET_PREPARED): PreparedView {
  const view = assemblePreparedView({
    preparedViewId: id,
    state: structuredClone(mockPetView),
    provenance: structuredClone(mockPetViewProvenance),
  });
  workspace.registerPreparedView(view);
  return view;
}

export function registerFusionView(workspace: Workspace, id: PreparedViewId = FUSION_PREPARED): PreparedView {
  const view = assemblePreparedView({
    preparedViewId: id,
    state: structuredClone(mockFusionView),
    provenance: structuredClone(mockFusionViewProvenance),
  });
  workspace.registerPreparedView(view);
  return view;
}
