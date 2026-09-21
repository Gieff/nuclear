/**
 * NuClear P3.3-A — pure `ResourceManager` residency tests.
 *
 * Runs entirely in Node against the deterministic mock backend: no DOM, no
 * WebGL, no Cornerstone. Covers lease sharing/accounting, demand
 * reconciliation without transient eviction, priority-ordered budget eviction,
 * reload, typed failure dispositions and semantic-identity preservation.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';
register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));
const { ResourceManager, RESIDENCY_ERROR_CODES, ResidencyError } = await import(
  '../../packages/medical-engine/src/residency/index.ts'
);
const { MockResidencyBackend, makePlan, makeRetention } = await import(
  './fixtures/residency-fixtures.ts'
);
type Manager = InstanceType<typeof ResourceManager>;
function resourceOf(manager: Manager, volumeId: string) {
  const resource = manager.getResource(volumeId);
  assert.ok(resource !== undefined, `expected snapshot for '${volumeId}'`);
  return resource;
}
function expectResidencyCode(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ResidencyError, `expected ResidencyError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    return true;
  });
}
describe('NuClear P3.3-A — ResourceManager residency core', () => {
  it('1. duplicate retain of the same lease is idempotent', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const plan = makePlan('asset-ct', 'digest-1');
    const retention = makeRetention('lease-1', plan, {
      priority: 'prepared-hidden',
      requiredTiers: ['gpu-ready'],
    });
    manager.retain(retention);
    manager.retain(retention);
    const snapshot = manager.snapshot();
    assert.equal(snapshot.resources.length, 1);
    assert.equal(snapshot.leases.length, 1);
    assert.equal(snapshot.resources[0].leases.length, 1);
    assert.equal(resourceOf(manager, plan.volumeId).tier, 'source-available');
    assert.equal(backend.acquireLog.length, 0, 'retain must not acquire physically');
  });
  it('2. two leases on one volume block eviction until both are released', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const plan = makePlan('asset-pet', 'digest-2');
    manager.retain(makeRetention('lease-a', plan));
    manager.retain(makeRetention('lease-b', plan));
    manager.settle();
    assert.equal(resourceOf(manager, plan.volumeId).tier, 'gpu-resident');
    manager.release('lease-a');
    assert.deepEqual(manager.evictUnreferenced(), [], 'one live lease still pins the volume');
    assert.equal(resourceOf(manager, plan.volumeId).tier, 'gpu-resident');
    manager.release('lease-b');
    assert.deepEqual(manager.evictUnreferenced(), [plan.volumeId]);
    assert.equal(resourceOf(manager, plan.volumeId).tier, 'evicted');
  });
  it('3. fusion retains CT and PET as two separate resources', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const ctPlan = makePlan('asset-ct', 'digest-ct');
    const petPlan = makePlan('asset-pet', 'digest-pet');
    manager.retain(makeRetention('fusion-ct', ctPlan));
    manager.retain(makeRetention('fusion-pet', petPlan));
    const result = manager.settle();
    assert.equal(result.resources.length, 2);
    assert.equal(resourceOf(manager, ctPlan.volumeId).tier, 'gpu-resident');
    assert.equal(resourceOf(manager, petPlan.volumeId).tier, 'gpu-resident');
    manager.release('fusion-ct');
    assert.deepEqual(manager.evictUnreferenced(), [ctPlan.volumeId]);
    assert.equal(resourceOf(manager, petPlan.volumeId).tier, 'gpu-resident');
  });
  it('4. reconcile re-binds a reused volume without a transient eviction', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const plan = makePlan('asset-reused', 'digest-4');
    manager.retain(makeRetention('lease-old', plan));
    manager.settle();
    const result = manager.reconcile([makeRetention('lease-new', plan)]);
    assert.equal(backend.releaseLog.includes(plan.volumeId), false);
    assert.equal(resourceOf(manager, plan.volumeId).tier, 'gpu-resident');
    assert.deepEqual(result.leases.map((lease) => lease.leaseId), ['lease-new']);
    assert.equal(backend.acquireLog.length, 1, 'resident volume must not be re-acquired');
  });
  it('5. a pending retain is protected before settle', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const plan = makePlan('asset-pending', 'digest-5');
    manager.retain(makeRetention('lease-pending', plan, { requiredTiers: ['gpu-ready'] }));
    assert.equal(resourceOf(manager, plan.volumeId).tier, 'source-available');
    assert.equal(backend.acquireLog.length, 0);
    assert.deepEqual(manager.evictUnreferenced(), [], 'a leased pending resource is not evictable');
    assert.ok(manager.getResource(plan.volumeId) !== undefined);
    const result = manager.settle();
    assert.equal(resourceOf(manager, plan.volumeId).tier, 'gpu-ready');
    assert.equal(result.settlements[0].disposition, 'resident');
    assert.equal(backend.acquireLog.length, 1);
  });
  it('6. eviction removes only zero-lease resources and preserves identity', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const kept = makePlan('asset-kept', 'digest-6a');
    const dropped = makePlan('asset-dropped', 'digest-6b');
    manager.retain(makeRetention('lease-kept', kept));
    manager.retain(makeRetention('lease-dropped', dropped));
    manager.settle();
    manager.release('lease-dropped');
    assert.deepEqual(manager.evictUnreferenced(), [dropped.volumeId]);
    const evicted = resourceOf(manager, dropped.volumeId);
    assert.equal(evicted.tier, 'evicted');
    assert.equal(evicted.assetId, dropped.assetId);
    assert.equal(evicted.geometricDigest, dropped.provenance.geometricDigest);
    assert.equal(evicted.leases.length, 0);
    assert.equal(resourceOf(manager, kept.volumeId).tier, 'gpu-resident');
  });
  it('7. reload reconstructs the same volumeId from the validated plan', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const plan = makePlan('asset-reload', 'digest-7');
    manager.retain(makeRetention('lease-first', plan));
    manager.settle();
    manager.release('lease-first');
    assert.deepEqual(manager.evictUnreferenced(), [plan.volumeId]);
    assert.equal(resourceOf(manager, plan.volumeId).tier, 'evicted');
    manager.retain(makeRetention('lease-second', plan));
    manager.settle();
    assert.equal(resourceOf(manager, plan.volumeId).tier, 'gpu-resident');
    assert.equal(backend.acquireLog.length, 2);
    assert.equal(backend.acquireLog[1].volumeId, plan.volumeId);
  });
  it('8a. budget eviction honours declared priority order', () => {
    const backend = new MockResidencyBackend({
      measurements: { 'gpu-ready': { byteSizeVRAM: 40 } },
    });
    const manager = new ResourceManager(backend, { budget: { gpuBytes: 80 } });
    const low = makePlan('asset-low', 'digest-8a-low');
    const high = makePlan('asset-high', 'digest-8a-high');
    manager.retain(makeRetention('lease-low', low, { priority: 'unused', requiredTiers: ['gpu-ready'] }));
    manager.retain(
      makeRetention('lease-high', high, { priority: 'visible-interactive', requiredTiers: ['gpu-ready'] }),
    );
    manager.settle();
    manager.release('lease-low');
    manager.release('lease-high');
    const fresh = makePlan('asset-fresh', 'digest-8a-fresh');
    manager.retain(makeRetention('lease-fresh', fresh, { requiredTiers: ['gpu-ready'] }));
    const result = manager.settle();
    assert.deepEqual(result.evictedVolumeIds, [low.volumeId, high.volumeId]);
    assert.equal(resourceOf(manager, fresh.volumeId).tier, 'gpu-ready');
  });
  it('8b. budget eviction breaks equal priority by registration sequence', () => {
    const backend = new MockResidencyBackend({
      measurements: { 'gpu-ready': { byteSizeVRAM: 40 } },
    });
    const manager = new ResourceManager(backend, { budget: { gpuBytes: 80 } });
    const earlier = makePlan('asset-earlier', 'digest-8b-earlier');
    const later = makePlan('asset-later', 'digest-8b-later');
    manager.retain(
      makeRetention('lease-earlier', earlier, { priority: 'prefetch-candidate', requiredTiers: ['gpu-ready'] }),
    );
    manager.retain(
      makeRetention('lease-later', later, { priority: 'prefetch-candidate', requiredTiers: ['gpu-ready'] }),
    );
    manager.settle();
    manager.release('lease-earlier');
    manager.release('lease-later');
    const fresh = makePlan('asset-fresh-2', 'digest-8b-fresh');
    manager.retain(makeRetention('lease-fresh-2', fresh, { requiredTiers: ['gpu-ready'] }));
    const result = manager.settle();
    assert.deepEqual(result.evictedVolumeIds, [earlier.volumeId, later.volumeId]);
  });
  it('9. insufficient budget yields budget-exhausted and no false gpu residency', () => {
    const backend = new MockResidencyBackend({
      measurements: { 'gpu-ready': { byteSizeVRAM: 40 } },
    });
    const manager = new ResourceManager(backend, { budget: { gpuBytes: 10 } });
    const plan = makePlan('asset-starved', 'digest-9');
    manager.retain(makeRetention('lease-starved', plan, { requiredTiers: ['gpu-ready'] }));
    const result = manager.settle();
    assert.equal(result.settlements.length, 1);
    assert.equal(result.settlements[0].disposition, 'budget-exhausted');
    const tier = resourceOf(manager, plan.volumeId).tier;
    assert.notEqual(tier, 'gpu-ready');
    assert.notEqual(tier, 'gpu-resident');
    assert.equal(tier, 'source-available');
    assert.equal(backend.acquireLog.length, 0);
  });
  it('10. loader failure yields loader-failed with identity preserved and no throw', () => {
    const backend = new MockResidencyBackend();
    backend.acquireThrows = new Error('loader exploded');
    const manager = new ResourceManager(backend);
    const plan = makePlan('asset-loader', 'digest-10');
    manager.retain(makeRetention('lease-loader', plan));
    const result = manager.settle();
    assert.equal(result.settlements[0].disposition, 'loader-failed');
    assert.ok((result.settlements[0].message ?? '').includes('loader exploded'));
    const snapshot = resourceOf(manager, plan.volumeId);
    assert.equal(snapshot.tier, 'source-available');
    assert.equal(snapshot.assetId, plan.assetId);
    assert.equal(snapshot.geometricDigest, plan.provenance.geometricDigest);
  });
  it('11. enumeration failure during eviction yields enumeration-failed', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const plan = makePlan('asset-enum', 'digest-11');
    manager.retain(makeRetention('lease-enum', plan));
    manager.settle();
    manager.release('lease-enum');
    backend.resident.delete(plan.volumeId);
    backend.listThrows = new Error('enumeration exploded');
    const result = manager.settle();
    const failure = result.settlements.find((entry) => entry.disposition === 'enumeration-failed');
    assert.ok(failure !== undefined, 'expected an enumeration-failed settlement');
    assert.equal(result.evictedVolumeIds.includes(plan.volumeId), false);
    const snapshot = resourceOf(manager, plan.volumeId);
    assert.notEqual(snapshot.tier, 'evicted');
    assert.equal(snapshot.assetId, plan.assetId);
    assert.equal(snapshot.geometricDigest, plan.provenance.geometricDigest);
  });
  it('12. missing, mismatch and offline-cached availabilities all fail closed', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const plan = makePlan('asset-avail', 'digest-12');
    for (const state of ['missing', 'mismatch', 'offline-cached'] as const) {
      expectResidencyCode(
        () => manager.retain(makeRetention(`lease-${state}`, plan, { availability: { state } })),
        RESIDENCY_ERROR_CODES.sourceUnavailable,
      );
    }
  });
  it('13. a lease assetId that disagrees with the plan fails closed', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const plan = makePlan('asset-lease', 'digest-13');
    expectResidencyCode(
      () => manager.retain(makeRetention('lease-x', plan, { demandAssetId: 'asset-other' })),
      RESIDENCY_ERROR_CODES.leaseAssetMismatch,
    );
  });
  it('14. invalid demand tiers are rejected before mutation', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const plan = makePlan('asset-demand', 'digest-14');
    const invalid: Array<readonly ('loading' | 'evicted' | 'gpu-ready')[]> = [
      [],
      ['loading'],
      ['evicted'],
      ['gpu-ready', 'loading'],
    ];
    for (const tiers of invalid) {
      expectResidencyCode(
        () => manager.retain(makeRetention('lease-demand', plan, { requiredTiers: tiers })),
        RESIDENCY_ERROR_CODES.invalidDemand,
      );
    }
    assert.equal(manager.snapshot().resources.length, 0, 'no resource may be created on refusal');
  });
  it('15. releasing an unknown lease is a safe typed no-op', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const result = manager.release('lease-never-retained');
    assert.deepEqual(result, { released: false });
  });
  it('16. the manager never evicts a leased resource while zero-lease ones exist', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const leased = makePlan('asset-leased', 'digest-16a');
    const idle = makePlan('asset-idle', 'digest-16b');
    manager.retain(makeRetention('lease-live', leased));
    manager.retain(makeRetention('lease-idle', idle));
    manager.settle();
    manager.release('lease-idle');
    assert.deepEqual(manager.evictUnreferenced(), [idle.volumeId]);
    assert.equal(resourceOf(manager, leased.volumeId).tier, 'gpu-resident');
    assert.equal(backend.releaseLog.includes(leased.volumeId), false);
  });
});
