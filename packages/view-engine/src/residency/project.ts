/**
 * @nuclear/view-engine — pure `ResourceDemand` projection (P4.7).
 *
 * Projects each active, visible `ViewSlot` demand into a
 * `ResourceRetentionRequest` with a stable, caller-owned lease id. It never
 * touches a `ResourceManager`, never loads or evicts and never measures bytes;
 * it is a pure, deterministic function of its input (ADR-010 §6).
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type { AssetId, ViewSlotId } from '@nuclear/shared-types';
import { ResidencyProjectionError } from './errors.js';
import type {
  ProjectResourceRetentionRequestsInput,
  ResourceRetentionRequest,
} from './types.js';

/**
 * Stable lease identity for a slot's demand on an asset: `slotId::assetId`.
 *
 * Deterministic and stable across re-layout: it is derived from the logical
 * `ViewSlotId` and the `AssetId` only, never from a DOM node or the numeric
 * slot index alone (ADR-010 §6). Two slots demanding the same asset therefore
 * hold two distinct leases on one physical resource.
 */
export function resourceLeaseIdFor(slotId: ViewSlotId, assetId: AssetId): string {
  return `${slotId}::${assetId}`;
}

function malformed(detail: string): ResidencyProjectionError {
  return new ResidencyProjectionError(
    'RESIDENCY_PROJECTION_MALFORMED',
    `Resource-demand projection input is malformed: ${detail} Remediation: pass { slots: ViewSlot[], visibility: ReadonlyMap<ViewSlotId, 'visible'|'hidden'> } with a non-blank slot id and a non-blank demand asset id on every projectable slot.`,
  );
}

/** Renders an identity value for diagnostics without ever producing `undefined::…`. */
function describeIdentity(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim().length === 0 ? 'a blank string' : `'${value}'`;
  }
  if (value === undefined) return 'undefined';
  return value === null ? 'null' : `a ${typeof value}`;
}

/** True only for a non-blank string identity (a branded id is still a string). */
function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Fail-closed refusal for a projectable slot with a blank/missing identity field. */
function malformedIdentity(
  slotId: unknown,
  field: 'slot.id' | 'demand.assetId',
  value: unknown,
): ResidencyProjectionError {
  return new ResidencyProjectionError(
    'RESIDENCY_PROJECTION_MALFORMED',
    `Resource-demand projection input is malformed: '${field}' of projectable slot ${describeIdentity(slotId)} must be a non-blank string but is ${describeIdentity(value)}. Remediation: give every projectable slot a non-blank ViewSlotId and every declared ResourceDemand a non-blank AssetId before projecting; hidden, empty, unavailable and demand-less slots stay skipped.`,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Fail-closed validation of untyped runtime input; never leaks a `TypeError`. */
function requireProjectInput(input: unknown): ProjectResourceRetentionRequestsInput {
  if (!isObject(input)) {
    throw malformed(`expected an object, received ${input === null ? 'null' : typeof input}.`);
  }
  const { slots, visibility } = input;
  if (!Array.isArray(slots)) {
    throw malformed(`the 'slots' array is missing or is not an array (received ${typeof slots}).`);
  }
  if (!isObject(visibility) || typeof visibility.get !== 'function') {
    throw malformed("the 'visibility' map is missing or is not a Map-like object with a 'get' method.");
  }
  return input as unknown as ProjectResourceRetentionRequestsInput;
}

/**
 * Projects active slot demand into retention requests, in slot array order.
 *
 * A slot is skipped when its `status` is neither `'bound'` nor `'prepared'`,
 * when it declares no `resourceDemand`, or when it is not `'visible'` (a
 * missing visibility entry is hidden). A projectable (active + demanding +
 * visible) slot must carry a non-blank `id` and a non-blank
 * `demand.assetId`; otherwise projection fails closed with
 * `RESIDENCY_PROJECTION_MALFORMED` so a malformed-only lease id can never be
 * emitted. Each request carries a fresh plain demand copy with no
 * `undefined`-valued keys; inputs are never mutated.
 */
export function projectResourceRetentionRequests(
  input: ProjectResourceRetentionRequestsInput,
): readonly ResourceRetentionRequest[] {
  const source = requireProjectInput(input);
  const requests: ResourceRetentionRequest[] = [];
  for (const slot of source.slots) {
    if (slot.status !== 'bound' && slot.status !== 'prepared') continue;
    const demand = slot.resourceDemand;
    if (demand === undefined) continue;
    if (source.visibility.get(slot.id) !== 'visible') continue;
    if (!isNonBlankString(slot.id)) {
      throw malformedIdentity(slot.id, 'slot.id', slot.id);
    }
    if (!isNonBlankString(demand.assetId)) {
      throw malformedIdentity(slot.id, 'demand.assetId', demand.assetId);
    }
    requests.push({
      leaseId: resourceLeaseIdFor(slot.id, demand.assetId),
      slotId: slot.id,
      demand: {
        assetId: demand.assetId,
        priority: demand.priority,
        requiredTiers: [...demand.requiredTiers],
      },
    });
  }
  return requests;
}
