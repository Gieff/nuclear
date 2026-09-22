/**
 * NuClear P4.7 — `ResourceDemand` projection & reconciliation (ADR-010 §6).
 *
 * Pure Node: no DOM, WebGL or Cornerstone. Exercises the deterministic
 * demand→request projection, shared-asset lease sharing, eviction/reload that
 * preserves semantic slot identity, the fail-closed builder mismatch that
 * precedes any manager mutation, malformed input handling and the fact that
 * reconciliation is delegated to the real `ResourceManager`. Product seams
 * come from `./fixtures/residency-projection-fixtures.ts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  ResourceRetention,
  ResidencySettlementResult,
} from './fixtures/residency-projection-fixtures.ts';
import {
  CT_ASSET,
  PET_ASSET,
  ResourceManager,
  SLOT_ABSENT,
  SLOT_CT,
  SLOT_EMPTY,
  SLOT_EXTRA,
  SLOT_NO_DEMAND,
  SLOT_PET,
  SLOT_UNAVAILABLE,
  buildRetention,
  expectCollisionFreeLeases,
  expectDishonestShapeRefusals,
  expectMalformedIdentityRefusals,
  expectMalformedShapeRefusals,
  expectProjectionError,
  makeDemand,
  makeSlot,
  mismatchedBuilders,
  newManager,
  projectResourceRetentionRequests,
  reconcileResourceDemand,
  resourceLeaseIdFor,
  visibilityOf,
  volumeIdFor,
} from './fixtures/residency-projection-fixtures.ts';

type Manager = InstanceType<typeof ResourceManager>;

describe('NuClear P4.7 — resource-demand projection & reconciliation (ADR-010 §6)', () => {
  it('a. projects only active, visible, demanding slots in slot order with a fresh demand copy', () => {
    const boundCt = makeSlot(SLOT_CT, 'bound', makeDemand(CT_ASSET));
    const preparedPet = makeSlot(SLOT_PET, 'prepared', makeDemand(PET_ASSET, 'visible-read-only', ['gpu-ready']));
    const hiddenCt = makeSlot(SLOT_EXTRA, 'bound', makeDemand(CT_ASSET));
    const absentCt = makeSlot(SLOT_ABSENT, 'bound', makeDemand(CT_ASSET));
    const emptyCt = makeSlot(SLOT_EMPTY, 'empty', makeDemand(CT_ASSET));
    const unavailablePet = makeSlot(SLOT_UNAVAILABLE, 'unavailable', makeDemand(PET_ASSET));
    const noDemand = makeSlot(SLOT_NO_DEMAND, 'prepared');
    const slots = [boundCt, preparedPet, hiddenCt, absentCt, emptyCt, unavailablePet, noDemand];
    const slotsBefore = structuredClone(slots);
    const visibility = visibilityOf(
      [SLOT_CT, 'visible'],
      [SLOT_PET, 'visible'],
      [SLOT_EXTRA, 'hidden'],
      [SLOT_EMPTY, 'visible'],
      [SLOT_UNAVAILABLE, 'visible'],
      [SLOT_NO_DEMAND, 'visible'],
    );

    assert.ok(resourceLeaseIdFor(SLOT_CT, CT_ASSET).length > 0, 'the lease id is non-empty');

    const requests = projectResourceRetentionRequests({ slots, visibility });
    assert.equal(requests.length, 2, 'hidden/absent/empty/unavailable/no-demand slots project nothing');
    assert.deepEqual(
      requests.map((request) => request.leaseId),
      [resourceLeaseIdFor(SLOT_CT, CT_ASSET), resourceLeaseIdFor(SLOT_PET, PET_ASSET)],
      'output order follows slot order',
    );
    assert.deepEqual(
      requests.map((request) => request.slotId),
      [SLOT_CT, SLOT_PET],
    );

    assert.deepEqual(requests[0].demand, makeDemand(CT_ASSET));
    assert.notEqual(requests[0].demand, boundCt.resourceDemand, 'the projected demand is a fresh copy');
    assert.notEqual(
      requests[0].demand.requiredTiers,
      boundCt.resourceDemand?.requiredTiers,
      'the requiredTiers array is copied, not shared',
    );
    assert.deepEqual(
      Object.keys(requests[0].demand).sort(),
      ['assetId', 'priority', 'requiredTiers'],
      'no undefined-valued keys leak into the projected demand',
    );
    assert.deepEqual(requests[1].demand, makeDemand(PET_ASSET, 'visible-read-only', ['gpu-ready']));

    assert.deepEqual(slots, slotsBefore, 'projection never mutates its input');
    assert.equal(requests[0].demand.assetId, CT_ASSET);
  });

  it('b. two slots demanding the same asset hold two leases on one resource acquired once', () => {
    const { manager, backend } = newManager();
    const slots = [
      makeSlot(SLOT_CT, 'bound', makeDemand(CT_ASSET)),
      makeSlot(SLOT_PET, 'bound', makeDemand(CT_ASSET)),
    ];
    const visibility = visibilityOf([SLOT_CT, 'visible'], [SLOT_PET, 'visible']);

    const result = reconcileResourceDemand({ slots, visibility, manager, buildRetention });

    const snapshot = manager.snapshot();
    assert.equal(snapshot.resources.length, 1, 'one shared asset becomes exactly one resource');
    const leases = snapshot.resources[0].leases.map((lease) => lease.leaseId).sort();
    assert.deepEqual(
      leases,
      [resourceLeaseIdFor(SLOT_CT, CT_ASSET), resourceLeaseIdFor(SLOT_PET, CT_ASSET)].sort(),
      'two distinct leases reference the one resource',
    );
    assert.equal(snapshot.resources[0].tier, 'gpu-resident');
    assert.equal(backend.acquireLog.length, 1, 'the shared volume is acquired once');
    assert.deepEqual(
      result.leases.map((lease) => lease.leaseId).sort(),
      leases,
      'the settlement reports the two leases',
    );
  });

  it('c. distinct assets are separate resources; removing demand keeps the other and evicts once', () => {
    const { manager, backend } = newManager();
    const ctVolumeId = volumeIdFor(CT_ASSET);
    const petVolumeId = volumeIdFor(PET_ASSET);
    const ctSlot = makeSlot(SLOT_CT, 'bound', makeDemand(CT_ASSET));
    const petSlot = makeSlot(SLOT_PET, 'bound', makeDemand(PET_ASSET));
    const ctVisible = visibilityOf([SLOT_CT, 'visible']);
    const bothVisible = visibilityOf([SLOT_CT, 'visible'], [SLOT_PET, 'visible']);

    reconcileResourceDemand({ slots: [ctSlot, petSlot], visibility: bothVisible, manager, buildRetention });
    assert.equal(manager.snapshot().resources.length, 2, 'two distinct assets are two resources');
    assert.equal(manager.getResource(ctVolumeId)?.tier, 'gpu-resident');
    assert.equal(manager.getResource(petVolumeId)?.tier, 'gpu-resident');

    reconcileResourceDemand({ slots: [ctSlot], visibility: ctVisible, manager, buildRetention });
    assert.equal(manager.getResource(ctVolumeId)?.tier, 'gpu-resident', 'the retained slot stays resident');
    assert.equal(manager.getResource(petVolumeId)?.tier, 'evicted', 'the removed slot is evicted');
    assert.equal(
      backend.releaseLog.filter((volumeId) => volumeId === petVolumeId).length,
      1,
      'the removed volume is released exactly once',
    );

    const final = reconcileResourceDemand({ slots: [], visibility: visibilityOf(), manager, buildRetention });
    assert.equal(manager.snapshot().leases.length, 0);
    assert.equal(manager.getResource(ctVolumeId)?.tier, 'evicted');
    assert.equal(
      backend.releaseLog.filter((volumeId) => volumeId === ctVolumeId).length,
      1,
      'the second volume is evicted exactly once',
    );
    assert.deepEqual(final.evictedVolumeIds, [ctVolumeId]);
  });

  it('d. eviction preserves slot identity and reload restores residency with the same volumeId', () => {
    const { manager, backend } = newManager();
    const ctVolumeId = volumeIdFor(CT_ASSET);
    const slot = makeSlot(SLOT_CT, 'bound', makeDemand(CT_ASSET));
    const slots = [slot];
    const slotsBefore = structuredClone(slots);
    const visible = visibilityOf([SLOT_CT, 'visible']);

    reconcileResourceDemand({ slots, visibility: visible, manager, buildRetention });
    assert.equal(backend.acquireLog.length, 1);

    const evicted = reconcileResourceDemand({ slots: [], visibility: visibilityOf(), manager, buildRetention });
    assert.deepEqual(evicted.evictedVolumeIds, [ctVolumeId]);
    assert.equal(manager.getResource(ctVolumeId)?.tier, 'evicted');

    assert.equal(slots[0], slot, 'the semantic ViewSlot object identity is untouched');
    assert.deepEqual(slots, slotsBefore, 'the ViewSlot values are deep-equal across reconcile/evict');
    assert.equal(manager.getResource(ctVolumeId)?.assetId, CT_ASSET, 'semantic asset identity survives eviction');

    reconcileResourceDemand({ slots, visibility: visible, manager, buildRetention });
    assert.equal(backend.acquireLog.length, 2, 're-declaring demand restores physical residency');
    assert.equal(
      backend.acquireLog[1].volumeId,
      backend.acquireLog[0].volumeId,
      'reload reconstructs the same physical volumeId',
    );
    assert.equal(manager.getResource(ctVolumeId)?.tier, 'gpu-resident');
    assert.equal(manager.snapshot().leases.length, 1);
  });

  it('e. a builder mismatch is refused before manager.reconcile and leaves the manager untouched', () => {
    const { manager, backend } = newManager();
    const slots = [makeSlot(SLOT_CT, 'bound', makeDemand(CT_ASSET))];
    const visibility = visibilityOf([SLOT_CT, 'visible']);
    const before = manager.snapshot();
    assert.equal(before.resources.length, 0);

    for (const [label, builder] of mismatchedBuilders()) {
      expectProjectionError(
        () => reconcileResourceDemand({ slots, visibility, manager, buildRetention: builder }),
        'RESIDENCY_PROJECTION_BUILDER_MISMATCH',
      );
      assert.equal(manager.snapshot().resources.length, 0, `${label}: no resource may be created`);
      assert.equal(manager.snapshot().leases.length, 0, `${label}: no lease may be registered`);
      assert.equal(backend.acquireLog.length, 0, `${label}: no physical acquisition may occur`);
    }
    assert.deepEqual(manager.snapshot(), before, 'the manager is byte-for-byte unchanged by every refusal');
  });

  it('f. malformed/partial input fails closed with a typed error, never a bare TypeError', () => {
    const { manager } = newManager();
    const slots = [makeSlot(SLOT_CT, 'bound', makeDemand(CT_ASSET))];
    const visibility = visibilityOf([SLOT_CT, 'visible']);

    const malformedProject = [
      () => projectResourceRetentionRequests(null as never),
      () => projectResourceRetentionRequests(undefined as never),
      () => projectResourceRetentionRequests('not-an-input' as never),
      () => projectResourceRetentionRequests({} as never),
      () => projectResourceRetentionRequests({ slots } as never),
      () => projectResourceRetentionRequests({ visibility } as never),
    ];
    for (const run of malformedProject) {
      expectProjectionError(run, 'RESIDENCY_PROJECTION_MALFORMED');
    }

    const malformedReconcile = [
      () => reconcileResourceDemand(null as never),
      () => reconcileResourceDemand(undefined as never),
      () => reconcileResourceDemand({ visibility, manager, buildRetention } as never),
      () => reconcileResourceDemand({ slots, manager, buildRetention } as never),
      () => reconcileResourceDemand({ slots, visibility, buildRetention } as never),
      () => reconcileResourceDemand({ slots, visibility, manager } as never),
    ];
    for (const run of malformedReconcile) {
      expectProjectionError(run, 'RESIDENCY_PROJECTION_MALFORMED');
    }

    assert.equal(manager.snapshot().resources.length, 0, 'no malformed call mutated the manager');
    assert.equal(manager.snapshot().leases.length, 0);
  });

  it('g. reconciles through manager.reconcile and retains a shared asset once', () => {
    const { manager, backend } = newManager();
    const slots = [
      makeSlot(SLOT_CT, 'bound', makeDemand(CT_ASSET)),
      makeSlot(SLOT_PET, 'bound', makeDemand(CT_ASSET)),
    ];
    const visibility = visibilityOf([SLOT_CT, 'visible'], [SLOT_PET, 'visible']);

    // Delegation proof: a spy manager records the exact retentions it receives.
    const sentinel: ResidencySettlementResult = {
      settlements: [],
      evictedVolumeIds: [],
      resources: [],
      leases: [],
    };
    let received: readonly ResourceRetention[] | undefined;
    const spy = {
      reconcile: (retentions: readonly ResourceRetention[]): ResidencySettlementResult => {
        received = retentions;
        return sentinel;
      },
    };
    const delegated = reconcileResourceDemand({
      slots,
      visibility,
      manager: spy as unknown as Manager,
      buildRetention,
    });
    assert.equal(delegated, sentinel, 'the manager settlement is returned unchanged');
    assert.ok(received !== undefined, 'manager.reconcile was called');
    assert.deepEqual(
      received?.map((retention) => retention.leaseId).sort(),
      [resourceLeaseIdFor(SLOT_CT, CT_ASSET), resourceLeaseIdFor(SLOT_PET, CT_ASSET)].sort(),
      'the manager receives the projected leases',
    );
    assert.equal(backend.acquireLog.length, 0, 'the spy performed no physical work');

    // Real manager: a shared asset is one resource, acquired and released once.
    const full = reconcileResourceDemand({ slots, visibility, manager, buildRetention });
    assert.equal(manager.snapshot().resources.length, 1);
    assert.equal(manager.snapshot().leases.length, 2);
    assert.equal(backend.acquireLog.length, 1, 'a shared asset is retained once per volume');
    assert.equal(full.leases.length, 2);

    const removed = reconcileResourceDemand({ slots: [], visibility: visibilityOf(), manager, buildRetention });
    assert.equal(manager.snapshot().leases.length, 0);
    assert.equal(manager.snapshot().resources[0].tier, 'evicted');
    assert.equal(backend.releaseLog.length, 1, 'the shared volume is evicted exactly once');
    assert.deepEqual(removed.evictedVolumeIds, [volumeIdFor(CT_ASSET)]);
  });

  it('h. a projectable slot with a blank/missing id or blank asset id fails closed as MALFORMED', expectMalformedIdentityRefusals);

  it('i. a builder omitting plan/availability fails closed as BUILDER_MISMATCH before any reconcile', expectDishonestShapeRefusals);

  it('j. hostile nested runtime shapes fail closed as MALFORMED, never a bare TypeError', expectMalformedShapeRefusals);

  it('k. length-prefixed lease ids are collision-free and never silently merge', expectCollisionFreeLeases);
});
