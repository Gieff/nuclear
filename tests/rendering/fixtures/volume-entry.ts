/**
 * NuClear P3.2 — browser-side volume ingestion probe (test infrastructure).
 *
 * Bundled by esbuild into `tests/rendering/.harness/` and driven by the
 * Playwright harness. It exercises the real `CornerstoneRendererAdapter` and
 * `cache` in a real browser, but every ingestion decision is made by the same
 * Node-safe `buildVolumeIngestionPlan` the product uses. It exposes plain,
 * serializable results on `globalThis.__nuclearVolumeProbe` (custom `Error`
 * fields do not survive `page.evaluate`).
 *
 * This file is NOT product UI and is never reachable from product code.
 */

import { cache, volumeLoader } from '@cornerstonejs/core';

import type { AssetAvailabilityStatus } from '../../../packages/shared-types/src/index.ts';
import {
  buildVolumeIngestionPlan,
  CornerstoneRendererAdapter,
  RendererError,
  VolumeIngestionError,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import { localVolumeConstructor } from '../../../packages/medical-engine/src/renderer/volume-binding.ts';
import {
  buildAsset,
  decodeBase64,
  readTypedArray,
  requireComputed,
} from './volume-fixture.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';
import { createBrowserHost, probeWebGL2 } from './adapter-host.ts';

const ENGINE_ID = 'nuclear-volume-probe';

interface VolumeProbeSuccess {
  ok: true;
  declaredScalarDataDomain: string;
  volumeId: string;
  scalarLength: number;
  cornerDimensions: number[];
  cornerSpacing: number[];
  cornerOrigin: number[];
  cornerDirection: number[];
  sliceOneWorld: number[];
  firstCornerWorld: number[];
  lastCornerWorld: number[];
  worldBounds: number[];
  firstScalar: number;
  lastScalar: number;
  metadata: {
    BitsAllocated: number;
    BitsStored: number;
    PixelRepresentation: number;
    SamplesPerPixel: number;
    PixelSpacing: number[];
    ImageOrientationPatient: number[];
  };
}

/** Compact error/ack shape for control methods, where custom errors do not cross the page. */
interface VolumeProbeAck {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  /** `VolumeIngestionError.cause.message`, preserved across the page boundary. */
  causeMessage?: string;
  /** Whether the cache still holds the volume after the reported operation. */
  residualCached?: boolean;
  /** Whether the injected constructor registered a volume before throwing. */
  registeredDuringInjection?: boolean;
}

interface NuclearVolumeProbe {
  load(input: VolumeProbeInput): VolumeProbeSuccess | VolumeProbeAck;
  loadDuplicate(input: VolumeProbeInput): VolumeProbeAck;
  loadWithThrowingConstruction(input: VolumeProbeInput): VolumeProbeAck;
  loadWithResidualConstruction(input: VolumeProbeInput): VolumeProbeAck;
  release(volumeId: string): VolumeProbeAck;
  teardown(): VolumeProbeAck;
}

/** Minimal shape the shared harness reads for its `requireWebGL2` gate. */
interface NuclearRendererProbe {
  webgl2(): ReturnType<typeof probeWebGL2>;
}

declare global {
  var __nuclearVolumeProbe: NuclearVolumeProbe | undefined;
  var __nuclearRendererProbe: NuclearRendererProbe | undefined;
  var __nuclearRendererProbeReady: boolean | undefined;
}

let adapter: CornerstoneRendererAdapter | undefined;

function ensureAdapter(): CornerstoneRendererAdapter {
  adapter ??= CornerstoneRendererAdapter.start(createBrowserHost(), { engineId: ENGINE_ID });
  return adapter;
}

function describeError(error: unknown): VolumeProbeAck {
  const ack: VolumeProbeAck =
    error instanceof VolumeIngestionError || error instanceof RendererError
      ? { ok: false, name: error.name, code: error.code, message: error.message }
      : error instanceof Error
        ? { ok: false, name: error.name, code: 'UNKNOWN', message: error.message }
        : { ok: false, name: 'Error', code: 'UNKNOWN', message: String(error) };
  if (error instanceof Error && error.cause instanceof Error) {
    ack.causeMessage = error.cause.message;
  }
  return ack;
}

/** Builds the plan through the same Node-safe planner the product uses. */
function planFromInput(input: VolumeProbeInput) {
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

/** Builds the plan and loads it; returns the descriptor plus Cornerstone-observed evidence. */
function install(input: VolumeProbeInput): VolumeProbeSuccess {
  const plan = planFromInput(input);

  ensureAdapter().loadVolume(plan);

  const volume = cache.getVolume(plan.volumeId);
  const imageData = volume?.imageData;
  if (!volume || !imageData) {
    throw new Error(`volume '${plan.volumeId}' was not cached after loadVolume`);
  }
  const [nx, ny, nz] = volume.dimensions;
  const scalarArray = volume.voxelManager?.getCompleteScalarDataArray() ?? new Float32Array(0);
  return {
    ok: true,
    declaredScalarDataDomain: plan.scalarDataDomain,
    volumeId: plan.volumeId,
    scalarLength: volume.getScalarDataLength(),
    cornerDimensions: [...volume.dimensions],
    cornerSpacing: [...volume.spacing],
    cornerOrigin: [...volume.origin],
    cornerDirection: [...volume.direction],
    sliceOneWorld: Array.from(imageData.indexToWorld([0, 0, 1])),
    firstCornerWorld: Array.from(imageData.indexToWorld([-0.5, -0.5, -0.5])),
    lastCornerWorld: Array.from(imageData.indexToWorld([nx - 0.5, ny - 0.5, nz - 0.5])),
    worldBounds: Array.from(imageData.getBounds()),
    firstScalar: scalarArray[0],
    lastScalar: scalarArray[scalarArray.length - 1],
    metadata: {
      BitsAllocated: volume.metadata.BitsAllocated,
      BitsStored: volume.metadata.BitsStored,
      PixelRepresentation: volume.metadata.PixelRepresentation,
      SamplesPerPixel: volume.metadata.SamplesPerPixel,
      PixelSpacing: [...volume.metadata.PixelSpacing],
      ImageOrientationPatient: [...volume.metadata.ImageOrientationPatient],
    },
  };
}

function load(input: VolumeProbeInput): VolumeProbeSuccess | VolumeProbeAck {
  try {
    return install(input);
  } catch (error) {
    return describeError(error);
  }
}

/** Loads twice: the second call must fail closed on the already-cached id. */
function loadDuplicate(input: VolumeProbeInput): VolumeProbeAck {
  try {
    install(input);
    install(input);
    return { ok: true, message: 'second load unexpectedly succeeded' };
  } catch (error) {
    return describeError(error);
  }
}

/** Injects a throwing local-volume constructor and reports the typed refusal. */
function loadWithThrowingConstruction(input: VolumeProbeInput): VolumeProbeAck {
  const plan = planFromInput(input);
  const original = localVolumeConstructor.createLocalVolume;
  localVolumeConstructor.createLocalVolume = () => {
    throw new Error('injected failure: createLocalVolume refused the payload');
  };
  try {
    ensureAdapter().loadVolume(plan);
    return { ok: true, message: 'construction unexpectedly succeeded' };
  } catch (error) {
    const ack = describeError(error);
    ack.residualCached = cache.getVolume(plan.volumeId) !== undefined;
    return ack;
  } finally {
    localVolumeConstructor.createLocalVolume = original;
  }
}

/**
 * Injects a constructor that registers a real volume for the id and then
 * throws, proving the binding's residual cleanup runs before the typed refusal.
 */
function loadWithResidualConstruction(input: VolumeProbeInput): VolumeProbeAck {
  const plan = planFromInput(input);
  const original = localVolumeConstructor.createLocalVolume;
  let registered = false;
  localVolumeConstructor.createLocalVolume = (volumeId, options) => {
    original(volumeId, options);
    registered = true;
    throw new Error('injected failure: createLocalVolume registered the volume then failed');
  };
  try {
    ensureAdapter().loadVolume(plan);
    return { ok: true, message: 'construction unexpectedly succeeded' };
  } catch (error) {
    const ack = describeError(error);
    ack.registeredDuringInjection = registered;
    ack.residualCached = cache.getVolume(plan.volumeId) !== undefined;
    return ack;
  } finally {
    localVolumeConstructor.createLocalVolume = original;
  }
}

function release(volumeId: string): VolumeProbeAck {
  try {
    ensureAdapter().releaseVolume(volumeId);
    return { ok: true };
  } catch (error) {
    return describeError(error);
  }
}

function teardown(): VolumeProbeAck {
  try {
    adapter?.stop();
    adapter = undefined;
    return { ok: true };
  } catch (error) {
    return describeError(error);
  }
}

globalThis.__nuclearRendererProbe = { webgl2: probeWebGL2 };
globalThis.__nuclearVolumeProbe = {
  load,
  loadDuplicate,
  loadWithThrowingConstruction,
  loadWithResidualConstruction,
  release,
  teardown,
};
globalThis.__nuclearRendererProbeReady = true;
