/**
 * @nuclear/medical-engine — browser-only fail-closed guards and the shared
 * P3.4 precondition sequence for `applyViewApplication` and ordinary capture
 * (P3.4-B.2.2.4, extracted for P3.4-C.2).
 *
 * These guards read real renderer state and are deliberately kept out of the
 * pure `view-application` module: they import `@cornerstonejs/core` and are
 * reachable only from browser bundles through `renderer/index.ts`.
 *
 * `runViewApplicationPreconditions` is the single ordered refusal sequence
 * shared by state application and capture. Extracting it guarantees capture
 * cannot observe a viewport that state application would itself have refused,
 * and preserves the exact order, codes and messages of P3.4-B.
 */

import { cache, utilities } from '@cornerstonejs/core';
import type { VolumeViewport } from '@cornerstonejs/core';

import {
  VIEW_APPLICATION_ERROR_CODES,
  ViewApplicationError,
  validateLayerGeometry,
  validateViewportSize,
} from '../view-application/index.js';
import type {
  ViewApplicationPlan,
  ViewGeometryEvidence,
} from '../view-application/index.js';
import type { CornerstoneRendererAdapter } from './adapter.js';
import { registerDicomPalettes } from './dicom-palette-registration.js';

/** Minimal element shape read to measure a mounted viewport. */
interface MeasurableViewport {
  readonly element?: {
    readonly clientWidth?: unknown;
    readonly clientHeight?: unknown;
  };
}

/** Explicit slice request accepted by the shared precondition sequence. */
export interface ViewSlicePosition {
  readonly referenceLocation: readonly [number, number, number];
  readonly sliceOffsetMm: number;
}

/**
 * Reads the mounted viewport size from the viewport's own element, never from
 * the caller. Fail-closed: a missing or non-positive/non-integer element size
 * refuses rather than validating the pixel mapping against a caller-declared
 * number.
 */
export function mountedViewportSize(viewport: MeasurableViewport): readonly [number, number] {
  const width = viewport.element?.clientWidth;
  const height = viewport.element?.clientHeight;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new ViewApplicationError(
      VIEW_APPLICATION_ERROR_CODES.viewportReadbackFailed,
      `mounted viewport element has no positive integer pixel size (width=${String(width)}, height=${String(height)}): refusing to validate the patient/view-plane to pixel mapping against an unmeasured viewport`,
    );
  }
  return [width, height];
}

/**
 * Refuses any plan layer whose volume is not resident in Cornerstone's real
 * cache. `ViewGeometryEvidence` is caller-supplied and may claim a volume is
 * resident; this independent check reads the engine's actual state.
 */
export function assertVolumesCached(plan: ViewApplicationPlan): void {
  for (const layer of plan.layers) {
    if (cache.getVolume(layer.volumeId) === undefined) {
      throw new ViewApplicationError(
        VIEW_APPLICATION_ERROR_CODES.volumeNotResident,
        `layer '${layer.assetId}' maps to volume '${layer.volumeId}', which is not resident in Cornerstone's cache: refusing to composite a volume that is not actually available`,
      );
    }
  }
}

/** True only for the neutral reference location and zero slice offset. */
function isNeutralSlice(referenceLocation: readonly number[], sliceOffsetMm: number): boolean {
  return (
    referenceLocation[0] === 0 &&
    referenceLocation[1] === 0 &&
    referenceLocation[2] === 0 &&
    sliceOffsetMm === 0
  );
}

/**
 * The only volume-id scheme NuClear's local-volume bridge can serve.
 * `createLocalVolume` materializes every slice into Cornerstone's image cache
 * as `<volumeId>_slice_<i>` under this scheme.
 */
export const LOCAL_VOLUME_SCHEME = 'nuclear-volume';

/** Refuses non-local volume ids before any viewport mutation or loader registration. */
function assertLocalVolumeScheme(plan: ViewApplicationPlan): void {
  for (const layer of plan.layers) {
    if (!layer.volumeId.startsWith(`${LOCAL_VOLUME_SCHEME}:`)) {
      throw new ViewApplicationError(
        VIEW_APPLICATION_ERROR_CODES.volumeSchemeUnsupported,
        `volume '${layer.volumeId}' for asset '${layer.assetId}' is not a '${LOCAL_VOLUME_SCHEME}:' local volume; registering an image loader for any other scheme is not allowed`,
      );
    }
  }
}

/** Verifies every declared colormap resolves in Cornerstone before any mutation. */
function assertColormapsResolvable(plan: ViewApplicationPlan): void {
  for (const layer of plan.layers) {
    const name = layer.properties.colormap.name;
    if (utilities.colormap.resolveColormap(name) === undefined) {
      throw new ViewApplicationError(
        VIEW_APPLICATION_ERROR_CODES.colormapUnknown,
        `colormap '${name}' for asset '${layer.assetId}' is not resolvable by Cornerstone after DICOM palette registration; refusing before any volume is set`,
      );
    }
  }
}

/** Refuses any faithful-but-unimplemented slice positioning request. */
function assertSlicePositionSupported(
  plan: ViewApplicationPlan,
  slicePosition: ViewSlicePosition | undefined,
): void {
  if (!isNeutralSlice(plan.spatial.referenceLocation, plan.spatial.sliceOffsetMm)) {
    throw new ViewApplicationError(
      VIEW_APPLICATION_ERROR_CODES.slicePositionUnsupported,
      `view '${plan.viewId}' carries slice referenceLocation [${plan.spatial.referenceLocation.join(', ')}] at offset ${plan.spatial.sliceOffsetMm} mm: faithful slice positioning is not implemented, refusing rather than guessing`,
    );
  }
  if (
    slicePosition !== undefined &&
    !isNeutralSlice(slicePosition.referenceLocation, slicePosition.sliceOffsetMm)
  ) {
    throw new ViewApplicationError(
      VIEW_APPLICATION_ERROR_CODES.slicePositionUnsupported,
      `view '${plan.viewId}' requests an explicit slice position: faithful slice positioning is not implemented, refusing rather than guessing`,
    );
  }
}

/**
 * Runs the exact P3.4-B fail-closed precondition sequence in order and returns
 * the resolved volume viewport:
 * local-volume scheme, DICOM palette registration, layer geometry /
 * Frame-of-Reference, real cache residency, mounted viewport size, colormap
 * resolvability and slice neutrality. The first violation throws a typed
 * `ViewApplicationError`; no state has been applied when any step refuses.
 */
export function runViewApplicationPreconditions(
  adapter: CornerstoneRendererAdapter,
  plan: ViewApplicationPlan,
  evidence: ViewGeometryEvidence,
  slicePosition?: ViewSlicePosition,
): VolumeViewport {
  assertLocalVolumeScheme(plan);
  registerDicomPalettes();
  validateLayerGeometry(plan, evidence);
  assertVolumesCached(plan);
  const viewport = adapter.getViewport() as VolumeViewport;
  validateViewportSize(plan.transforms, mountedViewportSize(viewport));
  assertColormapsResolvable(plan);
  assertSlicePositionSupported(plan, slicePosition);
  return viewport;
}
