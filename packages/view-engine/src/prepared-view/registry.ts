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
 */
import type { PreparedView, PreparedViewId } from '@nuclear/shared-types';
import { PreparedViewError } from './errors.js';
import { deepFreeze } from '../internal/deep-freeze.js';
import { assertSerializableValue } from '../workspace/value-integrity.js';

export class PreparedViewRegistry {
  private readonly viewById = new Map<PreparedViewId, PreparedView>();
  private readonly viewOrder: PreparedViewId[] = [];

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
