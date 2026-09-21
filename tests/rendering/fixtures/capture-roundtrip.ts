/**
 * NuClear P3.4-C.3 — capture/restore round-trip and per-view isolation probe
 * bodies (test infrastructure only, browser-side).
 *
 * `runRoundTrip` compiles and captures a CT state on the shared probe adapter,
 * serializes `{ state, plan }` through JSON, re-applies the parsed plan to a
 * *second* adapter (the CT volume is already resident in Cornerstone's global
 * cache, so it is never loaded twice) and captures again, so the two runs can
 * be compared for source binding, camera, presentation, projection,
 * composition and coordinate transforms.
 *
 * `runIsolation` applies a single-CT state on adapter A and a single-PET state
 * on adapter B, proving the per-view state stays isolated even though
 * `invert`/`interpolationType` are viewport-global and palettes are registered
 * globally, and that no preset default is substituted. Both adapters use
 * committed fixtures with distinct volume ids so they coexist in the cache.
 *
 * Test-only; never reachable from product code.
 */

import {
  CornerstoneRendererAdapter,
  applyViewApplication,
  captureMedicalRaster,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import type { CaptureMedicalRasterInput } from '../../../packages/medical-engine/src/renderer/index.ts';
import { compileMedicalViewApplication } from '../../../packages/medical-engine/src/view-application/index.ts';
import type { ViewApplicationPlan } from '../../../packages/medical-engine/src/view-application/index.ts';
import type {
  CaptureIsolationAck,
  CaptureProbeContext,
  CaptureRoundTripAck,
  CaptureRun,
} from './capture-probe-types.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';
import { decodeBase64, readTypedArray } from './volume-fixture.ts';
import type { VolumeIngestionPlan } from '../../../packages/medical-engine/src/renderer/index.ts';
import {
  COREG_PET_ASSET_ID,
  CT_ASSET_ID,
  IDENTITY_TRANSFORMS,
  NEUTRAL_CAMERA,
  VIEWPORT_SIZE_PX,
  buildCtState,
  compileCt,
  createSizedHost,
  ctEvidence,
  planFromInput,
  residentGeometry,
} from './application-fixture.ts';
import { petBindingFromSuvFactor } from './application-fusion-fixture.ts';

/** The two second adapters share no engine id with the shared probe adapter. */
const ROUND_TRIP_ENGINE_ID = 'nuclear-capture-probe-rt';
const ISOLATION_ENGINE_ID = 'nuclear-capture-probe-iso';

/** The applied state type is derived from the public capture input, no new import. */
type MedicalState = CaptureMedicalRasterInput['state'];

/** The parsed form of the serialized `{ state, plan }` pair. */
type RestoredCapture = { state: MedicalState; plan: ViewApplicationPlan };

/** Second adapters started by this module, left for `stopTrackedAdapters`. */
const trackedAdapters: CornerstoneRendererAdapter[] = [];

function startTrackedAdapter(engineId: string): CornerstoneRendererAdapter {
  const adapter = CornerstoneRendererAdapter.start(createSizedHost(...VIEWPORT_SIZE_PX), {
    engineId,
    viewportType: 'orthographic',
  });
  trackedAdapters.push(adapter);
  return adapter;
}

function releaseTrackedAdapter(adapter: CornerstoneRendererAdapter): void {
  const index = trackedAdapters.indexOf(adapter);
  if (index !== -1) {
    trackedAdapters.splice(index, 1);
  }
  adapter.stop();
}

/** Stops every adapter this module started (best effort); rethrows the first failure. */
export function stopTrackedAdapters(): void {
  const adapters = trackedAdapters.splice(0, trackedAdapters.length);
  let firstError: unknown;
  for (const adapter of adapters) {
    try {
      adapter.stop();
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError !== undefined) {
    throw firstError;
  }
}

function actorCountOf(adapter: CornerstoneRendererAdapter): number {
  return (adapter.getViewport() as unknown as { getActors(): unknown[] }).getActors().length;
}

/**
 * Serializes the applied state and compiled plan through JSON, re-applies the
 * parsed plan to a fresh adapter and captures again. The CT volume stays in
 * Cornerstone's global cache, so the second adapter must never `loadVolume` it
 * (a duplicate load fails closed).
 */
export async function runRoundTrip(
  context: CaptureProbeContext,
  input: VolumeProbeInput,
): Promise<CaptureRoundTripAck> {
  try {
    const adapterA = context.ensureAdapter();
    const ct = planFromInput(input);
    adapterA.loadVolume(ct);
    const plan = compileCt(ct);
    const evidence = ctEvidence(ct);
    const appliedA = await applyViewApplication(adapterA, { plan, evidence });
    const descriptorA = await captureMedicalRaster(adapterA, {
      state: buildCtState(ct),
      plan,
      evidence,
      layers: [{ assetId: CT_ASSET_ID, scalarDataDomain: ct.scalarDataDomain }],
    });
    const first: CaptureRun = { descriptor: descriptorA, applied: appliedA, plan };

    const serialized = JSON.stringify({ state: buildCtState(ct), plan });
    const restored = JSON.parse(serialized) as RestoredCapture;

    const adapterB = startTrackedAdapter(ROUND_TRIP_ENGINE_ID);
    let second: CaptureRun;
    try {
      const planB = restored.plan;
      const appliedB = await applyViewApplication(adapterB, { plan: planB, evidence });
      const descriptorB = await captureMedicalRaster(adapterB, {
        state: restored.state,
        plan: planB,
        evidence,
        layers: [{ assetId: CT_ASSET_ID, scalarDataDomain: ct.scalarDataDomain }],
      });
      second = { descriptor: descriptorB, applied: appliedB, plan: planB };
    } finally {
      releaseTrackedAdapter(adapterB);
    }

    return { ok: true, serializedLength: serialized.length, first, second };
  } catch (error) {
    return context.describeError(error);
  }
}

/** A single PET `MedicalViewState` for the committed `pt-axial-coreg` fixture. */
function buildSinglePetState(pet: VolumeIngestionPlan): MedicalState {
  return {
    id: 'view-pet',
    dataBinding: { assetId: COREG_PET_ASSET_ID, role: 'base' },
    spatial: {
      frameOfReferenceUID: pet.frameOfReferenceUID,
      orientation: [...pet.metadata.ImageOrientationPatient],
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 1, 0],
      referenceLocation: [0, 0, 0],
      sliceOffsetMm: 0,
    },
    camera: { ...NEUTRAL_CAMERA },
    presentation: {
      suvRange: [0, 8],
      colormapId: 'dicom-pet',
      invert: true,
      opacity: 1,
      interpolation: 'nearest',
      modalityPresentation: 'pet',
    },
    projection: { mode: 'slice' },
    composition: { mode: 'single', layers: [{ assetId: COREG_PET_ASSET_ID, role: 'base' }] },
    coordinateTransforms: { ...IDENTITY_TRANSFORMS, viewportSizePx: [...VIEWPORT_SIZE_PX] },
  } as unknown as MedicalState;
}

/** Compiles the single PET state with its own volume id and ADR-005 binding. */
function compileSinglePetState(
  pet: VolumeIngestionPlan,
  suvFactor: number,
): ViewApplicationPlan {
  type CompileInput = Parameters<typeof compileMedicalViewApplication>[0];
  type PetBindingKey = CompileInput['petBindings'] extends ReadonlyMap<infer K, unknown>
    ? K
    : never;
  const petBindings: CompileInput['petBindings'] = new Map<
    PetBindingKey,
    ReturnType<typeof petBindingFromSuvFactor>
  >([[COREG_PET_ASSET_ID as PetBindingKey, petBindingFromSuvFactor(suvFactor)]]);
  return compileMedicalViewApplication({
    state: buildSinglePetState(pet),
    volumeIds: new Map([[COREG_PET_ASSET_ID, pet.volumeId]]),
    petBindings,
  });
}

/**
 * Applies and captures a single-CT state on adapter A and a single-PET state on
 * adapter B (distinct volume ids, so both coexist in the global cache).
 */
export async function runIsolation(
  context: CaptureProbeContext,
  inputs: { ct: VolumeProbeInput; pet: VolumeProbeInput; suvFactor: number },
): Promise<CaptureIsolationAck> {
  try {
    const adapterA = context.ensureAdapter();
    const ct = planFromInput(inputs.ct);
    adapterA.loadVolume(ct);
    const ctPlan = compileCt(ct);
    const ctEvidenceSet = ctEvidence(ct);
    const appliedCt = await applyViewApplication(adapterA, {
      plan: ctPlan,
      evidence: ctEvidenceSet,
    });
    const ctDescriptor = await captureMedicalRaster(adapterA, {
      state: buildCtState(ct),
      plan: ctPlan,
      evidence: ctEvidenceSet,
      layers: [{ assetId: CT_ASSET_ID, scalarDataDomain: ct.scalarDataDomain }],
    });
    const a: CaptureRun = { descriptor: ctDescriptor, applied: appliedCt, plan: ctPlan };

    const adapterB = startTrackedAdapter(ISOLATION_ENGINE_ID);
    const pet = planFromInput(inputs.pet);
    adapterB.loadVolume(pet);
    const petState = buildSinglePetState(pet);
    const petPlan = compileSinglePetState(pet, inputs.suvFactor);
    const petEvidence = {
      volumes: new Map([[COREG_PET_ASSET_ID, residentGeometry(pet)]]),
    };
    const appliedPet = await applyViewApplication(adapterB, {
      plan: petPlan,
      evidence: petEvidence,
    });
    const petScalars = readTypedArray(
      decodeBase64(inputs.pet.pixels.values),
      inputs.pet.pixels.dtype,
    );
    const petDescriptor = await captureMedicalRaster(adapterB, {
      state: petState,
      plan: petPlan,
      evidence: petEvidence,
      layers: [
        {
          assetId: COREG_PET_ASSET_ID,
          scalarDataDomain: pet.scalarDataDomain,
          scalarData: petScalars,
        },
      ],
    });
    const b: CaptureRun = { descriptor: petDescriptor, applied: appliedPet, plan: petPlan };

    return { ok: true, a, b, actorCounts: [context.actorCount(), actorCountOf(adapterB)] };
  } catch (error) {
    return context.describeError(error);
  }
}
