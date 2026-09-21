/**
 * @nuclear/medical-engine — renderer subsystem barrel.
 *
 * Re-exports the UI-agnostic Cornerstone adapter, its typed errors and the
 * injected runtime host contract. This barrel is intentionally NOT re-exported
 * from `src/index.ts`: importing it pulls `@cornerstonejs/core`, so it must
 * remain reachable only from browser bundles and the renderer harness.
 */

export * from './host.js';
export * from './errors.js';
export * from './adapter.js';
