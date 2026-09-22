/**
 * NuClear P4.8 — hostile/fail-closed projection fixtures.
 *
 * Split out of `residency-projection-fixtures.ts` (Rule 02 file-size gate) so
 * the base fixture keeps the `ts-resolve-hook` registration, product-seam
 * re-exports and constructive builders while the adversarial
 * (malformed/collision/dishonest) cases live here.
 *
 * Importing this module evaluates the base fixture first, so the
 * `ts-resolve-hook` is registered before any product source is imported by
 * value. The dependency is one-way: the base never imports this file.
 *
 * Pure Node: no DOM, no WebGL, no Cornerstone.
 */
import assert from 'node:assert/strict';

import type {
  AssetId,
  ResourceDemand,
  ViewSlot,
  ViewSlotId,
  ViewSlotStatus,
} from '../../../packages/shared-types/src/index.js';
import type { SlotVisibility } from './residency-projection-fixtures.ts';
import {
  CT_ASSET,
  SLOT_CT,
  buildRetention,
  dishonestShapeBuilders,
  expectProjectionError,
  makeDemand,
  makeSlot,
  newManager,
  projectResourceRetentionRequests,
  reconcileResourceDemand,
  resourceLeaseIdFor,
  visibilityOf,
} from './residency-projection-fixtures.ts';

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
