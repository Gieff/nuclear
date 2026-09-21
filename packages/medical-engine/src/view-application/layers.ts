/**
 * @nuclear/medical-engine — fail-closed per-layer application builders
 * (P3.4-B.2.1).
 *
 * CT/generic layers require a declared `voi` and take their opacity from the
 * presentation; PET layers require an ADR-005 binding and exactly one of
 * `voi` (transport Bq/mL) or `suvRange` (clinical SUVbw). A fusion overlay
 * single-sources its overall opacity from `fusion.blendSlider` and its mapping
 * from the declared transfer (ADR-006).
 */

import type {
  AssetId,
  BindingRole,
  FusionOverlayLayer,
  PresentationState,
} from '@nuclear/shared-types';
import { getFusionOpacity, getPETOpacityMapping } from '@nuclear/rendering-presets';
import {
  suvRangeToBqml,
  type QuantitativePetBinding,
} from '../radiometry/index.js';
import { VIEW_APPLICATION_ERROR_CODES, refuse } from './errors.js';
import { resolveViewColormapName } from './colormap.js';
import type { ViewLayerApplication } from './types.js';

function resolveVolumeId(
  assetId: string,
  volumeIds: ReadonlyMap<string, string>,
): string {
  const volumeId = volumeIds.get(assetId);
  if (volumeId === undefined) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.volumeNotBound,
      `asset '${assetId}' has no entry in the volumeId map; bind its validated volumeId before compiling the application`,
    );
  }
  return volumeId;
}

function requireFiniteRange(
  range: readonly [number, number] | undefined,
  label: string,
): readonly [number, number] {
  if (range === undefined) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.stateInvalid,
      `${label} is required as a [lower, upper] tuple; no window is inferred`,
    );
  }
  const lower = range[0];
  const upper = range[1];
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.stateInvalid,
      `${label} must hold two finite numbers, received [${String(lower)}, ${String(upper)}]`,
    );
  }
  if (!(lower <= upper)) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.stateInvalid,
      `${label} must satisfy lower <= upper, received [${String(lower)}, ${String(upper)}]`,
    );
  }
  return [lower, upper];
}

function requireRenderRole(role: BindingRole, assetId: string): 'base' | 'overlay' {
  if (role === 'reference') {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.stateInvalid,
      `layer for asset '${assetId}' declares role 'reference'; only 'base' and 'overlay' layers carry renderer properties`,
    );
  }
  return role;
}

function requirePetBinding(
  assetId: string,
  petBindings: ReadonlyMap<AssetId, QuantitativePetBinding>,
): QuantitativePetBinding {
  const petBinding = petBindings.get(assetId as AssetId);
  if (petBinding === undefined) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.petBindingRequired,
      `PET layer for asset '${assetId}' has no entry in petBindings; provide its ADR-005 QuantitativePetBinding keyed by assetId (another asset's binding is never substituted)`,
    );
  }
  return petBinding;
}

interface PetRangePresentation {
  readonly voi?: readonly [number, number];
  readonly suvRange?: readonly [number, number];
}

function resolvePetTransportRange(
  presentation: PetRangePresentation,
  petBinding: QuantitativePetBinding,
  assetId: string,
): readonly [number, number] {
  const hasVoi = presentation.voi !== undefined;
  const hasSuvRange = presentation.suvRange !== undefined;
  if (hasVoi === hasSuvRange) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.stateInvalid,
      `PET layer for asset '${assetId}' must declare exactly one of voi (transport Bq/mL) or suvRange (clinical SUVbw); received voi=${String(hasVoi)}, suvRange=${String(hasSuvRange)}`,
    );
  }
  if (hasSuvRange) {
    const suvRange = requireFiniteRange(
      presentation.suvRange,
      `suvRange for asset '${assetId}'`,
    );
    return suvRangeToBqml(suvRange, petBinding.suvFactor);
  }
  return requireFiniteRange(presentation.voi, `voi for asset '${assetId}'`);
}

export function buildCtLayer(
  assetId: string,
  role: BindingRole,
  presentation: PresentationState,
  volumeIds: ReadonlyMap<string, string>,
): ViewLayerApplication {
  const volumeId = resolveVolumeId(assetId, volumeIds);
  const range = requireFiniteRange(presentation.voi, `voi for asset '${assetId}'`);
  return {
    assetId,
    volumeId,
    role: requireRenderRole(role, assetId),
    properties: {
      voiRange: { lower: range[0], upper: range[1] },
      colormap: {
        name: resolveViewColormapName(presentation.colormapId),
        opacity: presentation.opacity,
      },
      invert: presentation.invert,
      interpolationType: presentation.interpolation,
    },
  };
}

export function buildSinglePetLayer(
  assetId: string,
  role: BindingRole,
  presentation: PresentationState,
  petBindings: ReadonlyMap<AssetId, QuantitativePetBinding>,
  volumeIds: ReadonlyMap<string, string>,
): ViewLayerApplication {
  const binding = requirePetBinding(assetId, petBindings);
  const volumeId = resolveVolumeId(assetId, volumeIds);
  const range = resolvePetTransportRange(presentation, binding, assetId);
  return {
    assetId,
    volumeId,
    role: requireRenderRole(role, assetId),
    properties: {
      voiRange: { lower: range[0], upper: range[1] },
      colormap: {
        name: resolveViewColormapName(presentation.colormapId),
        opacity: presentation.opacity,
      },
      invert: presentation.invert,
      interpolationType: presentation.interpolation,
    },
  };
}

export function buildFusionOverlayLayer(
  layer: FusionOverlayLayer,
  petBindings: ReadonlyMap<AssetId, QuantitativePetBinding>,
  volumeIds: ReadonlyMap<string, string>,
): ViewLayerApplication {
  const assetId = layer.binding.assetId;
  const binding = requirePetBinding(assetId, petBindings);
  const volumeId = resolveVolumeId(assetId, volumeIds);
  const range = resolvePetTransportRange(layer.presentation, binding, assetId);
  const opacityMapping = getPETOpacityMapping(
    range[0],
    range[1],
    0,
    layer.fusion.gamma,
    layer.fusion.transferMode,
  );
  return {
    assetId,
    volumeId,
    role: requireRenderRole(layer.binding.role, assetId),
    properties: {
      voiRange: { lower: range[0], upper: range[1] },
      colormap: {
        name: resolveViewColormapName(layer.presentation.colormapId),
        opacity: getFusionOpacity(layer.fusion.blendSlider),
        opacityMapping,
      },
      invert: layer.presentation.invert,
      interpolationType: layer.presentation.interpolation,
    },
  };
}
