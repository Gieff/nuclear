/**
 * @nuclear/view-engine — PreparedView registry (P4.2).
 *
 * Stores assembled `PreparedView` objects by identity. `get`, `list` and
 * `snapshot` return the **stored** object — no clone — so P4.3 shared-state
 * groups and P4.7 demand projection observe the exact same `state` instance
 * that was registered. Only the ordered id list is copied.
 */
import type { PreparedView, PreparedViewId } from '@nuclear/shared-types';
import { PreparedViewError } from './errors.js';

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
    this.viewById.set(view.id, view);
    this.viewOrder.push(view.id);
    return view;
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
