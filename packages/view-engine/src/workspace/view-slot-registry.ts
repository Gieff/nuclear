/**
 * @nuclear/view-engine — logical ViewGroup/ViewSlot registry (P4.1).
 *
 * Pure and Node-safe: one to four groups of four slots in the role order MIP,
 * PET, GENERIC, FUSION (zero groups is refused; the default factory allocates
 * four). A slot carries semantic binding state only; it never pins RAM or VRAM
 * (ADR-010 §2); illegal transitions fail closed.
 *
 * Immutability (ADR-011 §1): the registry stores deep-frozen canonical
 * group/slot values and every read (`getSlot`/`getGroup`/`list*`/`snapshot`)
 * and every transition (`bind`/`markPrepared`/`markUnavailable`/`unbind`/
 * `setDemand`) returns the stored frozen value by identity. A caller cannot
 * mutate canonical slot state; changes only happen through these transitions.
 */
import type {
  PreparedViewId,
  ResourceDemand,
  ViewGroup,
  ViewGroupId,
  ViewSlot,
  ViewSlotId,
  ViewSlotRole,
  ViewSlotStatus,
} from '@nuclear/shared-types';
import { WorkspaceError } from './errors.js';
import { deepFreeze } from '../internal/deep-freeze.js';

export const VIEW_SLOT_ROLES = ['MIP', 'PET', 'GENERIC', 'FUSION'] as const;
export const MAX_VIEW_GROUPS = 4;
export const MAX_VIEW_SLOTS = MAX_VIEW_GROUPS * VIEW_SLOT_ROLES.length;

export interface ViewSlotLayout {
  readonly groups: readonly ViewGroup[];
  readonly slots: readonly ViewSlot[];
}

type SlotIdTuple = [ViewSlotId, ViewSlotId, ViewSlotId, ViewSlotId];

function cloneDemand(demand: ResourceDemand): ResourceDemand {
  return { assetId: demand.assetId, priority: demand.priority, requiredTiers: [...demand.requiredTiers] };
}

function cloneGroup(group: ViewGroup): ViewGroup {
  const [first, second, third, fourth] = group.slotIds;
  const slotIds: SlotIdTuple = [first, second, third, fourth];
  return group.label === undefined ? { id: group.id, slotIds } : { id: group.id, label: group.label, slotIds };
}

function cloneSlot(slot: ViewSlot): ViewSlot {
  return {
    id: slot.id,
    groupId: slot.groupId,
    role: slot.role,
    status: slot.status,
    ...(slot.preparedViewId === undefined ? {} : { preparedViewId: slot.preparedViewId }),
    ...(slot.resourceDemand === undefined ? {} : { resourceDemand: cloneDemand(slot.resourceDemand) }),
  };
}

function invalidLayout(message: string): WorkspaceError {
  const remediation = `Remediation: declare between 1 and ${MAX_VIEW_GROUPS} groups of exactly four slots whose roles cover ${VIEW_SLOT_ROLES.join('/')} once, with unique ids and a declared group for every slot.`;
  return new WorkspaceError('WORKSPACE_SLOT_LAYOUT_INVALID', `${message} ${remediation}`);
}

function validateGroups(groups: readonly ViewGroup[]): Set<ViewGroupId> {
  const groupIds = new Set<ViewGroupId>();
  for (const group of groups) {
    if (groupIds.has(group.id)) throw invalidLayout(`View group id '${group.id}' is declared more than once.`);
    groupIds.add(group.id);
    if (group.slotIds.length !== VIEW_SLOT_ROLES.length) {
      throw invalidLayout(`View group '${group.id}' declares ${group.slotIds.length} slot ids instead of ${VIEW_SLOT_ROLES.length}.`);
    }
    if (new Set<ViewSlotId>(group.slotIds).size !== group.slotIds.length) {
      throw invalidLayout(`View group '${group.id}' repeats one of its own slot ids.`);
    }
  }
  return groupIds;
}

function validateSlots(slots: readonly ViewSlot[], groupIds: ReadonlySet<ViewGroupId>): Map<ViewSlotId, ViewSlot> {
  const slotsById = new Map<ViewSlotId, ViewSlot>();
  for (const slot of slots) {
    if (slotsById.has(slot.id)) throw invalidLayout(`View slot id '${slot.id}' is declared more than once.`);
    slotsById.set(slot.id, slot);
    if (!(VIEW_SLOT_ROLES as readonly ViewSlotRole[]).includes(slot.role)) {
      throw invalidLayout(`View slot '${slot.id}' declares foreign role '${String(slot.role)}'.`);
    }
    if (!groupIds.has(slot.groupId)) {
      throw invalidLayout(`View slot '${slot.id}' references undeclared view group '${slot.groupId}'.`);
    }
  }
  return slotsById;
}

function validateMembership(groups: readonly ViewGroup[], slotsById: ReadonlyMap<ViewSlotId, ViewSlot>): void {
  for (const group of groups) {
    const members = [...slotsById.values()].filter((slot) => slot.groupId === group.id);
    if (members.length !== VIEW_SLOT_ROLES.length) {
      throw invalidLayout(`View group '${group.id}' contains ${members.length} slots instead of ${VIEW_SLOT_ROLES.length}.`);
    }
    const declared = new Set<string>(group.slotIds.map((slotId: ViewSlotId) => String(slotId)));
    if (members.some((slot: ViewSlot) => !declared.has(String(slot.id)))) {
      throw invalidLayout(`View group '${group.id}' must list exactly its own four slot ids.`);
    }
    const roles = new Set<ViewSlotRole>(members.map((slot: ViewSlot) => slot.role));
    if (roles.size !== VIEW_SLOT_ROLES.length) {
      throw invalidLayout(`View group '${group.id}' must cover each role ${VIEW_SLOT_ROLES.join('/')} exactly once.`);
    }
  }
}

function assertValidLayout(layout: ViewSlotLayout): void {
  const { groups, slots } = layout;
  if (!Array.isArray(groups) || !Array.isArray(slots)) {
    throw invalidLayout('The layout must declare both a group array and a slot array.');
  }
  if (groups.length === 0) {
    throw invalidLayout('The layout declares no view groups; a workspace requires at least one group.');
  }
  if (groups.length > MAX_VIEW_GROUPS) {
    throw invalidLayout(`The layout declares ${groups.length} view groups; at most ${MAX_VIEW_GROUPS} are allowed.`);
  }
  if (slots.length > MAX_VIEW_SLOTS) {
    throw invalidLayout(`The layout declares ${slots.length} view slots; at most ${MAX_VIEW_SLOTS} are allowed.`);
  }
  validateMembership(groups, validateSlots(slots, validateGroups(groups)));
}

function toSlotIdTuple(ids: readonly ViewSlotId[]): SlotIdTuple {
  if (ids.length !== VIEW_SLOT_ROLES.length) {
    throw invalidLayout(`Expected ${VIEW_SLOT_ROLES.length} slot ids, received ${ids.length}.`);
  }
  return [ids[0], ids[1], ids[2], ids[3]];
}

/** Four groups of four slots in role order MIP, PET, GENERIC, FUSION. */
export function createDefaultViewSlotLayout(): ViewSlotLayout {
  const groups: ViewGroup[] = [];
  const slots: ViewSlot[] = [];
  for (let index = 0; index < MAX_VIEW_GROUPS; index += 1) {
    const groupNumber = index + 1;
    const groupId = `view-group-${groupNumber}` as ViewGroupId;
    const slotIds = toSlotIdTuple(
      VIEW_SLOT_ROLES.map((role: ViewSlotRole) => {
        const slotId = `view-slot-${groupNumber}-${role.toLowerCase()}` as ViewSlotId;
        slots.push({ id: slotId, groupId, role, status: 'empty' });
        return slotId;
      }),
    );
    groups.push({ id: groupId, slotIds });
  }
  return { groups, slots };
}

/** Owns the logical slot layout; every read returns the stored frozen value. */
export class ViewSlotRegistry {
  private readonly groupById = new Map<ViewGroupId, ViewGroup>();
  private readonly slotById = new Map<ViewSlotId, ViewSlot>();
  private readonly groupOrder: ViewGroupId[] = [];
  private readonly slotOrder: ViewSlotId[] = [];

  private constructor() {}

  static fromLayout(layout: ViewSlotLayout): ViewSlotRegistry {
    assertValidLayout(layout);
    const registry = new ViewSlotRegistry();
    for (const group of layout.groups) {
      const copy = deepFreeze(cloneGroup(group));
      registry.groupById.set(copy.id, copy);
      registry.groupOrder.push(copy.id);
    }
    for (const slot of layout.slots) {
      const copy = deepFreeze(cloneSlot(slot));
      registry.slotById.set(copy.id, copy);
      registry.slotOrder.push(copy.id);
    }
    return registry;
  }

  static createDefault(): ViewSlotRegistry {
    return ViewSlotRegistry.fromLayout(createDefaultViewSlotLayout());
  }

  listGroups(): readonly ViewGroup[] {
    return deepFreeze(this.groupOrder.map((groupId) => this.requireGroup(groupId)));
  }

  listSlots(): readonly ViewSlot[] {
    return deepFreeze(this.slotOrder.map((slotId) => this.requireSlot(slotId)));
  }

  getGroup(groupId: ViewGroupId): ViewGroup {
    return this.requireGroup(groupId);
  }

  getSlot(slotId: ViewSlotId): ViewSlot {
    return this.requireSlot(slotId);
  }

  bind(slotId: ViewSlotId, preparedViewId: PreparedViewId): ViewSlot {
    const current = this.requireSlot(slotId);
    if (current.status !== 'empty' && current.status !== 'unavailable') {
      throw this.illegal(slotId, current.status, 'bind');
    }
    // A new binding invalidates any demand declared for the previous view, so
    // the slot never carries a stale `assetId` until it is re-declared (P4.7).
    return this.replace({
      id: current.id,
      groupId: current.groupId,
      role: current.role,
      status: 'bound',
      preparedViewId,
    });
  }

  markPrepared(slotId: ViewSlotId): ViewSlot {
    const current = this.requireSlot(slotId);
    if (current.status !== 'bound') throw this.illegal(slotId, current.status, 'markPrepared');
    return this.replace({ ...current, status: 'prepared' });
  }

  markUnavailable(slotId: ViewSlotId): ViewSlot {
    const current = this.requireSlot(slotId);
    if (current.status !== 'bound' && current.status !== 'prepared') {
      throw this.illegal(slotId, current.status, 'markUnavailable');
    }
    return this.replace({ ...current, status: 'unavailable' });
  }

  unbind(slotId: ViewSlotId): ViewSlot {
    const current = this.requireSlot(slotId);
    if (current.status === 'empty') throw this.illegal(slotId, current.status, 'unbind');
    return this.replace({ id: current.id, groupId: current.groupId, role: current.role, status: 'empty' });
  }

  setDemand(slotId: ViewSlotId, demand: ResourceDemand): ViewSlot {
    const current = this.requireSlot(slotId);
    if (current.status !== 'bound' && current.status !== 'prepared') {
      throw new WorkspaceError(
        'WORKSPACE_DEMAND_REQUIRES_BINDING',
        `Demand declared for view slot '${slotId}' at status '${current.status}'. Remediation: bind the slot (or bind then markPrepared) before declaring demand.`,
      );
    }
    return this.replace({ ...current, resourceDemand: cloneDemand(demand) });
  }

  snapshot(): ViewSlotLayout {
    return deepFreeze({ groups: this.listGroups(), slots: this.listSlots() });
  }

  private replace(slot: ViewSlot): ViewSlot {
    const frozen = deepFreeze(slot);
    this.slotById.set(frozen.id, frozen);
    return frozen;
  }

  private requireGroup(groupId: ViewGroupId): ViewGroup {
    const group = this.groupById.get(groupId);
    if (group === undefined) {
      throw new WorkspaceError(
        'WORKSPACE_UNKNOWN_GROUP',
        `Unknown view group '${groupId}'. Remediation: declare the group in the slot layout before referencing it.`,
      );
    }
    return group;
  }

  private requireSlot(slotId: ViewSlotId): ViewSlot {
    const slot = this.slotById.get(slotId);
    if (slot === undefined) {
      throw new WorkspaceError(
        'WORKSPACE_UNKNOWN_SLOT',
        `Unknown view slot '${slotId}'. Remediation: allocate the slot from the current slot layout first.`,
      );
    }
    return slot;
  }

  private illegal(slotId: ViewSlotId, from: ViewSlotStatus, operation: string): WorkspaceError {
    return new WorkspaceError(
      'WORKSPACE_ILLEGAL_SLOT_TRANSITION',
      `Illegal transition '${operation}' for view slot '${slotId}' from status '${from}'. Remediation: follow empty/unavailable -> bound -> prepared -> unavailable -> empty and unbind before rebinding.`,
    );
  }
}
