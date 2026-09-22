/**
 * NuClear P4.6 — viewport-surface fixtures (ADR-010 §5).
 *
 * Pure Node: no DOM, WebGL or Cornerstone. This module statically imports the
 * shared contract fixture first and then the workspace fixtures (which
 * register the `.js`→`.ts` resolve hook) before dynamically importing the real
 * product sources by value, then re-exports the surface seams together with
 * the constants, types and assertion helpers shared by the registry and layout
 * suites. Mirrors `tests/view-engine/fixtures/shared-state-fixtures.ts`.
 */
import assert from 'node:assert/strict';

import type { SurfaceId, ViewId, ViewportId, ViewSlotId } from '../../../packages/shared-types/src/index.js';
import { mockSurface } from '../../fixtures/view-contracts.fixture.ts';
import './workspace-fixtures.ts';

const surfacesModule = await import('../../../packages/view-engine/src/surfaces/index.ts');

export const {
  MAX_VIEWPORT_SURFACES,
  SurfaceError,
  SurfaceLayoutManager,
  ViewportSurfaceRegistry,
} = surfacesModule;

/**
 * The registry suite inspects the module namespace for leaked browser/WebGL
 * symbols, so the namespace itself is part of the shared fixture surface.
 */
export { surfacesModule, mockSurface };

/** String-union mirror of the failure codes emitted by `SurfaceError`. */
export type SurfaceErrorCode = InstanceType<typeof SurfaceError>['code'];

export const SURFACE_A = 'surface-a' as SurfaceId;
export const SURFACE_B = 'surface-b' as SurfaceId;
export const VIEWPORT_A = 'viewport-a' as ViewportId;
export const VIEWPORT_B = 'viewport-b' as ViewportId;
export const SLOT_A = 'slot-a' as ViewSlotId;
export const SLOT_B = 'slot-b' as ViewSlotId;
export const VIEW_A = 'view-a' as ViewId;
export const UNKNOWN_SURFACE = 'surface-missing' as SurfaceId;
export const UNKNOWN_VIEWPORT = 'viewport-missing' as ViewportId;

/** Builds `count` distinct branded surface ids for capacity/layout cases. */
export function makeSurfaceIds(count: number, prefix = 'surface'): SurfaceId[] {
  return Array.from({ length: count }, (_unused, index) => `${prefix}-${index}` as SurfaceId);
}

/** Asserts `run` throws a `SurfaceError` with the exact `code` and a message. */
export function expectSurfaceError(run: () => unknown, code: SurfaceErrorCode, messageIncludes?: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof SurfaceError, `expected SurfaceError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    if (messageIncludes !== undefined) {
      assert.ok(error.message.includes(messageIncludes), `expected message to name '${messageIncludes}', got: ${error.message}`);
    }
    return true;
  });
}
