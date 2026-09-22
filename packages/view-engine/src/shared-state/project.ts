/**
 * @nuclear/view-engine — shared-state projection (P4.3, ADR-011 addendum).
 *
 * `projectPreparedView` regenerates the frozen published `PreparedView` for a
 * view whose shared spatial/camera moved to the holder's new pair. It copies
 * the view's own metadata (presentation, composition, dataBinding, projection,
 * coordinateTransforms, id, provenance, links, locks, cached preview) and
 * overrides only `spatial`/`camera` with the shared references — never a clone,
 * so object identity stays observable across every attached view. Assembly then
 * re-validates and re-freezes the fresh `state` container.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type { MedicalViewState, PreparedView } from '@nuclear/shared-types';
import type { SharedStatePair } from './types.js';
import { assemblePreparedView } from '../prepared-view/assemble.js';

export function projectPreparedView(view: PreparedView, shared: SharedStatePair): PreparedView {
  // A fresh mutable state container that keeps every non-shared member by
  // reference; assembly validates and freezes it before publication.
  const state: MedicalViewState = {
    ...view.state,
    spatial: shared.spatial,
    camera: shared.camera,
  };
  return assemblePreparedView({
    preparedViewId: view.id,
    state,
    provenance: view.provenance,
    links: view.links,
    locks: view.locks,
    // Optional properties must be absent, never present-with-undefined.
    ...(view.cachedPreviewReference === undefined
      ? {}
      : { cachedPreviewReference: view.cachedPreviewReference }),
  });
}
