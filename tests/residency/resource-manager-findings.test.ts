/**
 * NuClear P3.3-B — residency findings closed after the P3.3-A review.
 *
 * Split from `resource-manager.test.ts` to respect the 300-line source limit.
 * Pure Node against the deterministic mock backend: no DOM, no WebGL, no
 * Cornerstone. Covers the unverifiable-budget disposition, the lease/volume
 * conflict refusal and the release-ambiguous-confirmed-absent branch.
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
describe('NuClear P3.3-B — residency review findings', () => {
  it('17. a declared budget with no backend measurement acquires as budget-unverified', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend, { budget: { gpuBytes: 32 } });
    const plan = makePlan('asset-unverified', 'digest-17');
    manager.retain(makeRetention('lease-unverified', plan, { requiredTiers: ['gpu-ready'] }));
    const result = manager.settle();
    assert.equal(result.settlements.length, 1);
    const settlement = result.settlements[0];
    assert.equal(settlement.disposition, 'budget-unverified');
    assert.match(String(settlement.message), /gpuBytes/);
    assert.match(String(settlement.message), /no 'gpuBytes' measurement/);
    assert.equal(resourceOf(manager, plan.volumeId).tier, 'gpu-ready');
    assert.equal(backend.acquireLog.length, 1, 'an unverifiable budget still acquires honestly');
  });
  it('18. re-binding one lease to another volume fails closed with LEASE_VOLUME_CONFLICT', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const first = makePlan('asset-conflict-a', 'digest-18a');
    const second = makePlan('asset-conflict-b', 'digest-18b');
    manager.retain(makeRetention('lease-shared', first));
    expectResidencyCode(
      () => manager.retain(makeRetention('lease-shared', second)),
      RESIDENCY_ERROR_CODES.leaseVolumeConflict,
    );
    assert.equal(backend.releaseLog.length, 0, 'a conflict must not mutate physical residency');
    assert.deepEqual(
      manager.snapshot().leases.map((lease) => lease.volumeId),
      [first.volumeId],
    );
  });
  it('19. release false plus enumeration-confirmed absence marks evicted without a failure', () => {
    const backend = new MockResidencyBackend();
    const manager = new ResourceManager(backend);
    const plan = makePlan('asset-absent', 'digest-19');
    manager.retain(makeRetention('lease-absent', plan, { requiredTiers: ['gpu-ready'] }));
    manager.settle();
    manager.release('lease-absent');
    // The backend already forgot the volume, so release reports false while the
    // enumeration confirms it is genuinely absent rather than unknown.
    backend.resident.delete(plan.volumeId);
    const result = manager.settle();
    assert.equal(
      result.evictedVolumeIds.includes(plan.volumeId),
      false,
      'an unconfirmed release is never reported as an eviction',
    );
    assert.equal(resourceOf(manager, plan.volumeId).tier, 'evicted');
    assert.equal(
      result.settlements.some((settlement) => settlement.volumeId === plan.volumeId),
      false,
      'a confirmed-absent volume is not an eviction failure',
    );
  });
});
