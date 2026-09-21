/**
 * NuClear P3.4-B.2.1 — shared fixtures for the pure `MedicalViewState` →
 * Cornerstone application plan test suite.
 *
 * Pure Node: no DOM, no WebGL, no Cornerstone. The `ts-resolve-hook` is
 * registered here so the real TypeScript product sources can be imported
 * unchanged by the split test files.
 */
import { register } from 'node:module';
import assert from 'node:assert/strict';

register(new URL('../../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  CORNERSTONE_INTERPOLATION_TYPES,
  VIEW_APPLICATION_ERROR_CODES,
  ViewApplicationError,
  CAPTURE_SCALAR_RELATIVE_TOLERANCE,
  PET_TRANSPORT_SCALAR_DOMAIN,
  assertPetTransportEvidence,
  buildCaptureProvenance,
  compileMedicalViewApplication,
  resolveViewColormapName,
  toCornerstoneInterpolationType,
  validateLayerGeometry,
  validateViewCamera,
  validateViewportSize,
} = await import('../../../packages/medical-engine/src/view-application/index.ts');

const { suvRangeToBqml, resolvePetQuantitationBinding } = await import(
  '../../../packages/medical-engine/src/radiometry/index.ts'
);

const { PaletteResolutionError } = await import(
  '../../../packages/medical-engine/src/palette/index.ts'
);

const { getFusionOpacity, getPETOpacityMapping } = await import(
  '../../../packages/rendering-presets/src/index.ts'
);

import { mockCtAsset, mockPetAsset } from '../../fixtures/clinical-contracts.fixture.ts';
import {
  mockFusionView,
  mockMedicalView,
  mockPetView,
} from '../../fixtures/view-contracts.fixture.ts';
import type {
  AssetId,
  FusionCompositionState,
  FusionOverlayLayer,
  ImagingAsset,
  MedicalViewState,
} from '../../../packages/shared-types/src/index.js';

export {
  CORNERSTONE_INTERPOLATION_TYPES,
  VIEW_APPLICATION_ERROR_CODES,
  ViewApplicationError,
  CAPTURE_SCALAR_RELATIVE_TOLERANCE,
  PET_TRANSPORT_SCALAR_DOMAIN,
  assertPetTransportEvidence,
  buildCaptureProvenance,
  compileMedicalViewApplication,
  resolveViewColormapName,
  toCornerstoneInterpolationType,
  validateLayerGeometry,
  validateViewCamera,
  validateViewportSize,
  suvRangeToBqml,
  resolvePetQuantitationBinding,
  PaletteResolutionError,
  getFusionOpacity,
  getPETOpacityMapping,
  mockCtAsset,
  mockPetAsset,
  mockFusionView,
  mockMedicalView,
  mockPetView,
};

export const SUV_FACTOR = mockPetAsset.metadata.petQuantitation?.suvFactor as number;
export const TOLERANCE = 1e-12;
const petBinding = resolvePetQuantitationBinding(mockPetAsset, 'rescaled-bqml');
export const CT_VOLUME_IDS = new Map([['asset-ct', 'volume-ct']]);
export const PET_VOLUME_IDS = new Map([[mockPetAsset.id, 'volume-pet']]);
export const FUSION_VOLUME_IDS = new Map([
  [mockCtAsset.id, 'volume-ct'],
  [mockPetAsset.id, 'volume-pet'],
]);

export type PetBindings = ReadonlyMap<
  AssetId,
  ReturnType<typeof resolvePetQuantitationBinding>
>;
export const PET_BINDINGS: PetBindings = new Map([[mockPetAsset.id, petBinding]]);
export const NO_BINDINGS: PetBindings = new Map();

// A second PET asset, same shape as `mockPetAsset` but a distinct `id` and a
// distinct `petQuantitation.suvFactor`, so a multi-PET fusion can be shown to
// resolve each overlay's own ADR-005 binding by `assetId`.
export const SECOND_SUV_FACTOR = SUV_FACTOR / 2;
export const secondPetAsset: ImagingAsset = {
  ...mockPetAsset,
  id: 'asset-pet-002' as AssetId,
  metadata: {
    ...mockPetAsset.metadata,
    petQuantitation: {
      method: 'suv-bw',
      status: 'computed',
      suvFactor: SECOND_SUV_FACTOR,
      workerMetadata: {
        workerVersion: '0.1.0',
        operation: 'suv-scaling',
        timestamp: '2026-09-20T10:00:00Z',
      },
    },
  },
};
const secondPetBinding = resolvePetQuantitationBinding(secondPetAsset, 'rescaled-bqml');
export const TWO_PET_VOLUME_IDS = new Map([
  [mockCtAsset.id, 'volume-ct'],
  [mockPetAsset.id, 'volume-pet'],
  [secondPetAsset.id, 'volume-pet-2'],
]);
export const TWO_PET_BINDINGS: PetBindings = new Map([
  [mockPetAsset.id, petBinding],
  [secondPetAsset.id, secondPetBinding],
]);
export const FIRST_BINDING_ONLY: PetBindings = new Map([[mockPetAsset.id, petBinding]]);
export const SECOND_BINDING_ONLY: PetBindings = new Map([
  [secondPetAsset.id, secondPetBinding],
]);

export type FusionState = Extract<
  MedicalViewState,
  { composition: FusionCompositionState }
>;
const fusionComposition = (mockFusionView as FusionState).composition;
const [fusionBaseLayer, fusionPetOverlay] = fusionComposition.layers;
const secondPetOverlay: FusionOverlayLayer = {
  binding: { assetId: secondPetAsset.id, role: 'overlay' },
  presentation: {
    suvRange: [0, 8],
    colormapId: 'dicom-pet',
    invert: false,
    interpolation: 'linear',
    modalityPresentation: 'pet',
  },
  fusion: { transferMode: 'alpha', gamma: 0.5, blendSlider: 80 },
};
export const twoPetFusionState: FusionState = {
  ...(mockFusionView as FusionState),
  composition: {
    mode: 'fusion',
    blend: 'alpha',
    layers: [fusionBaseLayer, fusionPetOverlay, secondPetOverlay],
  },
};

// A `multi-layer` composition with two CT/generic layers sharing compatible
// global properties. P3.4-B routes every multi-layer layer to the
// CT/generic builder, so capture provenance must report `modality: 'generic'`
// for every layer (never `'ct'`).
const multiLayerPresentation = {
  voi: [-160, 240] as readonly [number, number],
  colormapId: 'gray',
  invert: false,
  opacity: 1,
  interpolation: 'linear' as const,
  modalityPresentation: 'ct' as const,
};
export const mockMultiLayerView: MedicalViewState = {
  id: mockMedicalView.id,
  dataBinding: mockMedicalView.dataBinding,
  spatial: mockMedicalView.spatial,
  camera: mockMedicalView.camera,
  projection: mockMedicalView.projection,
  coordinateTransforms: mockMedicalView.coordinateTransforms,
  composition: {
    mode: 'multi-layer',
    blend: 'alpha',
    layers: [
      {
        binding: { assetId: mockMedicalView.dataBinding.assetId, role: 'base' },
        presentation: multiLayerPresentation,
      },
      {
        binding: { assetId: mockMedicalView.dataBinding.assetId, role: 'overlay' },
        presentation: { ...multiLayerPresentation, opacity: 0.5 },
      },
    ],
  },
};

export function expectCode(run: () => unknown, code: string): ViewApplicationError {
  let caught: ViewApplicationError | undefined;
  assert.throws(run, (error: unknown) => {
    assert.ok(
      error instanceof ViewApplicationError,
      `expected ViewApplicationError, got ${String(error)}`,
    );
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    caught = error;
    return true;
  });
  return caught as ViewApplicationError;
}
