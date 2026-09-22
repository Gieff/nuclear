/**
 * @nuclear/view-engine — shared-state group registry (P4.3, ADR-011 §3).
 *
 * Owns the mapping between shared-state groups and the prepared views attached
 * to them. There is no notify chain: an update is an atomic replacement of the
 * holder's pair, which regenerates every attached view's frozen projection
 * (`private holder → atomic replacement → new projection → frozen published
 * DTO`). Holder identity, `PreparedViewId` and the registry's view order stay
 * stable across a replacement.
 *
 * Atomicity: `replace` validates and builds **all** new projections before it
 * commits anything. If staging throws, neither the holder nor any bound view is
 * touched. A refused value-integrity walk propagates its typed `WorkspaceError`
 * unchanged.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type { PreparedView, PreparedViewId } from '@nuclear/shared-types';
import type {
  CreateSharedStateGroupInput,
  SharedStateGroupId,
  SharedStateGroupSnapshot,
  SharedStatePair,
} from './types.js';
import { SharedStateError } from './errors.js';
import { commitSharedStatePair, currentSharedStatePair, SharedStateGroup } from './group.js';
import { projectPreparedView } from './project.js';
import { assertSerializableValue } from '../workspace/value-integrity.js';
import { deepFreeze } from '../internal/deep-freeze.js';
import type { PreparedViewRegistry } from '../prepared-view/registry.js';
import { replaceRegisteredPreparedView } from '../prepared-view/registry.js';

export class SharedStateGroupRegistry {
  private readonly preparedViews: PreparedViewRegistry;
  private readonly groupById = new Map<SharedStateGroupId, SharedStateGroup>();
  private readonly groupOrder: SharedStateGroupId[] = [];
  private readonly membersByGroup = new Map<SharedStateGroupId, PreparedViewId[]>();
  private readonly groupByMember = new Map<PreparedViewId, SharedStateGroupId>();

  constructor(preparedViews: PreparedViewRegistry) {
    this.preparedViews = preparedViews;
  }

  createGroup(input: CreateSharedStateGroupInput): SharedStateGroup {
    // Duplicate check runs FIRST, so a refused create never freezes the
    // caller's input via the SharedStateGroup constructor.
    if (this.groupById.has(input.id)) {
      throw new SharedStateError(
        'SHARED_STATE_DUPLICATE_GROUP',
        `Shared-state group id '${input.id}' is already registered. Remediation: reuse the registered group or create it under a distinct SharedStateGroupId.`,
      );
    }
    const group = new SharedStateGroup(input);
    this.groupById.set(group.id, group);
    this.groupOrder.push(group.id);
    this.membersByGroup.set(group.id, []);
    return group;
  }

  hasGroup(groupId: SharedStateGroupId): boolean {
    return this.groupById.has(groupId);
  }

  getGroup(groupId: SharedStateGroupId): SharedStateGroup {
    return this.requireGroup(groupId);
  }

  /**
   * Lists the registered group holders in creation order.
   *
   * `SharedStateGroup` holders are opaque identity tokens: they are frozen
   * instances (see `group.ts`), but the array itself is frozen rather than
   * deep-frozen because `deepFreeze` fail-closes on class instances (ADR-011 §1
   * exemption — the holder exposes no public mutator, so there is no mutable
   * state to protect). Only the plain-data `snapshot()`/`listMembers()` outputs
   * are deep-frozen.
   */
  listGroups(): readonly SharedStateGroup[] {
    return Object.freeze(this.groupOrder.map((groupId) => this.requireGroup(groupId)));
  }

  listMembers(groupId: SharedStateGroupId): readonly PreparedViewId[] {
    this.requireGroup(groupId);
    return deepFreeze([...(this.membersByGroup.get(groupId) ?? [])]);
  }

  snapshot(): readonly SharedStateGroupSnapshot[] {
    return deepFreeze(
      this.groupOrder.map((groupId) => {
        const group = this.requireGroup(groupId);
        return {
          id: group.id,
          spatial: group.spatial,
          camera: group.camera,
          preparedViewIds: this.listMembers(groupId),
        };
      }),
    );
  }

  attach(groupId: SharedStateGroupId, preparedViewId: PreparedViewId): PreparedView {
    // Precedence: group exists, then the prepared view exists (propagates
    // `PreparedViewError`), then the one-group-per-view invariant.
    const group = this.requireGroup(groupId);
    const current = this.preparedViews.get(preparedViewId);
    const existingGroupId = this.groupByMember.get(preparedViewId);
    if (existingGroupId !== undefined) {
      throw new SharedStateError(
        'SHARED_STATE_VIEW_ALREADY_ATTACHED',
        `Prepared view '${preparedViewId}' is already attached to shared-state group '${existingGroupId}'. Remediation: detach it from '${existingGroupId}' before attaching it to group '${groupId}'; a prepared view may belong to at most one shared-state group.`,
      );
    }
    // Build the projection and swap the registered entry before mutating
    // membership, so a projection/validation failure leaves the registry,
    // membership and holder exactly as they were.
    const projected = projectPreparedView(current, currentSharedStatePair(group));
    const replaced = replaceRegisteredPreparedView(this.preparedViews, projected);
    this.groupByMember.set(preparedViewId, groupId);
    this.membersByGroup.get(groupId)?.push(preparedViewId);
    return replaced;
  }

  detach(preparedViewId: PreparedViewId): PreparedView {
    const groupId = this.groupByMember.get(preparedViewId);
    if (groupId === undefined) {
      throw new SharedStateError(
        'SHARED_STATE_VIEW_NOT_ATTACHED',
        `Prepared view '${preparedViewId}' is not attached to any shared-state group. Remediation: attach it to a shared-state group before detaching it.`,
      );
    }
    this.groupByMember.delete(preparedViewId);
    const members = this.membersByGroup.get(groupId);
    if (members !== undefined) {
      const index = members.indexOf(preparedViewId);
      if (index >= 0) members.splice(index, 1);
    }
    // The view keeps the last projected frozen state and may be re-attached.
    return this.preparedViews.get(preparedViewId);
  }

  replace(groupId: SharedStateGroupId, replacement: SharedStatePair): readonly PreparedView[] {
    const group = this.requireGroup(groupId);
    // Validate then freeze the fresh replacement wrapper; a refusal propagates
    // the typed `WorkspaceError` and freezes nothing.
    const pair: SharedStatePair = { spatial: replacement.spatial, camera: replacement.camera };
    assertSerializableValue(pair, `shared-state group '${groupId}' replacement`);
    const nextPair = deepFreeze(pair);
    const members = this.membersByGroup.get(groupId) ?? [];
    // Stage ALL new projections before committing ANY of them.
    const staged = members.map((preparedViewId) =>
      projectPreparedView(this.preparedViews.get(preparedViewId), nextPair),
    );
    // Commit order: every projection above is already validated + frozen by
    // `assemblePreparedView`, so the holder-pair commit and the per-view
    // `replaceRegisteredPreparedView` swaps below are infallible (they only set
    // Map/WeakMap entries and cannot throw for a valid registry). The whole
    // sequence is therefore atomic with respect to observers: if staging threw,
    // nothing was committed, and once the first commit runs, all of them run.
    commitSharedStatePair(group, nextPair);
    for (const view of staged) {
      replaceRegisteredPreparedView(this.preparedViews, view);
    }
    return deepFreeze(staged);
  }

  private requireGroup(groupId: SharedStateGroupId): SharedStateGroup {
    const group = this.groupById.get(groupId);
    if (group === undefined) {
      throw new SharedStateError(
        'SHARED_STATE_UNKNOWN_GROUP',
        `Unknown shared-state group '${groupId}'. Remediation: create the group before attaching views, replacing its state or reading it.`,
      );
    }
    return group;
  }
}
