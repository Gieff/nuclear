/**
 * NuClear P4.6 — surface layout suite (ADR-010 §5).
 *
 * Pure Node: no DOM, WebGL or Cornerstone. Proves deterministic viewer-grid
 * arithmetic, exact composer-panel geometry, identity-preserving re-layout,
 * fail-closed validation and purity/idempotency. Product seams and constants
 * come from `./fixtures/surface-fixtures.ts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SurfaceId } from '../../packages/shared-types/src/index.js';
import type { SurfaceHostRect, SurfaceLayoutRequest } from '../../packages/view-engine/src/surfaces/types.js';
import {
  SURFACE_A,
  SurfaceLayoutManager,
  expectSurfaceError,
  makeSurfaceIds,
} from './fixtures/surface-fixtures.ts';

const HOST: SurfaceHostRect = { x: 0, y: 0, width: 400, height: 320 };

function expectLayoutInvalid(run: () => unknown, field: string): void {
  expectSurfaceError(run, 'SURFACE_LAYOUT_INVALID', field);
}

describe('NuClear P4.6 — surface layout (ADR-010 §5)', () => {
  it('a. lays out a 4x4 grid with exact, deterministic row-major rects', () => {
    const manager = new SurfaceLayoutManager();
    const surfaceIds = makeSurfaceIds(16);
    const result = manager.layout({ kind: 'viewer-grid', host: HOST, columns: 4, rows: 4, surfaceIds });

    assert.equal(result.kind, 'viewer-grid');
    assert.equal(result.placements.length, 16);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.placements), true);
    assert.equal(Object.isFrozen(result.placements[0].rect), true);

    assert.deepEqual(result.placements.map((placement) => placement.surfaceId), surfaceIds, 'order and identity preserved');
    assert.deepEqual(result.placements[0], { surfaceId: surfaceIds[0], rect: { x: 0, y: 0, width: 100, height: 80 } });
    assert.deepEqual(result.placements[1].rect, { x: 100, y: 0, width: 100, height: 80 });
    assert.deepEqual(result.placements[4].rect, { x: 0, y: 80, width: 100, height: 80 });
    assert.deepEqual(result.placements[15].rect, { x: 300, y: 240, width: 100, height: 80 });

    const withGap = manager.layout({ kind: 'viewer-grid', host: HOST, columns: 4, rows: 4, surfaceIds, gap: 10 });
    assert.deepEqual(withGap.placements[0].rect, { x: 0, y: 0, width: 92.5, height: 72.5 });
    assert.deepEqual(withGap.placements[1].rect, { x: 102.5, y: 0, width: 92.5, height: 72.5 });
    assert.deepEqual(withGap.placements[4].rect, { x: 0, y: 82.5, width: 92.5, height: 72.5 });
    assert.deepEqual(withGap.placements[15].rect, { x: 307.5, y: 247.5, width: 92.5, height: 72.5 });
  });

  it('b. composer-panel returns exactly the host rect without freezing the caller host', () => {
    const manager = new SurfaceLayoutManager();
    const host: SurfaceHostRect = { x: 12, y: 34, width: 200, height: 150 };
    const result = manager.layout({ kind: 'composer-panel', host, surfaceId: SURFACE_A });

    assert.equal(result.kind, 'composer-panel');
    assert.equal(result.placements.length, 1);
    assert.equal(result.placements[0].surfaceId, SURFACE_A);
    assert.deepEqual(result.placements[0].rect, { x: 12, y: 34, width: 200, height: 150 });
    assert.notEqual(result.placements[0].rect, host, 'the result rect must be a fresh object');
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.placements[0].rect), true);
    assert.equal(Object.isFrozen(host), false, 'the caller host must not be frozen as a side effect');
  });

  it('c. re-layout 2x2 then 4x1 preserves surface identity while rects change', () => {
    const manager = new SurfaceLayoutManager();
    const surfaceIds = makeSurfaceIds(4);
    const first = manager.layout({ kind: 'viewer-grid', host: HOST, columns: 2, rows: 2, surfaceIds });
    const second = manager.layout({ kind: 'viewer-grid', host: HOST, columns: 4, rows: 1, surfaceIds });

    assert.deepEqual(first.placements.map((placement) => placement.surfaceId), surfaceIds);
    assert.deepEqual(second.placements.map((placement) => placement.surfaceId), surfaceIds);
    assert.notDeepEqual(
      first.placements.map((placement) => placement.rect),
      second.placements.map((placement) => placement.rect),
      'the geometry must actually change',
    );
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(second), true);
  });

  it('d. refuses malformed host dimensions, grid dimensions, ids and gaps', () => {
    const manager = new SurfaceLayoutManager();
    const ids4 = makeSurfaceIds(4);
    const base = { kind: 'viewer-grid', host: HOST, columns: 2, rows: 2, surfaceIds: ids4 } as const;

    expectLayoutInvalid(() => manager.layout({ ...base, host: { ...HOST, x: Number.NaN } }), 'host.x');
    expectLayoutInvalid(() => manager.layout({ ...base, host: { ...HOST, y: Number.POSITIVE_INFINITY } }), 'host.y');
    expectLayoutInvalid(() => manager.layout({ ...base, host: { ...HOST, width: 0 } }), 'host.width');
    expectLayoutInvalid(() => manager.layout({ ...base, host: { ...HOST, width: Number.NaN } }), 'host.width');
    expectLayoutInvalid(() => manager.layout({ ...base, host: { ...HOST, width: -10 } }), 'host.width');
    expectLayoutInvalid(() => manager.layout({ ...base, host: { ...HOST, height: 0 } }), 'host.height');
    expectLayoutInvalid(() => manager.layout({ ...base, host: { ...HOST, height: -1 } }), 'host.height');

    expectLayoutInvalid(() => manager.layout({ ...base, columns: 0 }), 'columns');
    expectLayoutInvalid(() => manager.layout({ ...base, columns: 5 }), 'columns');
    expectLayoutInvalid(() => manager.layout({ ...base, columns: 1.5 }), 'columns');
    expectLayoutInvalid(() => manager.layout({ ...base, rows: 0, surfaceIds: [] }), 'rows');
    expectLayoutInvalid(() => manager.layout({ ...base, rows: 5 }), 'rows');
    expectLayoutInvalid(() => manager.layout({ ...base, rows: 2.5 }), 'rows');

    expectLayoutInvalid(() => manager.layout({ ...base, surfaceIds: makeSurfaceIds(3) }), 'surfaceIds');
    expectLayoutInvalid(
      () => manager.layout({ ...base, surfaceIds: [ids4[0], ids4[1], ids4[0], ids4[3]] }),
      'surfaceIds',
    );
    expectLayoutInvalid(() => manager.layout({ ...base, surfaceIds: ['', ids4[1], ids4[2], ids4[3]] as SurfaceId[] }), 'surfaceIds');
    expectLayoutInvalid(() => manager.layout({ ...base, surfaceIds: ['  ', ids4[1], ids4[2], ids4[3]] as SurfaceId[] }), 'surfaceIds');

    expectLayoutInvalid(() => manager.layout({ ...base, gap: -1 }), 'gap');
    expectLayoutInvalid(() => manager.layout({ ...base, gap: Number.NaN }), 'gap');
    expectLayoutInvalid(() => manager.layout({ ...base, gap: HOST.width }), 'gap');
    expectLayoutInvalid(() => manager.layout({ ...base, gap: HOST.height }), 'gap');

    expectLayoutInvalid(
      () => manager.layout({ kind: 'composer-panel', host: HOST, surfaceId: '' as SurfaceId }),
      'surfaceId',
    );
    expectLayoutInvalid(
      () => manager.layout({ kind: 'composer-panel', host: { ...HOST, width: 0 }, surfaceId: SURFACE_A }),
      'host.width',
    );
  });

  it('e. is pure and idempotent: repeated calls deep-equal and the request is not mutated', () => {
    const manager = new SurfaceLayoutManager();
    const request: SurfaceLayoutRequest = {
      kind: 'viewer-grid',
      host: { ...HOST },
      columns: 2,
      rows: 2,
      surfaceIds: makeSurfaceIds(4),
      gap: 4,
    };
    const snapshot = structuredClone(request);
    const first = manager.layout(request);
    const second = manager.layout(request);

    assert.deepEqual(first, second, 'identical requests yield deep-equal results');
    assert.notEqual(first, second, 'each call returns a fresh frozen result');
    assert.deepEqual(request, snapshot, 'the request object is never mutated');
    assert.equal(Object.isFrozen(request.host), false, 'the request host is not frozen');
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(second), true);
  });

  it('f. bounds the grid gap so every cell stays strictly positive', () => {
    const manager = new SurfaceLayoutManager();
    const ids16 = makeSurfaceIds(16);
    const grid4x4 = { kind: 'viewer-grid', host: HOST, columns: 4, rows: 4, surfaceIds: ids16 } as const;

    // For n >= 3, `gap < host.width/height` is not sufficient: gap*(n-1) can
    // exceed the host and yield a negative cell. 4x4, width 400, gap 300.
    expectLayoutInvalid(() => manager.layout({ ...grid4x4, gap: 300 }), 'gap');

    // Positive boundary: gap*(4-1) = 297 < 400 and < 320, so a positive cell
    // survives — (400-297)/4 = 25.75 wide, (320-297)/4 = 5.75 high.
    const accepted = manager.layout({ ...grid4x4, gap: 99 });
    assert.equal(accepted.placements.length, 16);
    assert.deepEqual(accepted.placements[0].rect, { x: 0, y: 0, width: 25.75, height: 5.75 });
    assert.deepEqual(accepted.placements[15].rect, { x: 374.25, y: 314.25, width: 25.75, height: 5.75 });
    assert.equal(Object.isFrozen(accepted), true);
  });

  it('g. refuses untyped runtime requests and unknown kinds with SURFACE_LAYOUT_INVALID', () => {
    const manager = new SurfaceLayoutManager();
    expectLayoutInvalid(() => manager.layout(null as never), 'request');
    expectLayoutInvalid(() => manager.layout(undefined as never), 'request');
    expectLayoutInvalid(() => manager.layout('not-a-request' as never), 'request');
    expectLayoutInvalid(
      () => manager.layout({ kind: 'grid', host: HOST, columns: 2, rows: 2, surfaceIds: makeSurfaceIds(4) } as never),
      'kind',
    );
    expectLayoutInvalid(
      () => manager.layout({ kind: 'composer', host: HOST, surfaceId: SURFACE_A } as never),
      'kind',
    );
    // Untyped payloads with a valid `kind` but a missing nested member must also
    // fail closed with a typed refusal, never a bare TypeError.
    expectLayoutInvalid(
      () => manager.layout({ kind: 'viewer-grid', columns: 2, rows: 2, surfaceIds: makeSurfaceIds(4) } as never),
      'host',
    );
    expectLayoutInvalid(
      () => manager.layout({ kind: 'viewer-grid', host: HOST, columns: 2, rows: 2 } as never),
      'surfaceIds',
    );
    expectLayoutInvalid(
      () => manager.layout({ kind: 'composer-panel' } as never),
      'host',
    );
  });

  it('h. refuses a subnormal host whose cells would underflow to zero', () => {
    const manager = new SurfaceLayoutManager();
    expectLayoutInvalid(
      () =>
        manager.layout({
          kind: 'viewer-grid',
          host: { x: 0, y: 0, width: Number.MIN_VALUE, height: Number.MIN_VALUE },
          columns: 4,
          rows: 4,
          surfaceIds: makeSurfaceIds(16),
        }),
      'host',
    );
  });
});
