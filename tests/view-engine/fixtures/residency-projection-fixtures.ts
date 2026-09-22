/**
 * NuClear P4.7 — resource-demand projection fixtures.
 *
 * Statically imports the shared contract fixtures first, registers the
 * repository `ts-resolve-hook` so the real TypeScript product sources can be
 * imported by value, then re-exports the projection/manager seams together
 * with the slot/demand builders and the deterministic residency backend.
 *
 * Pure Node: no DOM, no WebGL, no Cornerstone. The physical `plan` type is
 * never named here — it is supplied only through `makePlan`, so the
 * view-engine boundary (no physical plan type naming) stays intact.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';

import type {
  AssetId,
  AssetResidencyTier,
  ResourceDemand,
  ResourcePriority,
  ViewGroupId,
  ViewSlot,
  ViewSlotId,
  ViewSlotRole,
  ViewSlotStatus,
} from '../../../packages/shared-types/src/index.js';
import type {
  ResourceRetention,
  ResidencySettlementResult,
} from '../../../packages/medical-engine/src/residency/index.ts';
import type {
  ReconcileResourceDemandInput,
  ResourceRetentionRequest,
  SlotVisibility,
} from '../../../packages/view-engine/src/residency/types.ts';
import '../../fixtures/view-contracts.fixture.ts';
import { mockCtAsset, mockPetAsset } from '../../fixtures/clinical-contracts.fixture.ts';

register(new URL('../../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const residencyModule = await import('../../../packages/view-engine/src/residency/index.ts');
const managerModule = await import('../../../packages/medical-engine/src/residency/index.ts');
const residencyFixtures = await import('../../residency/fixtures/residency-fixtures.ts');

export const {
  ResidencyProjectionError,
  projectResourceRetentionRequests,
  reconcileResourceDemand,
  resourceLeaseIdFor,
} = residencyModule;
export const { ResourceManager } = managerModule;
export const { MockResidencyBackend, makePlan } = residencyFixtures;
export { mockCtAsset, mockPetAsset };
export { residencyModule };

export type {
  ReconcileResourceDemandInput,
  ResourceRetention,
  ResourceRetentionRequest,
  ResidencySettlementResult,
  SlotVisibility,
};

export const CT_ASSET = mockCtAsset.id;
export const PET_ASSET = mockPetAsset.id;
export const SLOT_CT = 'view-slot-1-generic' as ViewSlotId;
export const SLOT_PET = 'view-slot-1-pet' as ViewSlotId;
export const SLOT_EXTRA = 'view-slot-1-fusion' as ViewSlotId;
export const SLOT_ABSENT = 'view-slot-2-generic' as ViewSlotId;
export const SLOT_EMPTY = 'view-slot-3-mip' as ViewSlotId;
export const SLOT_UNAVAILABLE = 'view-slot-3-fusion' as ViewSlotId;
export const SLOT_NO_DEMAND = 'view-slot-4-mip' as ViewSlotId;
export const GROUP = 'view-group-1' as ViewGroupId;

/** A small, dependency-free demand declaration for projection tests. */
export function makeDemand(
  assetId: AssetId,
  priority: ResourcePriority = 'visible-interactive',
  requiredTiers: readonly AssetResidencyTier[] = ['gpu-resident'],
): ResourceDemand {
  return { assetId, priority, requiredTiers };
}

/** A frozen plain `ViewSlot`; absent optionals are truly absent, never `undefined`-valued. */
export function makeSlot(
  id: ViewSlotId,
  status: ViewSlotStatus,
  demand?: ResourceDemand,
): ViewSlot {
  const role: ViewSlotRole = 'GENERIC';
  return Object.freeze({
    id,
    groupId: GROUP,
    role,
    status,
    ...(demand === undefined ? {} : { resourceDemand: demand }),
  });
}

/** Builds a `ReadonlyMap` visibility declaration from explicit entries. */
export function visibilityOf(
  ...entries: ReadonlyArray<readonly [ViewSlotId, SlotVisibility]>
): ReadonlyMap<ViewSlotId, SlotVisibility> {
  return new Map(entries);
}

/**
 * Test-local builder seam: maps `assetId -> makePlan(...)` and reports the
 * source `online`, so the manager accepts the retention.
 */
export function buildRetention(request: ResourceRetentionRequest): ResourceRetention {
  const plan = makePlan(request.demand.assetId, `digest-${request.demand.assetId}`);
  return {
    leaseId: request.leaseId,
    plan,
    demand: {
      assetId: request.demand.assetId,
      priority: request.demand.priority,
      requiredTiers: [...request.demand.requiredTiers],
    },
    availability: { state: 'online' },
  };
}

/** Fresh deterministic manager/backend pair. */
export function newManager(): {
  readonly manager: InstanceType<typeof ResourceManager>;
  readonly backend: InstanceType<typeof MockResidencyBackend>;
} {
  const backend = new MockResidencyBackend();
  return { manager: new ResourceManager(backend), backend };
}

export type ResourceRetentionBuilder = (request: ResourceRetentionRequest) => ResourceRetention;

/** Builders that each violate exactly one projection invariant (fail-closed). */
export function mismatchedBuilders(): ReadonlyArray<readonly [string, ResourceRetentionBuilder]> {
  return [
    ['lease id', (request) => ({ ...buildRetention(request), leaseId: 'lease-other' })],
    [
      'priority',
      (request) => {
        const retention = buildRetention(request);
        return { ...retention, demand: { ...retention.demand, priority: 'unused' } };
      },
    ],
    [
      'required tiers',
      (request) => {
        const retention = buildRetention(request);
        return { ...retention, demand: { ...retention.demand, requiredTiers: ['gpu-ready'] } };
      },
    ],
    [
      'asset id',
      (request) => {
        const retention = buildRetention(request);
        return { ...retention, demand: { ...retention.demand, assetId: PET_ASSET } };
      },
    ],
  ];
}

/** Plan volume id derived exactly as `buildRetention` does. */
export function volumeIdFor(assetId: AssetId): string {
  return makePlan(assetId, `digest-${assetId}`).volumeId;
}

/**
 * F2 builders: each omits the opaque physical `plan` or `availability` that
 * the seam must reject as BUILDER_MISMATCH before any manager mutation.
 */
export function dishonestShapeBuilders(): ReadonlyArray<
  readonly [string, ResourceRetentionBuilder]
> {
  return [
    [
      'plan omitted',
      (request: ResourceRetentionRequest) =>
        ({ ...buildRetention(request), plan: undefined }) as unknown as ResourceRetention,
    ],
    [
      'availability omitted',
      (request: ResourceRetentionRequest) =>
        ({ ...buildRetention(request), availability: undefined }) as unknown as ResourceRetention,
    ],
  ];
}

/** One F1 case: a projectable (bound + demand + visible) slot with a bad identity field. */
export interface MalformedIdentityCase {
  readonly label: string;
  readonly slots: readonly ViewSlot[];
  readonly visibility: ReadonlyMap<ViewSlotId, SlotVisibility>;
}

/** F1 cases: blank/missing `slot.id` and blank `demand.assetId`. */
export function malformedIdentityCases(): ReadonlyArray<MalformedIdentityCase> {
  const blankSlotId = '' as ViewSlotId;
  const missingSlotId = undefined as unknown as ViewSlotId;
  const blankAssetId = '' as AssetId;
  return [
    {
      label: 'blank slot id',
      slots: [makeSlot(blankSlotId, 'bound', makeDemand(CT_ASSET))],
      visibility: visibilityOf([blankSlotId, 'visible']),
    },
    {
      label: 'missing slot id',
      slots: [makeSlot(missingSlotId, 'bound', makeDemand(CT_ASSET))],
      visibility: visibilityOf([missingSlotId, 'visible']),
    },
    {
      label: 'blank asset id',
      slots: [makeSlot(SLOT_CT, 'bound', makeDemand(blankAssetId))],
      visibility: visibilityOf([SLOT_CT, 'visible']),
    },
  ];
}

/**
 * F1 assertions: every malformed projectable slot refuses typed as MALFORMED,
 * projects nothing and — through `reconcileResourceDemand` — leaves a fresh
 * manager with zero resources/leases and zero acquisitions.
 */
export function expectMalformedIdentityRefusals(): void {
  const { manager, backend } = newManager();
  for (const { label, slots, visibility } of malformedIdentityCases()) {
    expectProjectionError(
      () => projectResourceRetentionRequests({ slots, visibility }),
      'RESIDENCY_PROJECTION_MALFORMED',
    );
    expectProjectionError(
      () => reconcileResourceDemand({ slots, visibility, manager, buildRetention }),
      'RESIDENCY_PROJECTION_MALFORMED',
    );
    assert.equal(manager.snapshot().resources.length, 0, `${label}: no resource may be created`);
    assert.equal(manager.snapshot().leases.length, 0, `${label}: no lease may be registered`);
    assert.equal(backend.acquireLog.length, 0, `${label}: no physical acquisition may occur`);
  }
}

/** One F1 hostile case: a projectable slot whose nested runtime shape is invalid. */
export interface MalformedShapeCase {
  readonly label: string;
  readonly slots: readonly ViewSlot[];
  readonly visibility: ReadonlyMap<ViewSlotId, SlotVisibility>;
}

function demandOf(value: unknown): ResourceDemand {
  return value as ResourceDemand;
}

function slotWithDemand(value: unknown, status: ViewSlotStatus = 'bound'): ViewSlot {
  return makeSlot(SLOT_CT, status, demandOf(value));
}

/** F1 hostile shapes: each must refuse typed MALFORMED, never a bare `TypeError`. */
export function malformedShapeCases(): ReadonlyArray<MalformedShapeCase> {
  const visible = visibilityOf([SLOT_CT, 'visible']);
  const base = { priority: 'visible-interactive', requiredTiers: ['gpu-resident'] };
  return [
    { label: 'null slot', slots: [null as unknown as ViewSlot], visibility: visible },
    { label: 'null resourceDemand', slots: [slotWithDemand(null)], visibility: visible },
    { label: 'missing assetId', slots: [slotWithDemand({ ...base })], visibility: visible },
    { label: 'blank assetId', slots: [slotWithDemand({ ...base, assetId: '' })], visibility: visible },
    { label: 'bad priority', slots: [slotWithDemand({ ...base, assetId: CT_ASSET, priority: 'urgent' })], visibility: visible },
    { label: 'null requiredTiers', slots: [slotWithDemand({ ...base, assetId: CT_ASSET, requiredTiers: null })], visibility: visible },
    { label: 'missing requiredTiers', slots: [slotWithDemand({ assetId: CT_ASSET, priority: 'visible-interactive' })], visibility: visible },
    { label: 'non-array requiredTiers', slots: [slotWithDemand({ ...base, assetId: CT_ASSET, requiredTiers: 'gpu-resident' })], visibility: visible },
    { label: 'non-tier element', slots: [slotWithDemand({ ...base, assetId: CT_ASSET, requiredTiers: [42] })], visibility: visible },
    { label: 'unknown tier', slots: [slotWithDemand({ ...base, assetId: CT_ASSET, requiredTiers: ['not-a-tier'] })], visibility: visible },
  ];
}

/**
 * F1 assertions: every hostile nested shape refuses typed as MALFORMED (never
 * a bare `TypeError`), projects nothing and — through `reconcileResourceDemand`
 * — leaves a fresh manager with zero resources/leases and zero acquisitions.
 */
export function expectMalformedShapeRefusals(): void {
  const { manager, backend } = newManager();
  for (const { label, slots, visibility } of malformedShapeCases()) {
    expectProjectionError(
      () => projectResourceRetentionRequests({ slots, visibility }),
      'RESIDENCY_PROJECTION_MALFORMED',
    );
    expectProjectionError(
      () => reconcileResourceDemand({ slots, visibility, manager, buildRetention }),
      'RESIDENCY_PROJECTION_MALFORMED',
    );
    assert.equal(manager.snapshot().resources.length, 0, `${label}: no resource may be created`);
    assert.equal(manager.snapshot().leases.length, 0, `${label}: no lease may be registered`);
    assert.equal(backend.acquireLog.length, 0, `${label}: no physical acquisition may occur`);
  }
}

/** F2 ambiguous id pairs that a naive `slotId::assetId` scheme would alias. */
export function collisionIdPairs(): ReadonlyArray<
  readonly [ViewSlotId, AssetId, ViewSlotId, AssetId]
> {
  return [
    ['a::b' as ViewSlotId, 'c' as AssetId, 'a' as ViewSlotId, 'b::c' as AssetId],
    ['a:' as ViewSlotId, ':b' as AssetId, 'a' as ViewSlotId, '::b' as AssetId],
  ];
}

/**
 * F2 assertions: the length-prefixed lease id is injective for ambiguous ids,
 * and reconciliation of two slots that would collide under the old scheme
 * produces two distinct leases and two resident resources — no silent merge.
 */
export function expectCollisionFreeLeases(): void {
  for (const [slotA, assetA, slotB, assetB] of collisionIdPairs()) {
    assert.notEqual(
      resourceLeaseIdFor(slotA, assetA),
      resourceLeaseIdFor(slotB, assetB),
      `('${slotA}','${assetA}') and ('${slotB}','${assetB}') must not share a lease id`,
    );
  }

  const { manager, backend } = newManager();
  const slots = [
    makeSlot('a::b' as ViewSlotId, 'bound', makeDemand('c' as AssetId)),
    makeSlot('a' as ViewSlotId, 'bound', makeDemand('b::c' as AssetId)),
  ];
  const visibility = visibilityOf([slots[0].id, 'visible'], [slots[1].id, 'visible']);
  reconcileResourceDemand({ slots, visibility, manager, buildRetention });

  const snapshot = manager.snapshot();
  assert.equal(snapshot.resources.length, 2, 'two distinct assets stay two physical resources');
  assert.equal(snapshot.leases.length, 2, 'two colliding slots produce two distinct leases');
  assert.equal(new Set(snapshot.leases.map((lease) => lease.leaseId)).size, 2, 'no silent merge');
  for (const lease of snapshot.leases) {
    assert.equal(manager.getResource(lease.volumeId)?.tier, 'gpu-resident', 'each asset stays resident');
  }
  assert.equal(backend.acquireLog.length, 2, 'each distinct asset is acquired once');
}

/**
 * F2 assertions: a builder omitting `plan`/`availability` refuses typed as
 * BUILDER_MISMATCH (never a bare TypeError) and leaves the manager untouched,
 * proving validation precedes the single `manager.reconcile` call.
 */
export function expectDishonestShapeRefusals(): void {
  const { manager, backend } = newManager();
  const slots = [makeSlot(SLOT_CT, 'bound', makeDemand(CT_ASSET))];
  const visibility = visibilityOf([SLOT_CT, 'visible']);
  const before = manager.snapshot();
  assert.equal(before.resources.length, 0);
  for (const [label, builder] of dishonestShapeBuilders()) {
    expectProjectionError(
      () => reconcileResourceDemand({ slots, visibility, manager, buildRetention: builder }),
      'RESIDENCY_PROJECTION_BUILDER_MISMATCH',
    );
    assert.equal(manager.snapshot().resources.length, 0, `${label}: no resource may be created`);
    assert.equal(manager.snapshot().leases.length, 0, `${label}: no lease may be registered`);
    assert.equal(backend.acquireLog.length, 0, `${label}: no physical acquisition may occur`);
  }
  assert.deepEqual(manager.snapshot(), before, 'the manager is untouched by every dishonest builder');
}

export type ProjectionErrorCode = InstanceType<typeof ResidencyProjectionError>['code'];

export function expectProjectionError(run: () => unknown, code: ProjectionErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(
      error instanceof ResidencyProjectionError,
      `expected ResidencyProjectionError, got ${String(error)}`,
    );
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    return true;
  });
}
