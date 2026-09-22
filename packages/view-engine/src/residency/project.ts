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
import type {
  AssetId,
  AssetResidencyTier,
  ResourcePriority,
  ViewSlotId,
} from '@nuclear/shared-types';
import { ResidencyProjectionError } from './errors.js';
import type {
  ProjectResourceRetentionRequestsInput,
  ResourceRetentionRequest,
} from './types.js';

/** Accepted demand priorities; mirror of the `ResourcePriority` contract. */
const RESOURCE_PRIORITIES: readonly ResourcePriority[] = [
  'visible-interactive',
  'visible-read-only',
  'prepared-hidden',
  'prefetch-candidate',
  'unused',
];

/** Accepted residency tiers; mirror of the `AssetResidencyTier` contract. */
const ASSET_RESIDENCY_TIERS: readonly AssetResidencyTier[] = [
  'metadata-only',
  'source-available',
  'cpu-cached',
  'gpu-ready',
  'gpu-resident',
  'loading',
  'evicted',
];

/**
 * Stable, collision-free lease identity for a slot's demand on an asset.
 *
 * The encoding is length-prefixed: `<slotId.length>:<slotId>:<assetId>`. The
 * decimal length plus its first `:` uniquely delimits `slotId`, so arbitrary
 * identifiers can never alias: `('a::b','c')` and `('a','b::c')` — both
 * `a::b::c` under a naive `slotId::assetId` scheme — now differ, as do
 * `('a:',':b')` and `('a','::b')`. Both ids are validated as non-blank strings
 * before encoding. It is deterministic and stable across re-layout: derived
 * only from the logical `ViewSlotId` and `AssetId`, never from a DOM node or
 * the numeric slot index (ADR-010 §6). Two slots demanding the same asset
 * therefore hold two distinct leases on one physical resource, and the opaque
 * id stays opaque to `ResourceManager`.
 */
export function resourceLeaseIdFor(slotId: ViewSlotId, assetId: AssetId): string {
  return `${slotId.length}:${slotId}:${assetId}`;
}

function malformed(detail: string): ResidencyProjectionError {
  return new ResidencyProjectionError(
    'RESIDENCY_PROJECTION_MALFORMED',
    `Resource-demand projection input is malformed: ${detail} Remediation: pass { slots: ViewSlot[], visibility: ReadonlyMap<ViewSlotId, 'visible'|'hidden'> } whose every projectable slot carries a non-blank id and a demand with a non-blank assetId, a valid priority and an array of valid requiredTiers.`,
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

/** Fail-closed refusal for a projectable slot whose nested demand shape is invalid. */
function malformedField(
  slotId: unknown,
  field: 'resourceDemand' | 'demand.priority' | 'demand.requiredTiers',
  value: unknown,
  expected: string,
): ResidencyProjectionError {
  return new ResidencyProjectionError(
    'RESIDENCY_PROJECTION_MALFORMED',
    `Resource-demand projection input is malformed: '${field}' of projectable slot ${describeIdentity(slotId)} must be ${expected} but is ${describeIdentity(value)}. Remediation: declare 'priority' as one of ${RESOURCE_PRIORITIES.join(', ')} and 'requiredTiers' as an array of ${ASSET_RESIDENCY_TIERS.join(', ')} on every projectable slot; hidden, empty, unavailable and demand-less slots stay skipped.`,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAcceptedPriority(value: unknown): value is ResourcePriority {
  return typeof value === 'string' && (RESOURCE_PRIORITIES as readonly string[]).includes(value);
}

function isAcceptedTier(value: unknown): value is AssetResidencyTier {
  return typeof value === 'string' && (ASSET_RESIDENCY_TIERS as readonly string[]).includes(value);
}

/** Narrowing `Array.isArray` wrapper that avoids leaking an implicit `any[]`. */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
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
 * missing visibility entry is hidden). Every slot must be a non-null object
 * (`slots[i]`), and a projectable (active + demanding + visible) slot must
 * carry a non-blank `id` and a `resourceDemand` that is a non-null object with
 * a non-blank `assetId`, a valid `priority` and an array of valid
 * `requiredTiers`; otherwise projection fails closed with
 * `RESIDENCY_PROJECTION_MALFORMED` so a malformed-only lease id can never be
 * emitted and no bare `TypeError` escapes. Each request carries a fresh plain
 * demand copy with no `undefined`-valued keys; inputs are never mutated.
 */
export function projectResourceRetentionRequests(
  input: ProjectResourceRetentionRequestsInput,
): readonly ResourceRetentionRequest[] {
  const source = requireProjectInput(input);
  const requests: ResourceRetentionRequest[] = [];
  for (let index = 0; index < source.slots.length; index += 1) {
    const slot = source.slots[index];
    if (!isObject(slot)) {
      throw malformed(
        `'slots[${index}]' must be a non-null object but is ${describeIdentity(slot)}.`,
      );
    }
    if (slot.status !== 'bound' && slot.status !== 'prepared') continue;
    const demand: unknown = slot.resourceDemand;
    if (demand === undefined) continue;
    if (source.visibility.get(slot.id) !== 'visible') continue;
    if (!isObject(demand)) {
      throw malformedField(slot.id, 'resourceDemand', demand, 'a non-null object');
    }
    if (!isNonBlankString(slot.id)) {
      throw malformedIdentity(slot.id, 'slot.id', slot.id);
    }
    const rawAssetId: unknown = demand.assetId;
    if (!isNonBlankString(rawAssetId)) {
      throw malformedIdentity(slot.id, 'demand.assetId', rawAssetId);
    }
    const rawPriority: unknown = demand.priority;
    if (!isAcceptedPriority(rawPriority)) {
      throw malformedField(
        slot.id,
        'demand.priority',
        rawPriority,
        `one of ${RESOURCE_PRIORITIES.join(', ')}`,
      );
    }
    const rawTiers: unknown = demand.requiredTiers;
    const expectedTiers = `an array of ${ASSET_RESIDENCY_TIERS.join(', ')}`;
    if (!isUnknownArray(rawTiers)) {
      throw malformedField(slot.id, 'demand.requiredTiers', rawTiers, expectedTiers);
    }
    const projectedTiers: AssetResidencyTier[] = [];
    for (const tier of rawTiers) {
      if (!isAcceptedTier(tier)) {
        throw malformedField(slot.id, 'demand.requiredTiers', tier, expectedTiers);
      }
      projectedTiers.push(tier);
    }
    const assetId = rawAssetId as AssetId;
    requests.push({
      leaseId: resourceLeaseIdFor(slot.id, assetId),
      slotId: slot.id,
      demand: {
        assetId,
        priority: rawPriority,
        requiredTiers: projectedTiers,
      },
    });
  }
  return requests;
}
