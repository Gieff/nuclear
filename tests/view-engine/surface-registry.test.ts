/**
 * NuClear P4.6 — viewport surface registry suite (ADR-010 §5).
 *
 * Pure Node: no DOM, WebGL or Cornerstone. Exercises identity/lifecycle
 * stability, the logical 16-surface cap, binding, terminal disposal and
 * fail-closed refusals that leave the registry unchanged. Product seams and
 * constants come from `./fixtures/surface-fixtures.ts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isViewportSurface } from '../contracts/view-validators.ts';
import type { SurfaceId, ViewportId } from '../../packages/shared-types/src/index.js';
import {
  MAX_VIEWPORT_SURFACES,
  SLOT_A,
  SLOT_B,
  SURFACE_A,
  SURFACE_B,
  SurfaceError,
  UNKNOWN_SURFACE,
  UNKNOWN_VIEWPORT,
  VIEWPORT_A,
  VIEWPORT_B,
  VIEW_A,
  ViewportSurfaceRegistry,
  expectSurfaceError,
  makeSurfaceIds,
  surfacesModule,
} from './fixtures/surface-fixtures.ts';

describe('NuClear P4.6 — viewport surface registry (ADR-010 §5)', () => {
  it('a. create stores a frozen available surface with no binding and stable identity', () => {
    const registry = new ViewportSurfaceRegistry();
    const surface = registry.createSurface({ surfaceId: SURFACE_A, viewportId: VIEWPORT_A });

    assert.equal(surface.surfaceId, SURFACE_A);
    assert.equal(surface.viewportId, VIEWPORT_A);
    assert.equal(surface.lifecycle, 'available');
    // Optional binding fields are absent, never present as `undefined`.
    assert.equal('boundSlotId' in surface, false, 'no boundSlotId key before binding');
    assert.equal('boundViewId' in surface, false, 'no boundViewId key before binding');
    assert.equal(Object.isFrozen(surface), true, 'the stored surface is frozen');
    assert.equal(isViewportSurface(surface), true, 'shape satisfies the shared contract validator');

    assert.equal(registry.size, 1);
    assert.equal(registry.hasSurface(SURFACE_A), true);
    assert.equal(registry.getSurface(SURFACE_A), surface, 'reads return the stored value by identity');
    assert.equal(registry.getByViewportId(VIEWPORT_A), surface, 'viewport lookup returns the same identity');
    assert.deepEqual([...registry.listSurfaces()], [surface]);
    assert.deepEqual([...registry.snapshot()], [surface]);
    assert.equal(Object.isFrozen(registry.listSurfaces()), true);
    assert.equal(Object.isFrozen(registry.snapshot()), true);

    assert.throws(() => {
      (surface as { lifecycle: string }).lifecycle = 'hidden';
    }, TypeError);
    assert.equal(registry.getSurface(SURFACE_A).lifecycle, 'available', 'a refused mutation changes nothing');
  });

  it('b. accepts the 16 logical surfaces and refuses the 17th with SURFACE_CAPACITY_EXCEEDED', () => {
    assert.equal(MAX_VIEWPORT_SURFACES, 16, 'the cap is the logical surface limit');
    const registry = new ViewportSurfaceRegistry();
    const ids = makeSurfaceIds(MAX_VIEWPORT_SURFACES);
    for (const surfaceId of ids) {
      registry.createSurface({ surfaceId, viewportId: `viewport-${surfaceId}` as unknown as ViewportId });
    }
    assert.equal(registry.size, MAX_VIEWPORT_SURFACES);

    expectSurfaceError(
      () => registry.createSurface({ surfaceId: 'surface-overflow' as SurfaceId, viewportId: 'viewport-overflow' as unknown as ViewportId }),
      'SURFACE_CAPACITY_EXCEEDED',
    );
    assert.equal(registry.size, MAX_VIEWPORT_SURFACES, 'a refused create leaves capacity unchanged');
  });

  it('c. refuses a duplicate surfaceId and a duplicate viewportId without mutating the registry', () => {
    const registry = new ViewportSurfaceRegistry();
    registry.createSurface({ surfaceId: SURFACE_A, viewportId: VIEWPORT_A });
    const before = registry.snapshot();
    const beforeSurface = registry.getSurface(SURFACE_A);

    expectSurfaceError(
      () => registry.createSurface({ surfaceId: SURFACE_A, viewportId: VIEWPORT_B }),
      'SURFACE_DUPLICATE_ID',
    );
    assert.deepEqual([...registry.snapshot()], [...before]);
    assert.equal(registry.getSurface(SURFACE_A), beforeSurface);

    expectSurfaceError(
      () => registry.createSurface({ surfaceId: SURFACE_B, viewportId: VIEWPORT_A }),
      'SURFACE_DUPLICATE_VIEWPORT_ID',
    );
    assert.deepEqual([...registry.snapshot()], [...before]);
    assert.equal(registry.size, 1);
    assert.equal(registry.hasSurface(SURFACE_B), false, 'the refused surface id was not registered');
  });

  it('d. bind sets slot and/or view, keeps identity, and never mutates the previous object', () => {
    const registry = new ViewportSurfaceRegistry();
    const surface = registry.createSurface({ surfaceId: SURFACE_A, viewportId: VIEWPORT_A });

    const boundSlot = registry.bind(SURFACE_A, { boundSlotId: SLOT_A });
    assert.equal(boundSlot.surfaceId, SURFACE_A);
    assert.equal(boundSlot.viewportId, VIEWPORT_A);
    assert.equal(boundSlot.lifecycle, 'available');
    assert.equal(boundSlot.boundSlotId, SLOT_A);
    assert.equal('boundViewId' in boundSlot, false, 'an unset binding field stays absent');
    assert.notEqual(boundSlot, surface, 'bind returns a fresh surface');
    assert.equal(Object.isFrozen(boundSlot), true);
    assert.equal(registry.getSurface(SURFACE_A), boundSlot);
    assert.equal('boundSlotId' in surface, false, 'the previous object is unchanged');

    const rebound = registry.bind(SURFACE_A, { boundSlotId: SLOT_B, boundViewId: VIEW_A });
    assert.equal(rebound.surfaceId, SURFACE_A);
    assert.equal(rebound.viewportId, VIEWPORT_A);
    assert.equal(rebound.boundSlotId, SLOT_B);
    assert.equal(rebound.boundViewId, VIEW_A);
    assert.notEqual(rebound, boundSlot);
    assert.equal(boundSlot.boundSlotId, SLOT_A, 'the previously returned object still shows the old binding');
    assert.equal('boundViewId' in boundSlot, false);
  });

  it('e. unbind clears both binding fields and returns a fresh frozen surface', () => {
    const registry = new ViewportSurfaceRegistry();
    registry.createSurface({ surfaceId: SURFACE_A, viewportId: VIEWPORT_A });
    const bound = registry.bind(SURFACE_A, { boundSlotId: SLOT_A, boundViewId: VIEW_A });

    const unbound = registry.unbind(SURFACE_A);
    assert.equal('boundSlotId' in unbound, false);
    assert.equal('boundViewId' in unbound, false);
    assert.equal(unbound.lifecycle, 'available');
    assert.notEqual(unbound, bound);
    assert.equal(Object.isFrozen(unbound), true);
    assert.equal(bound.boundSlotId, SLOT_A, 'the previously returned object is unchanged');
  });

  it('f. follows available -> mounted -> hidden -> mounted and refuses every other transition', () => {
    const registry = new ViewportSurfaceRegistry();
    registry.createSurface({ surfaceId: SURFACE_A, viewportId: VIEWPORT_A });

    expectSurfaceError(() => registry.hide(SURFACE_A), 'SURFACE_ILLEGAL_TRANSITION');
    const mounted = registry.mount(SURFACE_A);
    assert.equal(mounted.lifecycle, 'mounted');
    assert.equal(mounted.surfaceId, SURFACE_A);
    expectSurfaceError(() => registry.mount(SURFACE_A), 'SURFACE_ILLEGAL_TRANSITION');

    const hidden = registry.hide(SURFACE_A);
    assert.equal(hidden.lifecycle, 'hidden');
    expectSurfaceError(() => registry.hide(SURFACE_A), 'SURFACE_ILLEGAL_TRANSITION');

    const remounted = registry.mount(SURFACE_A);
    assert.equal(remounted.lifecycle, 'mounted');
    assert.equal(registry.getSurface(SURFACE_A), remounted, 'the registry holds the last committed value');
    assert.equal(mounted.lifecycle, 'mounted');
  });

  it('g. dispose clears the binding, is terminal, and blocks mount/hide/bind/unbind', () => {
    const registry = new ViewportSurfaceRegistry();
    registry.createSurface({ surfaceId: SURFACE_A, viewportId: VIEWPORT_A });
    registry.bind(SURFACE_A, { boundSlotId: SLOT_A });
    registry.mount(SURFACE_A);

    const disposed = registry.dispose(SURFACE_A);
    assert.equal(disposed.lifecycle, 'disposed');
    assert.equal('boundSlotId' in disposed, false, 'a disposed surface carries no binding');
    assert.equal('boundViewId' in disposed, false);
    assert.equal(isViewportSurface(disposed), true, 'the disposed surface satisfies the no-binding rule');

    expectSurfaceError(() => registry.dispose(SURFACE_A), 'SURFACE_ILLEGAL_TRANSITION');
    expectSurfaceError(() => registry.mount(SURFACE_A), 'SURFACE_ILLEGAL_TRANSITION');
    expectSurfaceError(() => registry.hide(SURFACE_A), 'SURFACE_ILLEGAL_TRANSITION');
    expectSurfaceError(() => registry.bind(SURFACE_A, { boundViewId: VIEW_A }), 'SURFACE_ILLEGAL_TRANSITION');
    expectSurfaceError(() => registry.unbind(SURFACE_A), 'SURFACE_ILLEGAL_TRANSITION');
    assert.equal(registry.getSurface(SURFACE_A), disposed, 'a refused transition leaves the terminal value');
  });

  it('h. refuses malformed ids, unknown ids and an empty binding', () => {
    const registry = new ViewportSurfaceRegistry();
    expectSurfaceError(
      () => registry.createSurface({ surfaceId: '' as SurfaceId, viewportId: VIEWPORT_A }),
      'SURFACE_MALFORMED',
    );
    expectSurfaceError(
      () => registry.createSurface({ surfaceId: SURFACE_A, viewportId: '   ' as unknown as ViewportId }),
      'SURFACE_MALFORMED',
    );
    assert.equal(registry.size, 0, 'a malformed create registers nothing');

    expectSurfaceError(() => registry.getSurface(UNKNOWN_SURFACE), 'SURFACE_UNKNOWN_ID');
    expectSurfaceError(() => registry.getByViewportId(UNKNOWN_VIEWPORT), 'SURFACE_UNKNOWN_ID');
    expectSurfaceError(() => registry.bind(UNKNOWN_SURFACE, { boundViewId: VIEW_A }), 'SURFACE_UNKNOWN_ID');

    registry.createSurface({ surfaceId: SURFACE_A, viewportId: VIEWPORT_A });
    expectSurfaceError(() => registry.bind(SURFACE_A, {}), 'SURFACE_BINDING_EMPTY');
    assert.equal('boundSlotId' in registry.getSurface(SURFACE_A), false);
  });

  it('i. every refusal leaves the registry byte-for-byte unchanged', () => {
    const registry = new ViewportSurfaceRegistry();
    registry.createSurface({ surfaceId: SURFACE_A, viewportId: VIEWPORT_A });
    registry.bind(SURFACE_A, { boundSlotId: SLOT_A, boundViewId: VIEW_A });
    registry.mount(SURFACE_A);
    const snapshotBefore = registry.snapshot();
    const surfaceBefore = registry.getSurface(SURFACE_A);

    expectSurfaceError(() => registry.getSurface(UNKNOWN_SURFACE), 'SURFACE_UNKNOWN_ID');
    expectSurfaceError(() => registry.createSurface({ surfaceId: SURFACE_A, viewportId: VIEWPORT_A }), 'SURFACE_DUPLICATE_ID');
    expectSurfaceError(() => registry.createSurface({ surfaceId: SURFACE_B, viewportId: VIEWPORT_A }), 'SURFACE_DUPLICATE_VIEWPORT_ID');
    expectSurfaceError(() => registry.mount(SURFACE_A), 'SURFACE_ILLEGAL_TRANSITION');
    expectSurfaceError(() => registry.bind(SURFACE_A, {}), 'SURFACE_BINDING_EMPTY');

    assert.equal(registry.size, 1);
    assert.equal(registry.getSurface(SURFACE_A), surfaceBefore, 'surface identity is untouched by refusals');
    assert.deepEqual([...registry.snapshot()], [...snapshotBefore], 'snapshot is deep-equal after every refusal');
    assert.equal(registry.getSurface(SURFACE_A).lifecycle, 'mounted');
    assert.equal(registry.getSurface(SURFACE_A).boundSlotId, SLOT_A);
  });

  it('j. surfaces module leaks no WebGL/DOM symbol and the cap is logical', () => {
    assert.equal(MAX_VIEWPORT_SURFACES, 16, 'the 16 cap is a logical surface count, not a WebGL-context count');
    const exported = Object.keys(surfacesModule);
    assert.ok(exported.includes('ViewportSurfaceRegistry'));
    assert.ok(exported.includes('SurfaceLayoutManager'));
    for (const name of exported) {
      assert.equal(/webgl|context|document|window/i.test(name), false, `unexpected browser/WebGL export '${name}'`);
    }
  });

  it('k. capacity message is an honest lifetime identity budget, not a disposal remedy', () => {
    const registry = new ViewportSurfaceRegistry();
    for (const surfaceId of makeSurfaceIds(MAX_VIEWPORT_SURFACES)) {
      registry.createSurface({ surfaceId, viewportId: `viewport-${surfaceId}` as unknown as ViewportId });
    }
    let message = '';
    assert.throws(
      () =>
        registry.createSurface({
          surfaceId: 'surface-overflow' as SurfaceId,
          viewportId: 'viewport-overflow' as unknown as ViewportId,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SurfaceError, `expected SurfaceError, got ${String(error)}`);
        assert.equal(error.code, 'SURFACE_CAPACITY_EXCEEDED');
        message = error.message;
        return true;
      },
    );
    assert.match(message, /lifetime/i, 'the message names the lifetime identity budget');
    assert.equal(/dispose/i.test(message), false, 'the message must not suggest disposal as a remedy');
    assert.match(message, /not a WebGL-context count/i, 'the logical-vs-WebGL honesty is preserved');
    assert.equal(registry.size, MAX_VIEWPORT_SURFACES, 'a refused create leaves the budget unchanged');
  });

  it('l. fails closed on untyped createSurface input instead of leaking a TypeError', () => {
    const registry = new ViewportSurfaceRegistry();
    expectSurfaceError(() => registry.createSurface(null as never), 'SURFACE_MALFORMED');
    expectSurfaceError(() => registry.createSurface(undefined as never), 'SURFACE_MALFORMED');
    expectSurfaceError(() => registry.createSurface('not-an-input' as never), 'SURFACE_MALFORMED');
    assert.equal(registry.size, 0, 'no malformed input was registered');
  });

  it('m. fails closed on untyped bind bindings and leaves the surface unchanged', () => {
    const registry = new ViewportSurfaceRegistry();
    const surface = registry.createSurface({ surfaceId: SURFACE_A, viewportId: VIEWPORT_A });
    expectSurfaceError(() => registry.bind(SURFACE_A, null as never), 'SURFACE_MALFORMED');
    expectSurfaceError(() => registry.bind(SURFACE_A, undefined as never), 'SURFACE_MALFORMED');
    expectSurfaceError(() => registry.bind(SURFACE_A, 'not-a-binding' as never), 'SURFACE_MALFORMED');
    // A present binding field must be a non-blank identifier, not a number/blank.
    expectSurfaceError(() => registry.bind(SURFACE_A, { boundSlotId: 42 as never }), 'SURFACE_MALFORMED');
    expectSurfaceError(() => registry.bind(SURFACE_A, { boundViewId: '  ' as never }), 'SURFACE_MALFORMED');
    assert.equal(registry.getSurface(SURFACE_A), surface, 'refused binds leave the surface by identity');
    assert.equal('boundSlotId' in surface, false, 'no binding was applied');
  });
});
