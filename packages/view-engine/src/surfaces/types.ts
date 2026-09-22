/**
 * @nuclear/view-engine — persistent viewport surface & layout contracts (P4.6).
 *
 * `ViewportSurface` identity, lifecycle and placement are deliberately
 * decoupled from renderer residency. The 16-surface cap below is **logical**:
 * it counts distinct `ViewportSurface` records, never WebGL contexts, canvases
 * or DOM nodes. The renderer backend owns the effective context count
 * (architecture v3 §2.3, §29.1; ADR-010 §5).
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type { SurfaceId } from '@nuclear/shared-types';

/**
 * Maximum number of persistent, logical `ViewportSurface` records.
 *
 * This is an identity/lifecycle limit, **not** a WebGL-context count: a
 * surface may be `available`/`hidden` and have no resident renderer context,
 * and one context may host different surfaces over time. See ADR-010 §5.
 */
export const MAX_VIEWPORT_SURFACES = 16;

/**
 * Host placement rectangle expressed in **caller-supplied units**.
 *
 * `view-engine` assigns no physical meaning to these numbers: they are neither
 * millimetres nor device pixels. The UI host decides the unit and the mapping
 * to screen space; this module only computes deterministic arithmetic over the
 * rectangle it is given.
 */
export interface SurfaceHostRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A rectangular placement of one surface inside a host. */
export interface SurfacePlacement {
  readonly surfaceId: SurfaceId;
  readonly rect: SurfaceHostRect;
}

/**
 * A pure layout request. `viewer-grid` distributes a set of surfaces over a
 * row-major grid; `composer-panel` places a single surface over the whole host.
 */
export type SurfaceLayoutRequest =
  | {
      readonly kind: 'viewer-grid';
      readonly host: SurfaceHostRect;
      readonly columns: number;
      readonly rows: number;
      readonly surfaceIds: readonly SurfaceId[];
      readonly gap?: number;
    }
  | {
      readonly kind: 'composer-panel';
      readonly host: SurfaceHostRect;
      readonly surfaceId: SurfaceId;
    };

/** Frozen, deterministic layout output. `surfaceIds` keep the requested order. */
export interface SurfaceLayoutResult {
  readonly kind: SurfaceLayoutRequest['kind'];
  readonly placements: readonly SurfacePlacement[];
}
