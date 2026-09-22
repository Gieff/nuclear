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
