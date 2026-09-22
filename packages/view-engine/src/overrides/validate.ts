/**
 * @nuclear/view-engine — Node-safe product mirror of the view-state contract
 * validators (P4.5 / C5a).
 *
 * This is the runtime guard `resolveLocalViewOverride` uses to prove a
 * substituted `spatial` / `camera` / `presentation` / `projection` /
 * `composition` value against its clinical contract before it is cloned and
 * merged. It mirrors `tests/contracts/view-validators.ts` rule-for-rule; that
 * test-side validator remains the AUTHORITATIVE contract definition and must
 * never be edited to follow this mirror. If the two diverge, the test-side
 * validator wins and this module is the defect.
 *
 * Dependency-free by design: shared-types type imports only — no DOM, no
 * WebGL, no Cornerstone, no value-integrity/deep-freeze coupling. It is a deep
 * module: intentionally NOT re-exported from the `overrides` barrel.
 */
import type { CompositionState, DataBinding, ViewStateOverride } from '@nuclear/shared-types';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const tuple = (value: unknown, length: number): value is readonly number[] =>
  Array.isArray(value) && value.length === length && value.every(finite);
const unit = (value: readonly number[]): boolean => Math.abs(Math.hypot(...value) - 1) < 1e-5;
const direction = (value: unknown): value is readonly number[] => {
  if (!tuple(value, 6)) return false;
  const row = value.slice(0, 3);
  const column = value.slice(3, 6);
  return (
    unit(row) &&
    unit(column) &&
    Math.abs(row[0] * column[0] + row[1] * column[1] + row[2] * column[2]) < 1e-5
  );
};
const roleNames = ['base', 'overlay', 'reference'] as const;
const binding = (value: unknown): boolean =>
  record(value) &&
  typeof value.assetId === 'string' &&
  value.assetId.length > 0 &&
  typeof value.role === 'string' &&
  roleNames.includes(value.role as (typeof roleNames)[number]) &&
  (value.transformId === undefined || typeof value.transformId === 'string');
const vector = (value: unknown): value is readonly number[] => tuple(value, 3);

/** Mirror of the contract `spatialState` validator. */
export const isSpatialState = (value: unknown): boolean => {
  if (
    !record(value) ||
    typeof value.frameOfReferenceUID !== 'string' ||
    !direction(value.orientation) ||
    !vector(value.viewPlaneNormal) ||
    !unit(value.viewPlaneNormal) ||
    !vector(value.viewUp) ||
    !unit(value.viewUp) ||
    Math.abs(
      value.viewPlaneNormal[0] * value.viewUp[0] +
        value.viewPlaneNormal[1] * value.viewUp[1] +
        value.viewPlaneNormal[2] * value.viewUp[2],
    ) > 1e-5 ||
    !vector(value.referenceLocation) ||
    !finite(value.sliceOffsetMm)
  ) {
    return false;
  }
  const [rx, ry, rz, cx, cy, cz] = value.orientation;
  const normal = [ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx];
  return (
    Math.abs(
      normal[0] * value.viewPlaneNormal[0] +
        normal[1] * value.viewPlaneNormal[1] +
        normal[2] * value.viewPlaneNormal[2],
    ) >
    1 - 1e-5
  );
};

/** Mirror of the contract `cameraState` validator. */
export const isCameraState = (value: unknown): boolean =>
  record(value) &&
  finite(value.zoom) &&
  value.zoom > 0 &&
  tuple(value.panMm, 2) &&
  tuple(value.focalPointMm, 2) &&
  finite(value.rotationDeg) &&
  ['manual', 'fit-width', 'fit-height', 'fit-extent'].includes(String(value.fitMode));

/** Mirror of the contract `presentationState` validator. */
export const isPresentationState = (value: unknown): boolean =>
  record(value) &&
  typeof value.invert === 'boolean' &&
  finite(value.opacity) &&
  value.opacity >= 0 &&
  value.opacity <= 1 &&
  (value.voi === undefined || (tuple(value.voi, 2) && value.voi[0] <= value.voi[1])) &&
  (value.suvRange === undefined ||
    (tuple(value.suvRange, 2) && value.suvRange[0] >= 0 && value.suvRange[0] <= value.suvRange[1]));

/** Mirror of the contract `projectionState` validator. */
export const isProjectionState = (value: unknown): boolean =>
  record(value) &&
  ['slice', 'MIP', 'MinIP', 'Average'].includes(String(value.mode)) &&
  (value.slabThicknessMm === undefined ||
    (finite(value.slabThicknessMm) && value.slabThicknessMm > 0)) &&
  (value.parameters === undefined ||
    (record(value.parameters) &&
      Object.values(value.parameters).every(
        (item) => typeof item === 'string' || typeof item === 'boolean' || finite(item),
      )));

const petFusionTransfer = (value: unknown): boolean =>
  record(value) &&
  ['highlighted', 'alpha'].includes(String(value.transferMode)) &&
  finite(value.gamma) &&
  value.gamma > 0 &&
  finite(value.blendSlider) &&
  value.blendSlider >= 0 &&
  value.blendSlider <= 100;

const petFusionOverlayPresentation = (value: unknown): boolean => {
  if (
    !record(value) ||
    typeof value.colormapId !== 'string' ||
    value.colormapId.length === 0 ||
    typeof value.invert !== 'boolean' ||
    !['nearest', 'linear'].includes(String(value.interpolation))
  ) {
    return false;
  }
  if (
    value.modalityPresentation !== undefined &&
    !['ct', 'pet', 'mr', 'generic'].includes(String(value.modalityPresentation))
  ) {
    return false;
  }
  if (value.voi !== undefined && !(tuple(value.voi, 2) && value.voi[0] <= value.voi[1])) return false;
  if (
    value.suvRange !== undefined &&
    !(tuple(value.suvRange, 2) && value.suvRange[0] >= 0 && value.suvRange[0] <= value.suvRange[1])
  ) {
    return false;
  }
  return (value.voi !== undefined) !== (value.suvRange !== undefined) && value.opacity === undefined;
};

const compositionLayer = (value: unknown): boolean =>
  record(value) && binding(value.binding) && isPresentationState(value.presentation);

const fusionOverlayLayer = (value: unknown): boolean => {
  if (!record(value) || !binding(value.binding) || !record(value.binding)) return false;
  if (value.binding.role !== 'overlay') return false;
  return petFusionOverlayPresentation(value.presentation) && petFusionTransfer(value.fusion);
};

const baseCompositionLayer = (value: unknown): boolean => {
  if (!record(value) || !binding(value.binding) || !record(value.binding)) return false;
  if (value.binding.role !== 'base') return false;
  if (!isPresentationState(value.presentation) || !record(value.presentation)) return false;
  if (!tuple(value.presentation.voi, 2)) return false;
  return value.fusion === undefined;
};

/** Mirror of the contract `compositionState` validator. */
export const isCompositionState = (value: unknown): boolean => {
  if (
    !record(value) ||
    !Array.isArray(value.layers) ||
    value.layers.length === 0 ||
    !['single', 'fusion', 'multi-layer'].includes(String(value.mode))
  ) {
    return false;
  }
  const layers = value.layers as unknown[];
  if (value.mode === 'single') {
    return value.blend === undefined && layers.length === 1 && binding(layers[0]);
  }
  if (value.mode === 'fusion') {
    return (
      value.blend === 'alpha' &&
      layers.length >= 2 &&
      baseCompositionLayer(layers[0]) &&
      layers.slice(1).every(fusionOverlayLayer)
    );
  }
  if (value.mode === 'multi-layer') {
    return (
      layers.every((layer) => compositionLayer(layer)) &&
      (value.blend === undefined ||
        ['alpha', 'additive', 'difference', 'checkerboard'].includes(String(value.blend)))
    );
  }
  return false;
};

/**
 * Applicability: a composition override must keep the source's variant class
 * (`single` vs composed). Guarded against hostile runtime values.
 */
export function isSameCompositionVariant(source: CompositionState, next: unknown): boolean {
  const nextMode = record(next) && typeof next.mode === 'string' ? next.mode : undefined;
  if (nextMode === undefined) {
    return false;
  }
  return (source.mode === 'single') === (nextMode === 'single');
}

/**
 * Applicability: the composition's first layer must stay coherent with the
 * view's authoritative `dataBinding`. Guarded against hostile runtime values.
 */
export function isCoherentWithDataBinding(dataBinding: DataBinding, composition: unknown): boolean {
  if (
    !record(composition) ||
    !Array.isArray(composition.layers) ||
    composition.layers.length === 0
  ) {
    return false;
  }
  const first: unknown = composition.layers[0];
  if (composition.mode === 'single') {
    if (!record(first)) {
      return false;
    }
    return first.assetId === dataBinding.assetId && first.role === dataBinding.role;
  }
  if (!record(first) || !record(first.binding)) {
    return false;
  }
  return (
    first.binding.assetId === dataBinding.assetId && first.binding.role === dataBinding.role
  );
}

/** Runtime dispatch from an override state name to its clinical validator. */
export const STATE_VALIDATORS: Readonly<
  Record<ViewStateOverride['state'], (value: unknown) => boolean>
> = {
  spatial: isSpatialState,
  camera: isCameraState,
  presentation: isPresentationState,
  projection: isProjectionState,
  composition: isCompositionState,
};

/** Human-readable field expectation per override state, for refusal messages. */
export const STATE_EXPECTATIONS: Readonly<Record<ViewStateOverride['state'], string>> = {
  spatial:
    "a SpatialState: string 'frameOfReferenceUID', an orthonormal 6-number 'orientation', unit and mutually orthogonal 'viewPlaneNormal'/'viewUp' spanning the orientation normal, a 3-number 'referenceLocation', and a finite 'sliceOffsetMm'",
  camera:
    "a CameraState: finite 'zoom' > 0, 2-number 'panMm' and 'focalPointMm', finite 'rotationDeg', and 'fitMode' one of 'manual'|'fit-width'|'fit-height'|'fit-extent'",
  presentation:
    "a PresentationState: boolean 'invert', finite 'opacity' in [0,1], optional ordered '[min,max]' voi/suvRange (suvRange >= 0)",
  projection:
    "a ProjectionState: 'mode' one of 'slice'|'MIP'|'MinIP'|'Average', optional positive 'slabThicknessMm', and optional primitive-valued 'parameters'",
  composition:
    "a CompositionState: 'single' (one DataBinding layer, no blend) | 'fusion' (blend 'alpha', one base layer + >=1 overlay layer) | 'multi-layer' (CompositionLayer[], optional blend); every layer must be fully valid",
};
