/**
 * @nuclear/view-engine — shared-state group contracts (P4.3, ADR-011 §3).
 *
 * A shared-state group is the private holder for a `SpatialState`/`CameraState`
 * pair (architecture v3 §16): several prepared views reference the exact same
 * frozen pair instead of being wired through an imperative notify chain. The
 * contracts here are serializable descriptions; the holder itself lives in
 * `group.ts` and exposes no public mutator.
 */
import type { Brand, CameraState, PreparedViewId, SpatialState } from '@nuclear/shared-types';

/** Stable identity of a shared-state group (the holder). */
export type SharedStateGroupId = Brand<string, 'SharedStateGroupId'>;

/** The architecture §16 shared pair: spatial and camera owned by one holder. */
export interface SharedStatePair {
  readonly spatial: SpatialState;
  readonly camera: CameraState;
}

/** Caller-supplied pair used to create a group (validated, then frozen). */
export interface CreateSharedStateGroupInput {
  readonly id: SharedStateGroupId;
  readonly spatial: SpatialState;
  readonly camera: CameraState;
}

/** Immutable, serializable publication of a group's current state. */
export interface SharedStateGroupSnapshot {
  readonly id: SharedStateGroupId;
  readonly spatial: SpatialState;
  readonly camera: CameraState;
  readonly preparedViewIds: readonly PreparedViewId[];
}
