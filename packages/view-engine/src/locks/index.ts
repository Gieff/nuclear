/**
 * @nuclear/view-engine — lock subsystem barrel (P4.5).
 *
 * Re-exports the Node-safe lock surface: the `LockableState` catalogue, the
 * read-only guard helpers and the typed fail-closed `LockError`. No React, DOM,
 * Cornerstone or resource-residency code lives here.
 */
export * from './errors.js';
export * from './guard.js';
