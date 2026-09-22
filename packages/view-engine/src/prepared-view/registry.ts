/**
 * @nuclear/view-engine — PreparedView registry (P4.2).
 *
 * Stores assembled `PreparedView` objects by identity. `get`, `list` and
 * `snapshot` return the **stored** object — no clone — so P4.3 shared-state
 * groups and P4.7 demand projection observe the exact same `state` instance
 * that was registered. Only the ordered id list is copied.
 *
 * `register` deep-freezes defensively (ADR-011 §1): an assembled view is
 * already frozen, so this is normally a no-op, but a hand-built view is frozen
 * here too and can never be mutated through a published reference. The
 * defensive freeze runs only after the duplicate-id check passes, so a refused
 * registration does not mutate the caller's object.
 *
 * The projection swap used by P4.3 shared-state groups is **internal-only**: it
 * is reachable solely through the `@internal`
 * `replaceRegisteredPreparedView` friend function below, never through a public
 * or barrel API, so a hand-built view cannot bypass the C5/ADR-010 §7.3
 * provenance-correlation gate by swapping a registered view.
 */
import type { PreparedView, PreparedViewId } from '@nuclear/shared-types';
import { PreparedViewError } from './errors.js';
import { deepFreeze } from '../internal/deep-freeze.js';
import { assertSerializableValue } from '../workspace/value-integrity.js';

/**
 * Module-private "friend" registry: maps each `PreparedViewRegistry` instance
 * to a closure that swaps a projection through its ECMAScript-private method.
 * Registering the closure from the constructor (and keeping the map unexported)
 * means no forged object literal can obtain a replacer, so the swap stays
 * exclusive to `replaceRegisteredPreparedView`.
 */
const projectionReplacers = new WeakMap<PreparedViewRegistry, (view: PreparedView) => PreparedView>();

export class PreparedViewRegistry {
  private readonly viewById = new Map<PreparedViewId, PreparedView>();
  private readonly viewOrder: PreparedViewId[] = [];

  constructor() {
    projectionReplacers.set(this, (view) => this.#replaceProjection(view));
  }

  register(view: PreparedView): PreparedView {
    if (this.viewById.has(view.id)) {
      throw new PreparedViewError(
        'PREPARED_VIEW_DUPLICATE_ID',
        `Prepared view id '${view.id}' is already registered. Remediation: reuse the registered view or register it under a distinct PreparedViewId.`,
      );
    }
    // C4b: a hand-built view never passed assembly, so refuse a non-plain /
    // explicitly-undefined member (WORKSPACE_UNSUPPORTED_VALUE /
    // WORKSPACE_UNDEFINED_VALUE) before the defensive freeze. The check runs
    // after the duplicate-id check, so a refused duplicate is not validated
    // and nothing is frozen or mutated.
    assertSerializableValue(view, `prepared view '${view.id}'`);
    const frozen = deepFreeze(view);
    this.viewById.set(frozen.id, frozen);
    this.viewOrder.push(frozen.id);
    return frozen;
  }

  /**
   * Internal projection-swap primitive (P4.3), reachable only through
   * `replaceRegisteredPreparedView`. Replaces the registered view for an
   * **existing** id with a new validated, deep-frozen projection. The id must
   * already be registered (`PREPARED_VIEW_UNKNOWN_ID` otherwise) and
   * `viewOrder` is unchanged, so `PreparedViewId` identity and list position
   * stay stable across a shared-state replacement. Validation precedes the
   * freeze, so a refused replacement never freezes or mutates the caller's
   * object and never touches the stored view.
   */
  #replaceProjection(view: PreparedView): PreparedView {
    if (!this.viewById.has(view.id)) {
      throw new PreparedViewError(
        'PREPARED_VIEW_UNKNOWN_ID',
        `Unknown prepared view id '${view.id}'. Remediation: register the prepared view (assemble and register it) before replacing its projection.`,
      );
    }
    assertSerializableValue(view, `prepared view '${view.id}'`);
    const frozen = deepFreeze(view);
    this.viewById.set(frozen.id, frozen);
    return frozen;
  }

  get(preparedViewId: PreparedViewId): PreparedView {
    return this.require(preparedViewId);
  }

  has(preparedViewId: PreparedViewId): boolean {
    return this.viewById.has(preparedViewId);
  }

  list(): readonly PreparedView[] {
    return this.viewOrder.map((preparedViewId) => this.require(preparedViewId));
  }

  snapshot(): readonly PreparedView[] {
    return this.list();
  }

  private require(preparedViewId: PreparedViewId): PreparedView {
    const view = this.viewById.get(preparedViewId);
    if (view === undefined) {
      throw new PreparedViewError(
        'PREPARED_VIEW_UNKNOWN_ID',
        `Unknown prepared view id '${preparedViewId}'. Remediation: assemble and register the prepared view before referencing it.`,
      );
    }
    return view;
  }
}

/**
 * @internal Swaps the registered projection for an existing prepared view id.
 *
 * This is the **only** entry point to the projection swap: the public
 * `PreparedViewRegistry` surface exposes no `replace`, and the replacer closure
 * is held in an unexported module-private `WeakMap`, so no public or barrel
 * consumer can substitute a registered view. It exists for the P4.3
 * shared-state projection, which must regenerate the frozen `PreparedView` of
 * every attached view after an atomic holder-pair replacement while keeping the
 * `PreparedViewId` and view order stable.
 *
 * The registry must have been constructed normally (never forged), otherwise
 * the operation fails closed with a `PreparedViewError`.
 */
export function replaceRegisteredPreparedView(
  registry: PreparedViewRegistry,
  view: PreparedView,
): PreparedView {
  const replacer = projectionReplacers.get(registry);
  if (replacer === undefined) {
    throw new PreparedViewError(
      'PREPARED_VIEW_UNKNOWN_ID',
      `Prepared view registry has no registered projection replacer, so prepared view '${view.id}' cannot be substituted. Remediation: construct the registry through the PreparedViewRegistry constructor (the swap is unavailable on a forged or uninitialised registry).`,
    );
  }
  return replacer(view);
}
