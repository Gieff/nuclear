/**
 * @nuclear/medical-engine — browser-only ordinary medical raster capture
 * (P3.4-C.2).
 *
 * `captureMedicalRaster` reads the RGBA raster from the *same* Cornerstone
 * volume viewport the compiled `ViewApplicationPlan` was applied to. It never
 * creates a second renderer, never re-rasterizes medical data through a Canvas
 * 2D pipeline (the 2D read only reads Cornerstone's own on-screen presentation
 * surface) and never resizes, crops or upscales the live canvas. Fail-closed
 * order: state/plan identity, the shared P3.4-B precondition sequence,
 * capture-time camera neutrality, proof that every plan layer is an applied
 * actor, provenance/PET-domain evidence, the spec §6 Bq/mL transport-scalar
 * comparison against the committed payload, then the measured-size raster
 * read-back gated on Cornerstone's real `IMAGE_RENDERED` event. Exported only
 * from `renderer/index.ts`, never from `src/index.ts`.
 */

import { Enums, cache } from '@cornerstonejs/core';
import type { VolumeViewport } from '@cornerstonejs/core';
import type { MedicalViewState } from '@nuclear/shared-types';

import {
  CAPTURE_SCALAR_RELATIVE_TOLERANCE,
  VIEW_APPLICATION_ERROR_CODES,
  ViewApplicationError,
  buildCaptureProvenance,
  validateViewCamera,
} from '../view-application/index.js';
import type {
  MedicalCaptureDescriptor,
  ViewApplicationPlan,
  ViewCaptureLayerEvidence,
  ViewCaptureRasterRef,
  ViewGeometryEvidence,
} from '../view-application/index.js';
import type { CornerstoneRendererAdapter } from './adapter.js';
import {
  mountedViewportSize,
  runViewApplicationPreconditions,
} from './view-application-guards.js';
import type { ViewSlicePosition } from './view-application-guards.js';

/** Bounded wait for Cornerstone's real post-blit render event. */
const CAPTURE_RENDER_TIMEOUT_MS = 5000;

/** Input for one capture of the currently applied medical viewport. */
export interface CaptureMedicalRasterInput {
  readonly state: MedicalViewState;
  readonly plan: ViewApplicationPlan;
  readonly evidence: ViewGeometryEvidence;
  readonly layers: readonly ViewCaptureLayerEvidence[];
  readonly slicePosition?: ViewSlicePosition;
}

/**
 * Refuses unless every planned layer volume is present as an applied viewport
 * actor, so an empty or partially applied viewport can never be captured.
 */
function assertLayersApplied(viewport: VolumeViewport, plan: ViewApplicationPlan): void {
  const referencedIds = new Set<string>();
  for (const actor of viewport.getActors()) {
    if (typeof actor.referencedId === 'string') {
      referencedIds.add(actor.referencedId);
    }
  }
  for (const layer of plan.layers) {
    if (!referencedIds.has(layer.volumeId)) {
      throw new ViewApplicationError(
        VIEW_APPLICATION_ERROR_CODES.volumeNotResident,
        `capture for view '${plan.viewId}' requires layer '${layer.assetId}' volume '${layer.volumeId}' to be an applied viewport actor, but no actor references it: refusing to capture a viewport that does not reflect the compiled state`,
      );
    }
  }
}

/**
 * Assembles the real Cornerstone transport scalars for one volume from its own
 * cached slice images. A missing volume, image or pixel buffer is refused
 * rather than approximated.
 */
function collectTransportScalars(volumeId: string, assetId: string): number[] {
  const volume = cache.getVolume(volumeId);
  if (volume === undefined) {
    throw new ViewApplicationError(
      VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
      `PET layer '${assetId}' volume '${volumeId}' is not resident while verifying the transport scalar domain; refusing to certify Bq/mL over an unreadable volume`,
    );
  }
  const actual: number[] = [];
  for (const imageId of volume.imageIds) {
    const image = cache.getImage(imageId);
    if (image === undefined) {
      throw new ViewApplicationError(
        VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
        `PET layer '${assetId}' image '${imageId}' is not present in Cornerstone's image cache while verifying the transport scalar domain`,
      );
    }
    const pixelData = image.getPixelData();
    for (let index = 0; index < pixelData.length; index += 1) {
      actual.push(pixelData[index]);
    }
  }
  return actual;
}

/**
 * Spec §6 runtime check: every PET transport scalar Cornerstone exposes must
 * match the caller-supplied committed scalar within
 * `CAPTURE_SCALAR_RELATIVE_TOLERANCE`. Length mismatch, non-finite values and
 * out-of-tolerance differences are refused by asset, index and both values.
 * The absolute difference is computed without a floating-point library call.
 */
function assertPetTransportScalars(
  assetId: string,
  expected: ArrayLike<number>,
  actual: readonly number[],
): void {
  if (actual.length !== expected.length) {
    throw new ViewApplicationError(
      VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
      `PET layer '${assetId}' exposes ${actual.length} transport scalars but the committed evidence declares ${expected.length}; the rescaled-bqml domain cannot be certified`,
    );
  }
  for (let index = 0; index < expected.length; index += 1) {
    const expectedValue = expected[index];
    const actualValue = actual[index];
    if (!Number.isFinite(actualValue) || !Number.isFinite(expectedValue)) {
      throw new ViewApplicationError(
        VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
        `PET layer '${assetId}' transport scalar ${index} is ${String(actualValue)} but the committed evidence declares ${String(expectedValue)}: a non-finite value cannot certify rescaled-bqml`,
      );
    }
    const delta = actualValue - expectedValue;
    const scale = expectedValue < 0 ? -expectedValue : expectedValue;
    const bound = scale * CAPTURE_SCALAR_RELATIVE_TOLERANCE;
    if (delta > bound || delta < -bound) {
      throw new ViewApplicationError(
        VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
        `PET layer '${assetId}' transport scalar ${index} is ${actualValue} but the committed evidence declares ${expectedValue}; the difference ${delta} exceeds the relative tolerance ${CAPTURE_SCALAR_RELATIVE_TOLERANCE} (spec §6), refusing to certify rescaled-bqml`,
      );
    }
  }
}

/**
 * Resolves only after Cornerstone's real `IMAGE_RENDERED` event, which fires
 * after the on-screen copy, so the visible canvas is populated. A bounded
 * timeout refuses as `VIEW_VIEWPORT_READBACK_FAILED`.
 */
function renderAndCapture(viewport: VolumeViewport): Promise<void> {
  const element = viewport.element;
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function finish(): void {
      element.removeEventListener(Enums.Events.IMAGE_RENDERED, onRendered);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
    function onRendered(): void {
      if (settled) {
        return;
      }
      settled = true;
      finish();
      resolve();
    }
    element.addEventListener(Enums.Events.IMAGE_RENDERED, onRendered);
    timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      finish();
      reject(
        new ViewApplicationError(
          VIEW_APPLICATION_ERROR_CODES.viewportReadbackFailed,
          `viewport for '${viewport.id}' did not emit ${Enums.Events.IMAGE_RENDERED} within ${CAPTURE_RENDER_TIMEOUT_MS} ms after render(); refusing to read an unpopulated canvas`,
        ),
      );
    }, CAPTURE_RENDER_TIMEOUT_MS);
    viewport.render();
  });
}

/** Base64-encodes bytes in bounded chunks so a large raster cannot overflow the stack. */
function encodeBase64(bytes: Uint8ClampedArray): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/**
 * Reads the native RGBA raster from Cornerstone's own on-screen presentation
 * surface, refusing any canvas that does not correspond 1:1 to the viewport.
 */
function readRaster(
  viewport: VolumeViewport,
  pixelSize: readonly [number, number],
): ViewCaptureRasterRef {
  const canvas = viewport.getCanvas();
  if (canvas.width !== pixelSize[0] || canvas.height !== pixelSize[1]) {
    throw new ViewApplicationError(
      VIEW_APPLICATION_ERROR_CODES.viewportReadbackFailed,
      `viewport canvas is ${canvas.width}x${canvas.height} px but the mounted viewport measures ${pixelSize[0]}x${pixelSize[1]} px: refusing a raster that does not correspond 1:1 to the measured viewport rather than resizing or cropping it`,
    );
  }
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new ViewApplicationError(
      VIEW_APPLICATION_ERROR_CODES.viewportReadbackFailed,
      'viewport canvas exposes no 2D presentation context; Cornerstone blits into a 2D on-screen surface, so the raster cannot be read',
    );
  }
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const bytes = imageData.data;
  let nonEmptyPixelCount = 0;
  for (let index = 3; index < bytes.length; index += 4) {
    if (bytes[index] !== 0) {
      nonEmptyPixelCount += 1;
    }
  }
  return {
    width: canvas.width,
    height: canvas.height,
    format: 'rgba8',
    byteLength: bytes.length,
    nonEmptyPixelCount,
    rgbaBase64: encodeBase64(bytes),
  };
}

/**
 * Captures the ordinary medical raster for an already-applied compiled plan.
 * Every guard runs before any pixel is read; the returned descriptor carries
 * semantic provenance and the native raster only.
 */
export async function captureMedicalRaster(
  adapter: CornerstoneRendererAdapter,
  input: CaptureMedicalRasterInput,
): Promise<MedicalCaptureDescriptor> {
  const { state, plan, evidence } = input;

  if (state.id !== plan.viewId) {
    throw new ViewApplicationError(
      VIEW_APPLICATION_ERROR_CODES.stateInvalid,
      `capture state '${state.id}' does not match plan view '${plan.viewId}': refusing to capture a mismatched state/plan pair`,
    );
  }

  const viewport = runViewApplicationPreconditions(adapter, plan, evidence, input.slicePosition);

  validateViewCamera(state.camera);
  assertLayersApplied(viewport, plan);

  const blendMode = Enums.BlendModes[viewport.getBlendMode()];
  const provenance = buildCaptureProvenance(plan, input.layers, blendMode);

  const evidenceByAssetId = new Map<string, ViewCaptureLayerEvidence>();
  for (const layerEvidence of input.layers) {
    evidenceByAssetId.set(layerEvidence.assetId, layerEvidence);
  }
  for (const layer of plan.layers) {
    if (layer.modality !== 'pet') {
      continue;
    }
    const layerEvidence = evidenceByAssetId.get(layer.assetId);
    if (layerEvidence === undefined || layerEvidence.scalarData === undefined) {
      throw new ViewApplicationError(
        VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
        `PET layer '${layer.assetId}' has no committed transport scalarData; the rescaled-bqml domain is never inferred`,
      );
    }
    assertPetTransportScalars(
      layer.assetId,
      layerEvidence.scalarData,
      collectTransportScalars(layer.volumeId, layer.assetId),
    );
  }

  const pixelSize = mountedViewportSize(viewport);
  await renderAndCapture(viewport);
  const raster = readRaster(viewport, pixelSize);

  return {
    viewId: plan.viewId,
    pixelSize,
    raster,
    provenance,
    renderer: {
      renderer: adapter.capabilities.renderer,
      softwareRasterizer: adapter.capabilities.softwareRasterizer,
    },
  };
}
