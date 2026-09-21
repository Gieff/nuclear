/**
 * NuClear P3.3-B — browser-side real Cornerstone residency probe
 * (test infrastructure).
 *
 * Bundled by esbuild into `tests/rendering/.harness/` and driven by the
 * Playwright harness. It starts the real `CornerstoneRendererAdapter` on a real
 * WebGL 2 browser host, builds the real Cornerstone residency backend and drives
 * the pure `ResourceManager` over the real `cache`. Every result is plain and
 * serializable because custom `Error` fields do not survive `page.evaluate`.
 *
 * This file is NOT product UI and is never reachable from product code.
 */

import { cache } from '@cornerstonejs/core';

import type { AssetAvailabilityStatus } from '../../../packages/shared-types/src/index.ts';
import {
  CornerstoneRendererAdapter,
  createCornerstoneVolumeResidencyBackend,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import { ResourceManager } from '../../../packages/medical-engine/src/residency/index.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';
import { createBrowserHost, probeWebGL2 } from './adapter-host.ts';
import {
  describeError,
  makeRetention,
  planFromInput,
  type FusionProbeInput,
  type ResidencyAck,
} from './residency-plan.ts';

const ENGINE_ID = 'nuclear-residency-probe';

interface NuclearResidencyProbe {
  share(input: VolumeProbeInput): ResidencyAck;
  reload(input: VolumeProbeInput): ResidencyAck;
  fusion(input: FusionProbeInput): ResidencyAck;
  availability(input: VolumeProbeInput, state: AssetAvailabilityStatus['state']): ResidencyAck;
  strictReload(input: VolumeProbeInput): ResidencyAck;
  disposeAfterSettle(input: VolumeProbeInput): ResidencyAck;
  teardown(): ResidencyAck;
}

declare global {
  var __nuclearResidencyProbe: NuclearResidencyProbe | undefined;
}

let adapter: CornerstoneRendererAdapter | undefined;
let manager: ResourceManager | undefined;

function ensureAdapter(): CornerstoneRendererAdapter {
  adapter ??= CornerstoneRendererAdapter.start(createBrowserHost(), { engineId: ENGINE_ID });
  return adapter;
}

function ensureManager(): ResourceManager {
  manager ??= new ResourceManager(createCornerstoneVolumeResidencyBackend(ensureAdapter()));
  return manager;
}

/** The real Cornerstone cache enumeration, used as the residency witness. */
function cacheVolumeIds(): string[] {
  return cache.getVolumes().map((volume) => volume.volumeId);
}

/** Two leases share one volume; eviction happens only after both release. */
function share(input: VolumeProbeInput): ResidencyAck {
  try {
    const plan = planFromInput(input);
    const resident = ensureManager();
    resident.retain(makeRetention('residency-share-a', plan));
    resident.retain(makeRetention('residency-share-b', plan));
    resident.settle();
    resident.release('residency-share-a');
    const tier = resident.getResource(plan.volumeId)?.tier;
    const sharedCache = cacheVolumeIds();
    resident.release('residency-share-b');
    const evicted = resident.evictUnreferenced();
    return {
      ok: true,
      volumeId: plan.volumeId,
      tier,
      cacheVolumeIds: sharedCache,
      residualCacheVolumeIds: cacheVolumeIds(),
      released: evicted.includes(plan.volumeId),
    };
  } catch (error) {
    return describeError(error);
  }
}

/** Evict, then reload the same plan and confirm the same volumeId is cached. */
function reload(input: VolumeProbeInput): ResidencyAck {
  try {
    const plan = planFromInput(input);
    const resident = ensureManager();
    resident.retain(makeRetention('residency-reload-first', plan));
    const first = resident.settle();
    resident.release('residency-reload-first');
    const evicted = resident.evictUnreferenced();
    const residual = cacheVolumeIds();
    resident.retain(makeRetention('residency-reload-second', plan));
    resident.settle();
    const recached = cacheVolumeIds();
    return {
      ok: true,
      volumeId: first.settlements[0]?.volumeId ?? plan.volumeId,
      reloadedVolumeId: recached[0],
      tier: resident.getResource(plan.volumeId)?.tier,
      acquired: first.settlements[0]?.disposition === 'resident',
      cacheVolumeIds: recached,
      residualCacheVolumeIds: residual,
      released: evicted.includes(plan.volumeId),
    };
  } catch (error) {
    return describeError(error);
  }
}

/** Strict adapter load -> release -> load on the same volumeId must survive. */
function strictReload(input: VolumeProbeInput): ResidencyAck {
  try {
    const plan = planFromInput(input);
    const renderer = ensureAdapter();
    renderer.loadVolume(plan);
    const first = cacheVolumeIds();
    renderer.releaseVolume(plan.volumeId);
    const residual = cacheVolumeIds();
    renderer.loadVolume(plan);
    const recached = cacheVolumeIds();
    return {
      ok: true,
      volumeId: plan.volumeId,
      reloadedVolumeId: recached[0],
      acquired: first.includes(plan.volumeId),
      released: residual.length === 0,
      cacheVolumeIds: recached,
      residualCacheVolumeIds: residual,
    };
  } catch (error) {
    return describeError(error);
  }
}

/** Terminal dispose must release the real volume and empty the snapshot. */
function disposeAfterSettle(input: VolumeProbeInput): ResidencyAck {
  try {
    const plan = planFromInput(input);
    const resident = ensureManager();
    resident.retain(makeRetention('residency-dispose-live', plan));
    const settled = resident.settle();
    const disposal = resident.dispose();
    const snapshot = resident.snapshot();
    return {
      ok: true,
      volumeId: plan.volumeId,
      acquired: settled.settlements[0]?.disposition === 'resident',
      released: disposal.evictedVolumeIds.includes(plan.volumeId),
      cacheVolumeIds: cacheVolumeIds(),
      snapshotVolumeIds: snapshot.resources.map((resource) => resource.volumeId),
      snapshotLeaseCount: snapshot.leases.length,
    };
  } catch (error) {
    return describeError(error);
  }
}

/** A fusion retains CT and PET separately; evicting CT leaves PET resident. */
function fusion(input: FusionProbeInput): ResidencyAck {
  try {
    const ctPlan = planFromInput(input.ct);
    const petPlan = planFromInput(input.pet);
    const resident = ensureManager();
    resident.retain(makeRetention('residency-fusion-ct', ctPlan));
    resident.retain(makeRetention('residency-fusion-pet', petPlan));
    resident.settle();
    resident.release('residency-fusion-ct');
    resident.evictUnreferenced();
    return {
      ok: true,
      ctTier: resident.getResource(ctPlan.volumeId)?.tier,
      petTier: resident.getResource(petPlan.volumeId)?.tier,
      cacheVolumeIds: cacheVolumeIds(),
    };
  } catch (error) {
    return describeError(error);
  }
}

/** A non-online availability must refuse before any live volume exists. */
function availability(
  input: VolumeProbeInput,
  state: AssetAvailabilityStatus['state'],
): ResidencyAck {
  try {
    const plan = planFromInput(input);
    ensureManager().retain(makeRetention(`residency-availability-${state}`, plan, state));
    return { ok: true, message: `availability '${state}' was unexpectedly retained` };
  } catch (error) {
    const ack = describeError(error);
    ack.cacheVolumeIds = cacheVolumeIds();
    return ack;
  }
}

function teardown(): ResidencyAck {
  try {
    manager?.dispose();
    manager = undefined;
    adapter?.stop();
    adapter = undefined;
    return { ok: true };
  } catch (error) {
    return describeError(error);
  }
}

globalThis.__nuclearRendererProbe = { webgl2: probeWebGL2 };
globalThis.__nuclearResidencyProbe = {
  share,
  reload,
  fusion,
  availability,
  strictReload,
  disposeAfterSettle,
  teardown,
};
globalThis.__nuclearRendererProbeReady = true;
