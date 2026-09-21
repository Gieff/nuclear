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
} from './types.js';
export {
  CORNERSTONE_INTERPOLATION_TYPES,
  toCornerstoneInterpolationType,
} from './types.js';
export type { CornerstoneInterpolationType } from './types.js';

/**
 * Compiles a `MedicalViewState` into a serializable Cornerstone application
 * plan. Refuses fail-closed on an unbound asset, a PET layer whose own
 * `assetId` has no ADR-005 binding in `petBindings` (no cross-asset fallback),
 * an unresolvable colormap, an ambiguous/missing PET range, a missing CT
 * window and a non-slice projection without a positive slab.
 */
export function compileMedicalViewApplication(
  input: ViewApplicationInput,
): ViewApplicationPlan {
  const { state, volumeIds, petBindings } = input;
  const composition = state.composition;
  const layers: ViewLayerApplication[] = [];

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
  };
}
