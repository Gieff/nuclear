/**
 * NuClear P4.1 — shared fixtures for the pure `ImagingWorkspace` core suite.
 *
 * Registers the repository `ts-resolve-hook` so the real TypeScript product
 * sources can be imported by value, then re-exports them together with the
 * synthetic clinical contract fixtures. Pure Node: no DOM, no WebGL, no
 * Cornerstone.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';

import type {
  AssetId,
  ResourceDemand,
  ViewGroup,
  ViewSlot,
} from '../../../packages/shared-types/src/index.js';
import type { ViewSlotLayout } from '../../../packages/view-engine/src/workspace/view-slot-registry.js';
import {
  MOCK_STUDY_UID,
  mockCtAsset,
  mockPetAsset,
  mockStudyReference,
} from '../../fixtures/clinical-contracts.fixture.ts';

register(new URL('../../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const workspaceModule = await import('../../../packages/view-engine/src/workspace/index.ts');

export const {
  VIEW_SLOT_ROLES,
  MAX_VIEW_GROUPS,
  MAX_VIEW_SLOTS,
  createDefaultViewSlotLayout,
  ViewSlotRegistry,
  ImagingWorkspace,
  WorkspaceError,
} = workspaceModule;

export { MOCK_STUDY_UID, mockCtAsset, mockPetAsset, mockStudyReference };

/** String-union mirror of the failure codes emitted by `WorkspaceError`. */
export type WorkspaceErrorCode = InstanceType<typeof WorkspaceError>['code'];

/** A small, dependency-free demand declaration for slot tests. */
export function makeDemand(
  assetId: AssetId = mockCtAsset.id,
  priority: ResourceDemand['priority'] = 'visible-interactive',
): ResourceDemand {
  return { assetId, priority, requiredTiers: ['gpu-ready'] };
}

/** Mutable structural copy of the default layout, used to build invalid cases. */
export interface MutableLayout {
  groups: ViewGroup[];
  slots: ViewSlot[];
}

export function mutableDefaultLayout(): MutableLayout {
  return JSON.parse(JSON.stringify(createDefaultViewSlotLayout())) as MutableLayout;
}

export function asLayout(layout: MutableLayout): ViewSlotLayout {
  return layout as unknown as ViewSlotLayout;
}

export function expectWorkspaceError(run: () => unknown, code: WorkspaceErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(
      error instanceof WorkspaceError,
      `expected WorkspaceError, got ${String(error)}`,
    );
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    return true;
  });
}
