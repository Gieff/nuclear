/**
 * NuClear P3.4-C.2 — browser-side ordinary medical raster capture probe.
 *
 * Bundled by esbuild into `tests/rendering/.harness/` and driven by the
 * controlled WebGL 2 Playwright harness: it starts the real
 * `CornerstoneRendererAdapter` with `{ viewportType: 'orthographic' }` on a
 * 512×512 host, loads the committed CT/PT fixtures through the real Node-safe
 * planner, applies a real compiled plan and captures through the real
 * `captureMedicalRaster`. Every result is plain and serializable because custom
 * `Error` fields do not survive `page.evaluate`. Test-only; never product UI.
 */

import { cache } from '@cornerstonejs/core';

import {
  CornerstoneRendererAdapter,
  RendererError,
  VolumeIngestionError,
  applyViewApplication,
  captureMedicalRaster,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import { ViewApplicationError } from '../../../packages/medical-engine/src/view-application/index.ts';
import type { CaptureAck, CameraSnapshot, CaptureIsolationAck, CaptureMutationAck, CaptureNegativeScenario, CaptureProbeContext, CaptureRoundTripAck, NuclearCaptureProbe, PetTransportDiagnostic } from './capture-probe-types.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';
import { decodeBase64, readTypedArray } from './volume-fixture.ts';
import { probeWebGL2 } from './adapter-host.ts';
import {
  COREG_PET_ASSET_ID,
  CT_ASSET_ID,
  VIEWPORT_SIZE_PX,
  buildCtState,
  compileCt,
  createSizedHost,
  ctEvidence,
  planFromInput,
} from './application-fixture.ts';
import {
  buildFusionState,
  compileCoregFusion,
  coregFusionEvidence,
  petBindingFromSuvFactor,
} from './application-fusion-fixture.ts';
import { runCaptureNegative } from './capture-negative.ts';
import { runIsolation, runRoundTrip, stopTrackedAdapters } from './capture-roundtrip.ts';

const ENGINE_ID = 'nuclear-capture-probe';

let adapter: CornerstoneRendererAdapter | undefined;

function ensureAdapter(): CornerstoneRendererAdapter {
  adapter ??= CornerstoneRendererAdapter.start(createSizedHost(...VIEWPORT_SIZE_PX), {
    engineId: ENGINE_ID,
    viewportType: 'orthographic',
  });
  return adapter;
}

function actorCount(): number {
  return (ensureAdapter().getViewport() as unknown as { getActors(): unknown[] }).getActors().length;
}

function elementSize(): number[] {
  const viewport = ensureAdapter().getViewport() as unknown as { element: HTMLDivElement };
  return [viewport.element.clientWidth, viewport.element.clientHeight];
}

function describeError(error: unknown): CaptureAck {
  const stack = error instanceof Error ? error.stack : undefined;
  if (
    error instanceof ViewApplicationError ||
    error instanceof VolumeIngestionError ||
    error instanceof RendererError
  ) {
    return { ok: false, name: error.name, code: error.code, message: error.message, stack };
  }
  if (error instanceof Error) {
    return { ok: false, name: error.name, code: 'UNKNOWN', message: error.message, stack };
  }
  return { ok: false, name: 'Error', code: 'UNKNOWN', message: String(error) };
}

function snapshotCamera(): CameraSnapshot {
  const viewport = ensureAdapter().getViewport() as unknown as {
    getCamera(): {
      viewPlaneNormal?: number[];
      viewUp?: number[];
      position?: number[];
      focalPoint?: number[];
      parallelScale?: number;
    };
  };
  const camera = viewport.getCamera();
  return {
    viewPlaneNormal: [...(camera.viewPlaneNormal ?? [])],
    viewUp: [...(camera.viewUp ?? [])],
    position: [...(camera.position ?? [])],
    focalPoint: [...(camera.focalPoint ?? [])],
    parallelScale: camera.parallelScale,
  };
}

/** Reads the real Cornerstone transport scalars for the test-only diagnostic. */
function readTransport(volumeId: string, domain: string): PetTransportDiagnostic {
  const volume = cache.getVolume(volumeId);
  const values: number[] = [];
  if (volume !== undefined) {
    for (const imageId of volume.imageIds) {
      const image = cache.getImage(imageId);
      if (image !== undefined) {
        const pixelData = image.getPixelData();
        for (let index = 0; index < pixelData.length; index += 1) {
          values.push(pixelData[index]);
        }
      }
    }
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const middle = Math.floor(values.length / 2);
  return {
    domain,
    length: values.length,
    min,
    max,
    sample: [values[0], values[middle], values[values.length - 1]],
  };
}

/** Positive single-CT capture through the real applied viewport. */
async function captureCt(input: VolumeProbeInput): Promise<CaptureAck> {
  try {
    const renderer = ensureAdapter();
    const ct = planFromInput(input);
    renderer.loadVolume(ct);
    const plan = compileCt(ct);
    const evidence = ctEvidence(ct);
    await applyViewApplication(renderer, { plan, evidence });
    const descriptor = await captureMedicalRaster(renderer, {
      state: buildCtState(ct),
      plan,
      evidence,
      layers: [{ assetId: CT_ASSET_ID, scalarDataDomain: ct.scalarDataDomain }],
    });
    return { ok: true, descriptor, actorCount: actorCount(), elementSizePx: elementSize(), ctTransport: readTransport(ct.volumeId, ct.scalarDataDomain) };
  } catch (error) {
    const ack = describeError(error);
    ack.actorCount = actorCount();
    return ack;
  }
}

/** Positive same-Frame-of-Reference CT+PET fusion capture (spec §6). */
async function captureCoregFusion(inputs: {
  ct: VolumeProbeInput;
  pet: VolumeProbeInput;
  suvFactor: number;
}): Promise<CaptureAck> {
  try {
    const renderer = ensureAdapter();
    const ct = planFromInput(inputs.ct);
    const pet = planFromInput(inputs.pet);
    renderer.loadVolume(ct);
    renderer.loadVolume(pet);
    const plan = compileCoregFusion(pet, ct, inputs.suvFactor);
    const evidence = coregFusionEvidence(ct, pet);
    await applyViewApplication(renderer, { plan, evidence });
    const petScalars = readTypedArray(decodeBase64(inputs.pet.pixels.values), inputs.pet.pixels.dtype);
    const descriptor = await captureMedicalRaster(renderer, {
      state: buildFusionState(pet, ct, {
        petAssetId: COREG_PET_ASSET_ID,
        petBinding: petBindingFromSuvFactor(inputs.suvFactor),
      }),
      plan,
      evidence,
      layers: [
        { assetId: CT_ASSET_ID, scalarDataDomain: ct.scalarDataDomain },
        { assetId: COREG_PET_ASSET_ID, scalarDataDomain: pet.scalarDataDomain, scalarData: petScalars },
      ],
    });
    return {
      ok: true,
      descriptor,
      actorCount: actorCount(),
      elementSizePx: elementSize(),
      petTransport: readTransport(pet.volumeId, pet.scalarDataDomain),
    };
  } catch (error) {
    const ack = describeError(error);
    ack.actorCount = actorCount();
    return ack;
  }
}

async function captureNegative(
  inputs: { ct: VolumeProbeInput; pet: VolumeProbeInput },
  scenario: CaptureNegativeScenario,
): Promise<CaptureAck> {
  return runCaptureNegative(context, inputs, scenario);
}

/** Proves a refused capture does not mutate the already-applied viewport. */
async function captureMutation(inputs: {
  ct: VolumeProbeInput;
  pet: VolumeProbeInput;
}): Promise<CaptureMutationAck> {
  const renderer = ensureAdapter();
  const ct = planFromInput(inputs.ct);
  renderer.loadVolume(ct);
  const plan = compileCt(ct);
  await applyViewApplication(renderer, { plan, evidence: ctEvidence(ct) });
  const actorCountBefore = actorCount();
  const cameraBefore = snapshotCamera();
  const ack = await runCaptureNegative(context, inputs, 'guard-order');
  return {
    code: ack.code,
    message: ack.message,
    actorCountBefore,
    actorCountAfter: actorCount(),
    cameraBefore,
    cameraAfter: snapshotCamera(),
  };
}

async function captureRoundTrip(input: VolumeProbeInput): Promise<CaptureRoundTripAck> {
  return runRoundTrip(context, input);
}

async function captureIsolation(inputs: {
  ct: VolumeProbeInput;
  pet: VolumeProbeInput;
  suvFactor: number;
}): Promise<CaptureIsolationAck> {
  return runIsolation(context, inputs);
}

function teardown(): CaptureAck {
  try {
    adapter?.stop();
    adapter = undefined;
    return { ok: true };
  } catch (error) {
    return describeError(error);
  }
}

/** Stops the shared adapter and every round-trip/isolation adapter. */
function teardownAll(): CaptureAck {
  const errors: unknown[] = [];
  try {
    adapter?.stop();
    adapter = undefined;
  } catch (error) {
    errors.push(error);
  }
  try {
    stopTrackedAdapters();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) {
    return describeError(errors[0]);
  }
  return { ok: true };
}

const context: CaptureProbeContext = {
  ensureAdapter,
  actorCount,
  elementSize,
  describeError,
  snapshotCamera,
};

globalThis.__nuclearRendererProbe = { webgl2: probeWebGL2 };
globalThis.__nuclearCaptureProbe = {
  captureCt,
  captureCoregFusion,
  captureNegative,
  captureMutation,
  captureRoundTrip,
  captureIsolation,
  teardown,
  teardownAll,
} satisfies NuclearCaptureProbe;
globalThis.__nuclearRendererProbeReady = true;
