/**
 * @nuclear/view-engine — persistent viewport surface registry (P4.6, ADR-010 §5).
 *
 * Owns stable `surfaceId`/`viewportId` identity and lifecycle only. It does
 * **not** own a Cornerstone element, a canvas or a WebGL context: the renderer
 * backend keeps those, and the 16-surface cap is logical, never a context
 * count. Reads and transitions return the stored deep-frozen `ViewportSurface`
 * value by identity; rebinding a surface preserves its identity and lifecycle.
 *
 * Scope boundary (deliberate): this registry does **not** cross-validate that a
 * `boundSlotId`/`boundViewId` refers to an entity that exists elsewhere — there
 * is no `ViewId` registry, and the low-level `ViewSlotRegistry.bind` draws the
 * same boundary while the `ImagingWorkspace` facade performs cross-checks.
 * Binding uniqueness (one surface per slot/view) is caller-owned and not
 * enforced here in P4.6.
 *
 * Atomicity: every refusal is raised before any map is mutated, so a refused
 * operation leaves the registry exactly as it was.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type { SurfaceId, ViewId, ViewportId, ViewSlotId, ViewportSurface } from '@nuclear/shared-types';
import { SurfaceError } from './errors.js';
import { MAX_VIEWPORT_SURFACES } from './types.js';
import { deepFreeze } from '../internal/deep-freeze.js';

/** Input accepted by {@link ViewportSurfaceRegistry.createSurface}. */
export interface CreateViewportSurfaceInput {
  readonly surfaceId: SurfaceId;
  readonly viewportId: ViewportId;
}

/**
 * Optional semantic binding of a surface to a logical slot and/or a view.
 * At least one of the two fields must be present (see `bind`).
 */
export interface SurfaceBinding {
  readonly boundSlotId?: ViewSlotId;
  readonly boundViewId?: ViewId;
}

function assertIdentifier(value: unknown, field: string, operation: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SurfaceError(
      'SURFACE_MALFORMED',
      `Surface ${field} is malformed while attempting to ${operation}: expected a non-empty string, received ${JSON.stringify(value)}. Remediation: supply a non-blank SurfaceId/ViewportId before registering the surface.`,
    );
  }
}

/**
 * Builds a `ViewportSurface` value. Unset binding fields are **absent**, never
 * present with an `undefined` value, so the persisted DTO stays JSON-lossless
 * and the `isViewportSurface` disposed rule (`no binding`) holds by shape.
 */
function buildSurface(
  surfaceId: SurfaceId,
  viewportId: ViewportId,
  lifecycle: ViewportSurface['lifecycle'],
  boundSlotId?: ViewSlotId,
  boundViewId?: ViewId,
): ViewportSurface {
  return {
    surfaceId,
    viewportId,
    ...(boundSlotId === undefined ? {} : { boundSlotId }),
    ...(boundViewId === undefined ? {} : { boundViewId }),
    lifecycle,
  };
}

/**
 * Identity/lifecycle registry for persistent `ViewportSurface` records.
 *
 * Capacity is a **lifetime-total logical identity budget**: the 16 entries are
 * distinct persistent identities, `dispose` is terminal, and an identity is
 * never reclaimed or reused. Retiring a surface therefore does not free the
 * budget; there is deliberately no purge/remove API, and a caller must reuse
 * an already-allocated identity rather than expect capacity to return.
 *
 * Composer-binding disclosure (P4.6): architecture v3 §8.1/§29.1 describes a
 * surface bound to a `ComposerViewInstance`, but the frozen `ViewportSurface`
 * contract carries only `boundSlotId`/`boundViewId`. A Composer binding is
 * intentionally **not** representable or implemented in P4.6; adding it would
 * require a `shared-types` extension with its own ADR, validator and fixture.
 * This registry does not invent a new binding field.
 *
 * @see The module jsdoc for the deliberate scope boundary (no slot/view
 * existence cross-check, no binding-uniqueness enforcement in P4.6).
 */
export class ViewportSurfaceRegistry {
  private readonly surfaceById = new Map<SurfaceId, ViewportSurface>();
  private readonly surfaceIdByViewportId = new Map<ViewportId, SurfaceId>();
  private readonly surfaceOrder: SurfaceId[] = [];

  /**
   * Registers a new `available` surface. Validation order is: malformed input,
   * malformed ids, duplicate `surfaceId`, duplicate `viewportId`, then logical
   * capacity.
   */
  createSurface(input: CreateViewportSurfaceInput): ViewportSurface {
    if (input === null || typeof input !== 'object') {
      throw new SurfaceError(
        'SURFACE_MALFORMED',
        `Surface input is malformed while attempting to create a surface: expected a non-null object carrying surfaceId and viewportId, received ${String(input)}. Remediation: supply a non-blank SurfaceId/ViewportId before registering the surface.`,
      );
    }
    const { surfaceId, viewportId } = input;
    assertIdentifier(surfaceId, 'surfaceId', 'create a surface');
    assertIdentifier(viewportId, 'viewportId', 'create a surface');
    if (this.surfaceById.has(surfaceId)) {
      throw new SurfaceError(
        'SURFACE_DUPLICATE_ID',
        `Viewport surface id '${surfaceId}' is already registered. Remediation: reuse the registered surface or create it under a distinct SurfaceId.`,
      );
    }
    if (this.surfaceIdByViewportId.has(viewportId)) {
      const owner = this.surfaceIdByViewportId.get(viewportId);
      throw new SurfaceError(
        'SURFACE_DUPLICATE_VIEWPORT_ID',
        `Viewport id '${viewportId}' is already owned by surface '${owner}'. Remediation: each stable viewport id may back only one surface; reuse that surface or allocate a distinct ViewportId.`,
      );
    }
    if (this.surfaceById.size >= MAX_VIEWPORT_SURFACES) {
      throw new SurfaceError(
        'SURFACE_CAPACITY_EXCEEDED',
        `Cannot register surface '${surfaceId}': the lifetime-total logical identity budget of ${MAX_VIEWPORT_SURFACES} persistent ViewportSurfaces is already exhausted. This is a lifetime identity budget, not a WebGL-context count: once allocated a surface identity is never reclaimed, and a surface that has reached its terminal lifecycle state retains its identity and does not free this identity budget. Remediation: reuse one of the already-allocated surface identities.`,
      );
    }
    const surface = deepFreeze(buildSurface(surfaceId, viewportId, 'available'));
    this.surfaceById.set(surface.surfaceId, surface);
    this.surfaceIdByViewportId.set(surface.viewportId, surface.surfaceId);
    this.surfaceOrder.push(surface.surfaceId);
    return surface;
  }

  /** Returns the stored frozen surface by identity, or refuses with `SURFACE_UNKNOWN_ID`. */
  getSurface(surfaceId: SurfaceId): ViewportSurface {
    return this.requireSurface(surfaceId);
  }

  /** Returns the stored frozen surface owning `viewportId`, or refuses. */
  getByViewportId(viewportId: ViewportId): ViewportSurface {
    const surfaceId = this.surfaceIdByViewportId.get(viewportId);
    const surface = surfaceId === undefined ? undefined : this.surfaceById.get(surfaceId);
    if (surface === undefined) {
      throw new SurfaceError(
        'SURFACE_UNKNOWN_ID',
        `Unknown viewport id '${viewportId}'. Remediation: register the surface that owns this ViewportId before reading it.`,
      );
    }
    return surface;
  }

  hasSurface(surfaceId: SurfaceId): boolean {
    return this.surfaceById.has(surfaceId);
  }

  /** Surfaces in creation order; the returned array is frozen; values keep identity. */
  listSurfaces(): readonly ViewportSurface[] {
    return deepFreeze(this.surfaceOrder.map((surfaceId) => this.requireSurface(surfaceId)));
  }

  /** Frozen point-in-time view; values are the same stored frozen objects. */
  snapshot(): readonly ViewportSurface[] {
    return this.listSurfaces();
  }

  get size(): number {
    return this.surfaceById.size;
  }

  /**
   * Replaces the semantic binding with the supplied one (unset fields cleared),
   * keeping identity and lifecycle. Refuses an empty binding and a disposed
   * surface.
   */
  bind(surfaceId: SurfaceId, binding: SurfaceBinding): ViewportSurface {
    if (binding === null || typeof binding !== 'object') {
      throw new SurfaceError(
        'SURFACE_MALFORMED',
        `Surface binding is malformed while attempting to bind '${surfaceId}': expected a non-null object carrying boundSlotId and/or boundViewId, received ${String(binding)}. Remediation: provide at least one of boundSlotId or boundViewId, or call unbind to clear the binding.`,
      );
    }
    const current = this.requireSurface(surfaceId);
    this.assertNotDisposed(current, 'bind');
    const { boundSlotId, boundViewId } = binding;
    // Defense in depth for untyped callers: a present binding field must be a
    // non-blank identifier, never a number/object that the TS type forbids.
    if (boundSlotId !== undefined) assertIdentifier(boundSlotId, 'boundSlotId', 'bind a surface');
    if (boundViewId !== undefined) assertIdentifier(boundViewId, 'boundViewId', 'bind a surface');
    if (boundSlotId === undefined && boundViewId === undefined) {
      throw new SurfaceError(
        'SURFACE_BINDING_EMPTY',
        `Surface '${surfaceId}' was bound with neither boundSlotId nor boundViewId. Remediation: provide at least one of boundSlotId or boundViewId, or call unbind to clear the binding.`,
      );
    }
    return this.replace(buildSurface(current.surfaceId, current.viewportId, current.lifecycle, boundSlotId, boundViewId));
  }

  /** Clears both binding fields, keeping identity and lifecycle. */
  unbind(surfaceId: SurfaceId): ViewportSurface {
    const current = this.requireSurface(surfaceId);
    this.assertNotDisposed(current, 'unbind');
    return this.replace(buildSurface(current.surfaceId, current.viewportId, current.lifecycle));
  }

  /** `available|hidden -> mounted`; any other current lifecycle is refused. */
  mount(surfaceId: SurfaceId): ViewportSurface {
    const current = this.requireSurface(surfaceId);
    if (current.lifecycle !== 'available' && current.lifecycle !== 'hidden') {
      throw this.illegal(surfaceId, current.lifecycle, 'mount');
    }
    return this.replace(buildSurface(current.surfaceId, current.viewportId, 'mounted', current.boundSlotId, current.boundViewId));
  }

  /** `mounted -> hidden`; any other current lifecycle is refused. */
  hide(surfaceId: SurfaceId): ViewportSurface {
    const current = this.requireSurface(surfaceId);
    if (current.lifecycle !== 'mounted') {
      throw this.illegal(surfaceId, current.lifecycle, 'hide');
    }
    return this.replace(buildSurface(current.surfaceId, current.viewportId, 'hidden', current.boundSlotId, current.boundViewId));
  }

  /** Terminal transition: clears the binding and sets `disposed`. */
  dispose(surfaceId: SurfaceId): ViewportSurface {
    const current = this.requireSurface(surfaceId);
    if (current.lifecycle === 'disposed') {
      throw this.illegal(surfaceId, current.lifecycle, 'dispose');
    }
    return this.replace(buildSurface(current.surfaceId, current.viewportId, 'disposed'));
  }

  private requireSurface(surfaceId: SurfaceId): ViewportSurface {
    const surface = this.surfaceById.get(surfaceId);
    if (surface === undefined) {
      throw new SurfaceError(
        'SURFACE_UNKNOWN_ID',
        `Unknown viewport surface '${surfaceId}'. Remediation: create the surface before reading, binding or transitioning it.`,
      );
    }
    return surface;
  }

  private assertNotDisposed(surface: ViewportSurface, operation: string): void {
    if (surface.lifecycle === 'disposed') {
      throw this.illegal(surface.surfaceId, surface.lifecycle, operation);
    }
  }

  private replace(surface: ViewportSurface): ViewportSurface {
    const frozen = deepFreeze(surface);
    this.surfaceById.set(frozen.surfaceId, frozen);
    return frozen;
  }

  private illegal(surfaceId: SurfaceId, from: ViewportSurface['lifecycle'], operation: string): SurfaceError {
    return new SurfaceError(
      'SURFACE_ILLEGAL_TRANSITION',
      `Illegal transition '${operation}' for viewport surface '${surfaceId}' from lifecycle '${from}'. Remediation: follow available/hidden -> mounted -> hidden, bind or unbind only a non-disposed surface, and treat dispose as terminal.`,
    );
  }
}
