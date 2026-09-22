/**
 * @nuclear/view-engine — pure surface geometry (P4.6, ADR-010 §5).
 *
 * `SurfaceLayoutManager` computes host rectangles only. It never creates,
 * destroys or reparents a DOM node, never touches a canvas or WebGL context,
 * and assigns no physical unit to the numbers it receives: the host rectangle
 * is in caller-supplied units. The result is frozen and deterministic, and it
 * preserves the requested `surfaceId`s (same order, same identity) across any
 * re-layout, so a Viewer→Composer move never changes surface identity.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type { SurfaceId } from '@nuclear/shared-types';
import { SurfaceError } from './errors.js';
import type {
  SurfaceHostRect,
  SurfaceLayoutRequest,
  SurfaceLayoutResult,
  SurfacePlacement,
} from './types.js';
import { deepFreeze } from '../internal/deep-freeze.js';

/** Largest supported grid edge, matching the 4×4 logical surface layout. */
const MAX_GRID_DIMENSION = 4;

function fail(field: string, detail: string): never {
  throw new SurfaceError(
    'SURFACE_LAYOUT_INVALID',
    `Surface layout field '${field}' ${detail}. Remediation: provide a finite host rectangle with positive width/height, integer columns/rows between 1 and ${MAX_GRID_DIMENSION} with exactly columns*rows unique non-blank surface ids, and (when present) a finite gap >= 0 that satisfies gap*(columns-1) < host.width and gap*(rows-1) < host.height.`,
  );
}

function assertFiniteGeometry(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    fail(field, `must be finite after layout arithmetic, computed ${String(value)}; the host magnitude or grid geometry is too large for a representable rectangle`);
  }
}

/** Every published rectangle member must be finite (fail-closed). */
function assertFiniteRect(rect: SurfaceHostRect): void {
  assertFiniteGeometry(rect.x, 'rect.x');
  assertFiniteGeometry(rect.y, 'rect.y');
  assertFiniteGeometry(rect.width, 'rect.width');
  assertFiniteGeometry(rect.height, 'rect.height');
}

function assertHost(host: SurfaceHostRect): void {
  // Untyped runtime callers must fail closed with a typed refusal rather than
  // leaking a bare TypeError from a property access on a missing host.
  if (host === null || typeof host !== 'object') {
    fail('host', `must be a non-null host rectangle object, received ${String(host)}`);
  }
  if (typeof host.x !== 'number' || !Number.isFinite(host.x)) fail('host.x', `must be a finite number, received ${String(host.x)}`);
  if (typeof host.y !== 'number' || !Number.isFinite(host.y)) fail('host.y', `must be a finite number, received ${String(host.y)}`);
  if (typeof host.width !== 'number' || !Number.isFinite(host.width) || host.width <= 0) {
    fail('host.width', `must be a finite number greater than zero, received ${String(host.width)}`);
  }
  if (typeof host.height !== 'number' || !Number.isFinite(host.height) || host.height <= 0) {
    fail('host.height', `must be a finite number greater than zero, received ${String(host.height)}`);
  }
}

function assertGridDimension(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_GRID_DIMENSION) {
    fail(field, `must be an integer between 1 and ${MAX_GRID_DIMENSION}, received ${String(value)}`);
  }
}

function assertSurfaceIds(surfaceIds: readonly SurfaceId[], expected: number): void {
  // Untyped runtime callers must fail closed with a typed refusal rather than
  // leaking a bare TypeError from `.length` on a missing array.
  if (!Array.isArray(surfaceIds)) {
    fail('surfaceIds', `must be an array of surface ids, received ${String(surfaceIds)}`);
  }
  if (surfaceIds.length !== expected) {
    fail('surfaceIds', `must contain exactly columns*rows = ${expected} entries, received ${surfaceIds.length}`);
  }
  const seen = new Set<string>();
  for (const surfaceId of surfaceIds) {
    if (typeof surfaceId !== 'string' || surfaceId.trim().length === 0) {
      fail('surfaceIds', `must contain only non-blank identifiers, received ${JSON.stringify(surfaceId)}`);
    }
    if (seen.has(surfaceId)) fail('surfaceIds', `must not repeat surface id '${surfaceId}'`);
    seen.add(surfaceId);
  }
}

function assertGap(gap: number, host: SurfaceHostRect, columns: number, rows: number): void {
  if (typeof gap !== 'number' || !Number.isFinite(gap) || gap < 0) {
    fail('gap', `must be a finite number greater than or equal to zero, received ${String(gap)}`);
  }
  // The cell extent is (host - gap*(n-1))/n, so a gap is only valid when the
  // total inter-cell spacing leaves a strictly positive cell. `gap < host`
  // alone is insufficient for n >= 3 (e.g. 4x4, width 400, gap 300).
  if (gap * (columns - 1) >= host.width) {
    fail('gap', `must satisfy gap*(columns-1) < host.width (${host.width}), received gap=${gap} with columns=${columns}`);
  }
  if (gap * (rows - 1) >= host.height) {
    fail('gap', `must satisfy gap*(rows-1) < host.height (${host.height}), received gap=${gap} with rows=${rows}`);
  }
}

/** Stateless, pure geometry for viewer grids and composer panels. */
export class SurfaceLayoutManager {
  /** Lays out a surface set; returns a frozen, deterministic result. */
  layout(request: SurfaceLayoutRequest): SurfaceLayoutResult {
    // Untyped runtime callers must still fail closed with a typed refusal
    // rather than leaking a bare TypeError from a property access.
    if (request === null || typeof request !== 'object') {
      fail('request', `must be a non-null surface layout request object, received ${String(request)}`);
    }
    const runtimeKind = (request as { readonly kind?: unknown }).kind;
    if (runtimeKind !== 'viewer-grid' && runtimeKind !== 'composer-panel') {
      fail('kind', `must be 'viewer-grid' or 'composer-panel', received ${JSON.stringify(runtimeKind)}`);
    }
    if (request.kind === 'viewer-grid') {
      return this.layoutViewerGrid(request);
    }
    return this.layoutComposerPanel(request);
  }

  private layoutViewerGrid(request: Extract<SurfaceLayoutRequest, { readonly kind: 'viewer-grid' }>): SurfaceLayoutResult {
    const { host, columns, rows, surfaceIds } = request;
    assertHost(host);
    assertGridDimension(columns, 'columns');
    assertGridDimension(rows, 'rows');
    assertSurfaceIds(surfaceIds, columns * rows);
    if (request.gap !== undefined) assertGap(request.gap, host, columns, rows);
    const gap = request.gap ?? 0;
    const cellWidth = (host.width - gap * (columns - 1)) / columns;
    const cellHeight = (host.height - gap * (rows - 1)) / rows;
    // Post-condition: the validated gap leaves a strictly positive cell for any
    // representable host except a subnormal-magnitude host where the division
    // underflows to zero. Refuse rather than emit zero-size geometry.
    if (!(cellWidth > 0) || !(cellHeight > 0)) {
      fail('host', `must be large enough that every grid cell stays strictly positive, computed cell ${cellWidth}x${cellHeight} for columns=${columns}, rows=${rows}`);
    }
    const placements: SurfacePlacement[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const rect: SurfaceHostRect = {
          x: host.x + column * (cellWidth + gap),
          y: host.y + row * (cellHeight + gap),
          width: cellWidth,
          height: cellHeight,
        };
        // Finiteness post-condition: individually finite host values can still
        // overflow when combined (e.g. x + column*(cell+gap)), so every computed
        // coordinate/dimension is validated before it is published.
        assertFiniteRect(rect);
        placements.push({ surfaceId: surfaceIds[row * columns + column], rect });
      }
    }
    const result: SurfaceLayoutResult = { kind: 'viewer-grid', placements };
    return deepFreeze(result);
  }

  private layoutComposerPanel(request: Extract<SurfaceLayoutRequest, { readonly kind: 'composer-panel' }>): SurfaceLayoutResult {
    const { host, surfaceId } = request;
    assertHost(host);
    if (typeof surfaceId !== 'string' || surfaceId.trim().length === 0) {
      fail('surfaceId', `must be a non-blank identifier, received ${JSON.stringify(surfaceId)}`);
    }
    // A fresh rect (never the caller's host object): the result is frozen, so
    // reusing `host` would freeze the caller's input as a side effect.
    const rect: SurfaceHostRect = { x: host.x, y: host.y, width: host.width, height: host.height };
    assertFiniteRect(rect);
    const result: SurfaceLayoutResult = {
      kind: 'composer-panel',
      placements: [{ surfaceId, rect }],
    };
    return deepFreeze(result);
  }
}
