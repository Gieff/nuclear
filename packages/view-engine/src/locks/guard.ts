/**
 * @nuclear/view-engine — lock guard (P4.5, ADR-010 §4).
 *
 * A `StateLock` protects a named portion of a published view's state. This
 * module is the single enforcement point: it reads the *current* locks of a
 * `PreparedView` and refuses a mutation of a locked state before the caller
 * stages, freezes or commits anything (fail-closed). Reading a set of locked
 * states never mutates the view.
 *
 * Deliberate semantics: only `locked === true` locks protect state. A lock
 * guards canonical state; a `LocalViewOverride` (see `../overrides/`) is a
 * local divergence that does not change canonical state and is therefore NOT
 * blocked by a lock (ADR-010 §4).
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type { LockableState, PreparedView, StateLock } from '@nuclear/shared-types';
import { LockError } from './errors.js';

/** Every state a `StateLock` may name, in canonical order. */
export const LOCKABLE_STATES: readonly LockableState[] = [
  'spatial',
  'camera',
  'presentation',
  'projection',
  'composition',
  'binding',
];

/** Returns the enforcing lock for `state`, or `undefined`; only `locked === true` counts. */
function firstEnforcingLock(view: PreparedView, state: LockableState): StateLock | undefined {
  return view.locks.find((lock) => lock.locked === true && lock.state === state);
}

/** The set of states protected by an enforcing lock on `view`. */
export function lockedStates(view: PreparedView): ReadonlySet<LockableState> {
  const locked = new Set<LockableState>();
  for (const lock of view.locks) {
    if (lock.locked === true) {
      locked.add(lock.state);
    }
  }
  return locked;
}

/** Whether `view` currently protects `state` with an enforcing lock. */
export function isStateLocked(view: PreparedView, state: LockableState): boolean {
  return firstEnforcingLock(view, state) !== undefined;
}

function refuse(
  view: PreparedView,
  state: LockableState,
  lock: StateLock,
  operation: string,
): never {
  throw new LockError(
    'LOCK_STATE_PROTECTED',
    `Cannot ${operation}: prepared view '${view.id}' (source view '${view.sourceViewId}') holds a StateLock on state '${state}' owned by '${lock.owner}'. Remediation: release the '${state}' lock (owner '${lock.owner}') before retrying, or perform the operation with a view that does not lock '${state}'.`,
  );
}

/**
 * Refuses `operation` when `view` locks any of `states`. Iterates `states` in
 * call order, so the first locked state named by the caller is the offender.
 */
export function assertStatesUnlocked(
  view: PreparedView,
  states: readonly LockableState[],
  operation: string,
): void {
  for (const state of states) {
    const lock = firstEnforcingLock(view, state);
    if (lock !== undefined) {
      refuse(view, state, lock, operation);
    }
  }
}

/**
 * Refuses `operation` when any of `views` locks any of `states`. Iterates views
 * in call order and, within each view, `states` in call order, so the first
 * offending view/state pair is reported.
 */
export function assertViewsUnlocked(
  views: readonly PreparedView[],
  states: readonly LockableState[],
  operation: string,
): void {
  for (const view of views) {
    assertStatesUnlocked(view, states, operation);
  }
}
