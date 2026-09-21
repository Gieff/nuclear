/**
 * NuClear P3.4-B.2.2.2 — browser-side application fixtures (test infrastructure).
 *
 * Pure helpers shared by the application probe: a correctly sized runtime host,
 * fixture-derived volume plans, resident geometry evidence and the single-CT
 * `MedicalViewState` builders. Fusion-specific helpers (PET→CT frame bridge,
 * fusion state/plan builders and the co-referenced positive) live in the sibling
 * `application-fusion-fixture.ts` so every fixture file stays within the
 * 300-line gate. No DOM is created here (the host factory does that at call
 * time) and nothing is reachable from product code.
 */

import type { CameraState, MedicalViewState } from '../../../packages/shared-types/src/index.ts';
import type {
  VolumeIngestionPlan,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import type { RendererRuntimeHost } from '../../../packages/medical-engine/src/renderer/index.ts';
import { compileMedicalViewApplication } from '../../../packages/medical-engine/src/view-application/index.ts';
import type { ViewGeometryEvidence } from '../../../packages/medical-engine/src/view-application/index.ts';
import { buildVolumeIngestionPlan } from '../../../packages/medical-engine/src/renderer/index.ts';
import { buildAsset, decodeBase64, readTypedArray, requireComputed } from './volume-fixture.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';
import { probeWebGL2 } from './adapter-host.ts';

/** Committed rendering-fixture asset ids (`tests/rendering/fixtures/volumes`). */
export const CT_ASSET_ID = 'fixture.volume.ct-axial';
/** Different-Frame-of-Reference PT fixture used by the refusal negatives. */
export const PET_ASSET_ID = 'fixture.volume.pt-axial';
/** Co-referenced PT fixture (same Study and Frame as the CT) for positive fusion. */
export const COREG_PET_ASSET_ID = 'fixture.volume.pt-axial-coreg';

/** The mounted viewport is sized to match `transforms.viewportSizePx`. */
export const VIEWPORT_SIZE_PX = [512, 512] as const;

/** `dicom-pet` is the ratified PET palette; the CT layer uses a registered one. */
export const PET_COLORMAP_ID = 'dicom-pet';
/**
 * The CT single/fusion base uses the NuClear built-in `gray`. The pure compiler
 * maps it to the real Cornerstone/vtk preset name `Grayscale`
 * (P3.4-B.2.2.2.2), so a plan declaring the persisted NuClear id `gray`
 * resolves and reads back as `Grayscale`.
 */
export const CT_COLORMAP_ID = 'gray';

/** Test-only identity 4x4 homogeneous matrix. */
export const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Test-only axial DICOM ImageOrientationPatient (row, then column cosines). */
export const IDENTITY_ORIENTATION = [1, 0, 0, 0, 1, 0] as const;

/** The neutral camera the pure compiler accepts (no zoom/pan/rotation/focal). */
export const NEUTRAL_CAMERA: CameraState = {
  zoom: 1,
  panMm: [0, 0],
  rotationDeg: 0,
  focalPointMm: [0, 0],
  fitMode: 'manual',
};

/** Carried coordinate transforms matching the 512×512 mounted host. */
export const IDENTITY_TRANSFORMS = {
  patientToViewPlane: [...IDENTITY_MATRIX],
  viewPlaneToViewport: [...IDENTITY_MATRIX],
  viewportSizePx: [...VIEWPORT_SIZE_PX],
};

/** Creates a real DOM host whose engine element is exactly width×height px. */
export function createSizedHost(width: number, height: number): RendererRuntimeHost {
  const containers = new Map<string, HTMLDivElement>();
  return {
    createEngineContainer(engineId: string): HTMLDivElement {
      const element = document.createElement('div');
      element.id = engineId;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      document.body.appendChild(element);
      containers.set(engineId, element);
      return element;
    },
    removeEngineContainer(engineId: string): void {
      const element = containers.get(engineId) ?? document.getElementById(engineId);
      if (element) {
        element.remove();
      }
      containers.delete(engineId);
    },
    probeWebGL2,
  };
}

/** Builds the real ingestion plan through the same Node-safe planner the product uses. */
export function planFromInput(input: VolumeProbeInput): VolumeIngestionPlan {
  const evidence = requireComputed(input.expectedGeometry);
  const pixel = input.pixels;
  return buildVolumeIngestionPlan({
    asset: buildAsset(input.fixture, evidence.assetGeometry, pixel, evidence.geometricDigest),
    availability: { state: input.fixture.availability as 'online' | 'loading' | 'missing' | 'mismatch' | 'offline-cached' },
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

/** The resident geometry of one loaded plan, keyed by assetId. */
export function residentGeometry(plan: VolumeIngestionPlan): {
  frameOfReferenceUID: string;
  orientation: readonly number[];
} {
  return {
    frameOfReferenceUID: plan.frameOfReferenceUID,
    orientation: [...plan.metadata.ImageOrientationPatient],
  };
}

/** Evidence for a single CT volume resident in the view plane's own frame. */
export function ctEvidence(ct: VolumeIngestionPlan): ViewGeometryEvidence {
  return { volumes: new Map([[CT_ASSET_ID, residentGeometry(ct)]]) };
}

/** A single CT `MedicalViewState` in the loaded CT volume's frame. */
export function buildCtState(
  ct: VolumeIngestionPlan,
  colormapId = CT_COLORMAP_ID,
  slabThicknessMm?: number,
  viewportSizePx: readonly [number, number] = VIEWPORT_SIZE_PX,
): MedicalViewState {
  return {
    id: 'view-ct',
    dataBinding: { assetId: CT_ASSET_ID, role: 'base' },
    spatial: {
      frameOfReferenceUID: ct.frameOfReferenceUID,
      orientation: [...ct.metadata.ImageOrientationPatient],
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 1, 0],
      referenceLocation: [0, 0, 0],
      sliceOffsetMm: 0,
    },
    camera: { ...NEUTRAL_CAMERA },
    presentation: {
      voi: [-1000, 1000],
      colormapId,
      invert: false,
      opacity: 1,
      interpolation: 'linear',
      modalityPresentation: 'ct',
    },
    projection:
      slabThicknessMm === undefined
        ? { mode: 'slice' }
        : { mode: 'MIP', slabThicknessMm },
    composition: { mode: 'single', layers: [{ assetId: CT_ASSET_ID, role: 'base' }] },
    coordinateTransforms: {
      ...IDENTITY_TRANSFORMS,
      viewportSizePx: [...viewportSizePx],
    },
  } as unknown as MedicalViewState;
}

/** Compiles a single CT plan with its own volume id. */
export function compileCt(
  ct: VolumeIngestionPlan,
  colormapId = CT_COLORMAP_ID,
  slabThicknessMm?: number,
  viewportSizePx?: readonly [number, number],
) {
  return compileMedicalViewApplication({
    state: buildCtState(ct, colormapId, slabThicknessMm, viewportSizePx),
    volumeIds: new Map([[CT_ASSET_ID, ct.volumeId]]),
    petBindings: new Map(),
  });
}
