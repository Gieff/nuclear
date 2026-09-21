/**
 * @nuclear/medical-engine — pure, Node-safe compiler from a persisted
 * `MedicalViewState` to a serializable Cornerstone application plan
 * (P3.4-B.2.1).
 *
 * It emits Cornerstone-`ViewportProperties`-shaped plain objects but never
 * imports `@cornerstonejs/core`, opens a viewport, loads a volume or touches a
 * GPU resource: P3.4-B.2.2 may hand `properties` to `setProperties` unchanged.
 * Every missing or ambiguous input is a typed `ViewApplicationError` refusal;
 * no window, palette, opacity or transfer value is ever inferred.
 *
 * Modality is explicit, never read from an asset or a scalar range. A layer is
 * PET only when it is a `FusionOverlayLayer`, or when it belongs to a `single`
 * view whose `presentation.modalityPresentation === 'pet'`. `ct`, `mr`,
 * `generic` and `undefined` take the CT/generic path, and `multi-layer`
 * compositions are CT/generic because the contract gives their layers no PET
 * transfer. Binding-role correctness is the contract validator's boundary
 * (ADR-006) and is not re-derived here.
 *
 * Arithmetic is limited to the certified `suvFactor` conversion; this module
 * performs no floating-point library calls (P2.5 integrity gate).
 */

import type {
  CameraState,
  CoordinateTransformSet,
  SpatialState,
} from '@nuclear/shared-types';

import {
  buildCtLayer,
  buildFusionOverlayLayer,
  buildSinglePetLayer,
} from './layers.js';
import { resolveProjection } from './projection.js';
import { VIEW_APPLICATION_ERROR_CODES, refuse } from './errors.js';
import type {
  ViewApplicationInput,
  ViewApplicationPlan,
  ViewLayerApplication,
  ViewSpatialApplication,
  ViewTransformsApplication,
} from './types.js';

export {
  VIEW_APPLICATION_ERROR_CODES,
  ViewApplicationError,
} from './errors.js';
export type { ViewApplicationErrorCode } from './errors.js';
export type {
  ViewApplicationInput,
  ViewApplicationPlan,
  ViewColormapApplication,
  ViewLayerApplication,
  ViewProjectionApplication,
  ViewProjectionBlendMode,
  ViewSpatialApplication,
  ViewTransformsApplication,
} from './types.js';
export {
  CORNERSTONE_INTERPOLATION_TYPES,
  toCornerstoneInterpolationType,
} from './types.js';
export type { CornerstoneInterpolationType } from './types.js';

/**
 * Returns the names (with values) of camera fields that differ from the single
 * neutral declaration `{ zoom: 1, panMm: [0, 0], rotationDeg: 0,
 * focalPointMm: [0, 0], fitMode: 'manual' }`. The comparison is numeric, never
 * by reference. `panMm` and `focalPointMm` are view-plane millimetres, never
 * screen pixels.
 */
function unsupportedCameraFields(camera: CameraState): string[] {
  const unsupported: string[] = [];
  if (camera.zoom !== 1) unsupported.push(`zoom=${camera.zoom}`);
  if (camera.panMm[0] !== 0 || camera.panMm[1] !== 0) {
    unsupported.push(`panMm=[${camera.panMm[0]}, ${camera.panMm[1]}]`);
  }
  if (camera.rotationDeg !== 0) {
    unsupported.push(`rotationDeg=${camera.rotationDeg}`);
  }
  if (camera.focalPointMm[0] !== 0 || camera.focalPointMm[1] !== 0) {
    unsupported.push(
      `focalPointMm=[${camera.focalPointMm[0]}, ${camera.focalPointMm[1]}]`,
    );
  }
  if (camera.fitMode !== 'manual') {
    unsupported.push(`fitMode='${camera.fitMode}'`);
  }
  return unsupported;
}

/**
 * Refuses, as a deliberate typed decision, any camera other than the neutral
 * declaration. Mapping a live camera faithfully is not yet implemented
 * (P3.4-B.2.2), so the compiler refuses instead of silently dropping or
 * inventing zoom/pan/rotation/focal/fit semantics.
 */
function assertCameraSupported(camera: CameraState): void {
  const unsupported = unsupportedCameraFields(camera);
  if (unsupported.length > 0) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.cameraUnsupported,
      `camera field(s) ${unsupported.join(', ')} are unsupported: faithful camera mapping is not yet implemented`,
    );
  }
}

/** Carries the view-plane vectors and slice offset verbatim, with no derivation. */
function resolveSpatial(spatial: SpatialState): ViewSpatialApplication {
  return {
    viewPlaneNormal: spatial.viewPlaneNormal,
    viewUp: spatial.viewUp,
    referenceLocation: spatial.referenceLocation,
    sliceOffsetMm: spatial.sliceOffsetMm,
  };
}

/** Carries the coordinate transforms verbatim for adapter-side validation. */
function resolveTransforms(
  transforms: CoordinateTransformSet,
): ViewTransformsApplication {
  return {
    patientToViewPlane: transforms.patientToViewPlane,
    viewPlaneToViewport: transforms.viewPlaneToViewport,
    viewportSizePx: transforms.viewportSizePx,
  };
}

/**
 * Compiles a `MedicalViewState` into a serializable Cornerstone application
 * plan. Refuses fail-closed on an unbound asset, a PET layer whose own
 * `assetId` has no ADR-005 binding in `petBindings` (no cross-asset fallback),
 * an unresolvable colormap, an ambiguous/missing PET range, a missing CT
 * window, a non-slice projection without a positive slab and any non-neutral
 * `CameraState`.
 */
export function compileMedicalViewApplication(
  input: ViewApplicationInput,
): ViewApplicationPlan {
  const { state, volumeIds, petBindings } = input;
  const composition = state.composition;
  const layers: ViewLayerApplication[] = [];

  assertCameraSupported(state.camera);

  if (composition.mode === 'single') {
    if (!('presentation' in state)) {
      refuse(
        VIEW_APPLICATION_ERROR_CODES.stateInvalid,
        `single view '${state.id}' is missing its authoritative presentation`,
      );
    }
    const presentation = state.presentation;
    const binding = composition.layers[0];
    layers.push(
      presentation.modalityPresentation === 'pet'
        ? buildSinglePetLayer(
            binding.assetId,
            binding.role,
            presentation,
            petBindings,
            volumeIds,
          )
        : buildCtLayer(binding.assetId, binding.role, presentation, volumeIds),
    );
  } else if (composition.mode === 'fusion') {
    const [base, ...overlays] = composition.layers;
    layers.push(
      buildCtLayer(
        base.binding.assetId,
        base.binding.role,
        base.presentation,
        volumeIds,
      ),
    );
    for (const overlay of overlays) {
      layers.push(buildFusionOverlayLayer(overlay, petBindings, volumeIds));
    }
  } else {
    for (const layer of composition.layers) {
      layers.push(
        buildCtLayer(
          layer.binding.assetId,
          layer.binding.role,
          layer.presentation,
          volumeIds,
        ),
      );
    }
  }

  return {
    viewId: state.id,
    layers,
    projection: resolveProjection(state.projection),
    spatial: resolveSpatial(state.spatial),
    transforms: resolveTransforms(state.coordinateTransforms),
  };
}
