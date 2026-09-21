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

import type {
  AssetAvailabilityStatus,
  AssetResidencyTier,
  ResourceDemand,
} from '../../../packages/shared-types/src/index.ts';
import {
  buildVolumeIngestionPlan,
  CornerstoneRendererAdapter,
  createCornerstoneVolumeResidencyBackend,
  RendererError,
  VolumeIngestionError,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import type { VolumeIngestionPlan } from '../../../packages/medical-engine/src/renderer/index.ts';
import {
  ResidencyError,
  ResourceManager,
} from '../../../packages/medical-engine/src/residency/index.ts';
import type { ResourceRetention } from '../../../packages/medical-engine/src/residency/index.ts';
import {
  buildAsset,
  decodeBase64,
  readTypedArray,
  requireComputed,
} from './volume-fixture.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';
import { createBrowserHost, probeWebGL2 } from './adapter-host.ts';

const ENGINE_ID = 'nuclear-residency-probe';

/** NuClear declares `gpu-ready`; `gpu-resident` is not observable in P3.3. */
const REQUIRED_TIERS: readonly AssetResidencyTier[] = ['gpu-ready'];

interface FusionProbeInput {
  ct: VolumeProbeInput;
  pet: VolumeProbeInput;
}

interface ResidencyAck {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  volumeId?: string;
  reloadedVolumeId?: string;
  tier?: string;
  ctTier?: string;
  petTier?: string;
  cacheVolumeIds?: string[];
  residualCacheVolumeIds?: string[];
  acquired?: boolean;
  released?: boolean;
}

interface NuclearResidencyProbe {
  share(input: VolumeProbeInput): ResidencyAck;
  reload(input: VolumeProbeInput): ResidencyAck;
  fusion(input: FusionProbeInput): ResidencyAck;
  availability(input: VolumeProbeInput, state: AssetAvailabilityStatus['state']): ResidencyAck;
  teardown(): ResidencyAck;
}

/** Minimal shape the shared harness reads for its `requireWebGL2` gate. */
interface NuclearRendererProbe {
  webgl2(): ReturnType<typeof probeWebGL2>;
}

declare global {
  var __nuclearResidencyProbe: NuclearResidencyProbe | undefined;
  var __nuclearRendererProbe: NuclearRendererProbe | undefined;
  var __nuclearRendererProbeReady: boolean | undefined;
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

function makeRetention(
  leaseId: string,
  plan: VolumeIngestionPlan,
  state: AssetAvailabilityStatus['state'] = 'online',
): ResourceRetention {
  const demand: ResourceDemand = {
    assetId: plan.assetId,
    priority: 'visible-interactive',
    requiredTiers: REQUIRED_TIERS,
  };
  return { leaseId, plan, demand, availability: { state } };
}

/** Builds the plan through the same Node-safe planner the product uses. */
function planFromInput(input: VolumeProbeInput): VolumeIngestionPlan {
  const evidence = requireComputed(input.expectedGeometry);
  const pixel = input.pixels;
  return buildVolumeIngestionPlan({
    asset: buildAsset(input.fixture, evidence.assetGeometry, pixel, evidence.geometricDigest),
    availability: { state: input.fixture.availability as AssetAvailabilityStatus['state'] },
    classification: {
      supported: input.fixture.classification.supported,
      modality: input.fixture.modality,
      reason: input.fixture.classification.reason,
    },
    geometryEvidence: evidence,
    pixels: {
      dtype: pixel.dtype,
      signedness: pixel.signedness,
      samplesPerPixel: pixel.samplesPerPixel,
      bitsAllocated: pixel.bitsAllocated,
      bitsStored: pixel.bitsStored,
      highBit: pixel.highBit,
      photometricInterpretation: pixel.photometricInterpretation,
      scalarDataDomain: pixel.scalarDataDomain,
      ...(pixel.rescale ? { rescale: pixel.rescale } : {}),
      dimensions: pixel.dimensions,
      scalarData: readTypedArray(decodeBase64(pixel.values), pixel.dtype),
    },
  });
}

function describeError(error: unknown): ResidencyAck {
  if (
    error instanceof VolumeIngestionError ||
    error instanceof RendererError ||
    error instanceof ResidencyError
  ) {
    return { ok: false, name: error.name, code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { ok: false, name: error.name, code: 'UNKNOWN', message: error.message };
  }
  return { ok: false, name: 'Error', code: 'UNKNOWN', message: String(error) };
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
    manager?.reset();
    manager = undefined;
    adapter?.stop();
    adapter = undefined;
    return { ok: true };
  } catch (error) {
    return describeError(error);
  }
}

globalThis.__nuclearRendererProbe = { webgl2: probeWebGL2 };
globalThis.__nuclearResidencyProbe = { share, reload, fusion, availability, teardown };
globalThis.__nuclearRendererProbeReady = true;
