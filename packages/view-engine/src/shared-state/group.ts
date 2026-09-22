/**
 * @nuclear/view-engine — shared-state holder (P4.3, ADR-011 §2/§3).
 *
 * A `SharedStateGroup` owns the shared `SpatialState`/`CameraState` pair in a
 * module-private `WeakMap`. The holder exposes only read getters — there is no
 * public mutator — so a consumer can never mutate shared state in place. The
 * pair itself is validated (`assertSerializableValue`) and deep-frozen before
 * it is stored, and is replaced atomically by the registry through the
 * `@internal` commit primitive. Freezing is in place, so the caller's frozen
 * `spatial`/`camera` identity is preserved and every bound view observes the
 * same object.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type { CameraState, SpatialState } from '@nuclear/shared-types';
import type { CreateSharedStateGroupInput, SharedStateGroupId, SharedStatePair } from './types.js';
import { assertSerializableValue } from '../workspace/value-integrity.js';
import { deepFreeze } from '../internal/deep-freeze.js';

/**
 * The private holder. The pair is never exposed as a mutable reference: getters
 * read from here, and only `commitSharedStatePair` (used by the registry) writes
 * to it, always with a freshly validated + frozen pair.
 */
const pairByGroup = new WeakMap<SharedStateGroup, SharedStatePair>();

export class SharedStateGroup {
  readonly id: SharedStateGroupId;

  constructor(input: CreateSharedStateGroupInput) {
    this.id = input.id;
    // Validate the caller's original values first, so a refusal leaves the
    // caller untouched; only then freeze the fresh wrapper (and the referenced
    // spatial/camera objects) in place. Never freeze on refusal.
    const pair: SharedStatePair = { spatial: input.spatial, camera: input.camera };
    assertSerializableValue(pair, `shared-state group '${input.id}'`);
    pairByGroup.set(this, deepFreeze(pair));
    // The holder is an opaque identity token with no public mutator: freeze the
    // instance so `(group as { id: string }).id = 'x'` cannot corrupt the
    // published snapshot. The `WeakMap` accepts a frozen key and the prototype
    // getters keep working.
    Object.freeze(this);
  }

  get spatial(): SpatialState {
    return currentSharedStatePair(this).spatial;
  }

  get camera(): CameraState {
    return currentSharedStatePair(this).camera;
  }
}

/**
 * @internal Reads the pair currently committed to a holder. The map is always
 * populated by the constructor, so the guard is an unreachable invariant.
 */
export function currentSharedStatePair(group: SharedStateGroup): SharedStatePair {
  const pair = pairByGroup.get(group);
  if (pair === undefined) {
    throw new Error(
      `Shared-state group '${group.id}' has no committed pair. Remediation: construct the group through SharedStateGroupRegistry so the private holder is initialised.`,
    );
  }
  return pair;
}

/**
 * @internal Replaces the committed pair. This is the ONLY mutator; it is used
 * exclusively by `SharedStateGroupRegistry` after the fresh pair was validated
 * and frozen, and it never mutates the previous pair in place.
 */
export function commitSharedStatePair(group: SharedStateGroup, pair: SharedStatePair): void {
  pairByGroup.set(group, pair);
}
