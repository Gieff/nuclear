/**
 * NuClear P3.4-B.2.2.5 — fusion-specific browser application fixtures (test
 * infrastructure).
 *
 * Split out of `application-fixture.ts` so every harness fixture file stays
 * within the 300-line gate. It carries the PET→CT frame-bridge evidence, the
 * fusion `MedicalViewState`/plan builders, the failing inter-study negatives and
 * the co-referenced (`pt-axial-coreg`) positive-fusion helpers. No DOM is
 * created here and nothing is reachable from product code.
 */

import type {
  AssetId,
  MedicalViewState,
  SpatialTransform,
} from '../../../packages/shared-types/src/index.ts';
import type { VolumeIngestionPlan } from '../../../packages/medical-engine/src/renderer/index.ts';
import { compileMedicalViewApplication } from '../../../packages/medical-engine/src/view-application/index.ts';
import type { ViewGeometryEvidence } from '../../../packages/medical-engine/src/view-application/index.ts';
import type { QuantitativePetBinding } from '../../../packages/medical-engine/src/radiometry/index.ts';
import { resolvePetQuantitationBinding } from '../../../packages/medical-engine/src/radiometry/index.ts';
import { mockPetAsset } from '../../fixtures/clinical-contracts.fixture.ts';
import {
  COREG_PET_ASSET_ID,
  CT_ASSET_ID,
  CT_COLORMAP_ID,
  IDENTITY_MATRIX,
  IDENTITY_TRANSFORMS,
  NEUTRAL_CAMERA,
  PET_ASSET_ID,
  PET_COLORMAP_ID,
  residentGeometry,
} from './application-fixture.ts';

/** The ADR-005 binding for the committed PT fixture's quantitation factor. */
export const PET_BINDING: QuantitativePetBinding = resolvePetQuantitationBinding(
  mockPetAsset,
  'rescaled-bqml',
);

/** Builds an ADR-005 binding directly from a committed SUVbw factor (g/Bq). */
export function petBindingFromSuvFactor(suvFactor: number): QuantitativePetBinding {
  return { suvFactor, units: 'BQML', scalarDataDomain: 'rescaled-bqml' };
}

/** Optional per-invocation overrides for the fusion fixture builders. */
export interface FusionFixtureOptions {
  readonly ctColormapId?: string;
  readonly sliceOffsetMm?: number;
  /** Overlay PET asset id; defaults to the different-FoR `pt-axial` fixture. */
  readonly petAssetId?: string;
  /** Overlay ADR-005 binding; defaults to the committed `pt-axial` binding. */
  readonly petBinding?: QuantitativePetBinding;
}

/** A valid, test-only identity PET→CT frame bridge in millimetres. */
export function petToCtTransform(pet: VolumeIngestionPlan, ct: VolumeIngestionPlan): SpatialTransform {
  return {
    id: 'fixture-transform-pet-to-ct',
    sourceFrameOfReferenceUID: pet.frameOfReferenceUID,
    targetFrameOfReferenceUID: ct.frameOfReferenceUID,
    transformType: 'identity',
    matrix4x4: [...IDENTITY_MATRIX],
    units: 'mm',
    provenance: {
      method: 'identity',
      description: 'test-only PET -> CT frame bridge for P3.4-B.2.2.2',
      workerVersion: '0.1.0',
      timestamp: '2026-09-21T00:00:00Z',
    },
    validity: { isValid: true, errorMarginMm: 0, outOfDomainBehavior: 'clamp' },
  } as unknown as SpatialTransform;
}

/** Evidence for a CT+PET fusion; `includeTransform` may omit the PET bridge. */
export function fusionEvidence(
  pet: VolumeIngestionPlan,
  ct: VolumeIngestionPlan,
  options: { readonly includeTransform?: boolean } = {},
): ViewGeometryEvidence {
  const volumes = new Map([
    [CT_ASSET_ID, residentGeometry(ct)],
    [PET_ASSET_ID, residentGeometry(pet)],
  ]);
  return options.includeTransform === false
    ? { volumes }
    : {
        volumes,
        spatialTransforms: new Map([[PET_ASSET_ID, petToCtTransform(pet, ct)]]),
      };
}

/** A CT-base + PET-overlay fusion `MedicalViewState` in the CT frame. */
export function buildFusionState(
  pet: VolumeIngestionPlan,
  ct: VolumeIngestionPlan,
  options: FusionFixtureOptions = {},
): MedicalViewState {
  const petAssetId = options.petAssetId ?? PET_ASSET_ID;
  return {
    id: 'view-fusion',
    dataBinding: { assetId: CT_ASSET_ID, role: 'base' },
    spatial: {
      frameOfReferenceUID: ct.frameOfReferenceUID,
      orientation: [...ct.metadata.ImageOrientationPatient],
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 1, 0],
      referenceLocation: [0, 0, 0],
      sliceOffsetMm: options.sliceOffsetMm ?? 0,
    },
    camera: { ...NEUTRAL_CAMERA },
    projection: { mode: 'slice' },
    composition: {
      mode: 'fusion',
      blend: 'alpha',
      layers: [
        {
          binding: { assetId: CT_ASSET_ID, role: 'base' },
          presentation: {
            voi: [-1000, 1000],
            colormapId: options.ctColormapId ?? CT_COLORMAP_ID,
            invert: false,
            opacity: 1,
            interpolation: 'linear',
            modalityPresentation: 'ct',
          },
        },
        {
          binding: { assetId: petAssetId, role: 'overlay' },
          presentation: {
            suvRange: [0, 8],
            colormapId: PET_COLORMAP_ID,
            invert: false,
            interpolation: 'linear',
            modalityPresentation: 'pet',
          },
          fusion: { transferMode: 'highlighted', gamma: 1, blendSlider: 50 },
        },
      ],
    },
    coordinateTransforms: { ...IDENTITY_TRANSFORMS },
  } as unknown as MedicalViewState;
}

/** Compiles a fusion plan with the per-asset volume ids and PET binding. */
export function compileFusion(
  pet: VolumeIngestionPlan,
  ct: VolumeIngestionPlan,
  options: FusionFixtureOptions = {},
) {
  const petAssetId = options.petAssetId ?? PET_ASSET_ID;
  return compileMedicalViewApplication({
    state: buildFusionState(pet, ct, options),
    volumeIds: new Map([
      [CT_ASSET_ID, ct.volumeId],
      [petAssetId, pet.volumeId],
    ]),
    petBindings: new Map([
      [petAssetId as AssetId, options.petBinding ?? PET_BINDING],
    ]),
  });
}

/** A fusion plan whose volume ids use a non-NuClear scheme, for the bridge guard. */
export function nonLocalFusionPlan(pet: VolumeIngestionPlan, ct: VolumeIngestionPlan) {
  const plan = compileFusion(pet, ct);
  const layers = plan.layers.map((layer) => ({
    ...layer,
    volumeId: `other-scheme:${layer.volumeId}`,
  }));
  return { ...plan, layers };
}

/**
 * Evidence for the co-referenced positive: each layer reports its own validated
 * plan geometry (the `pt-axial-coreg` fixture shares the CT frame by
 * construction), with **no** `spatialTransforms`, so the geometry guard accepts
 * them without a transform.
 */
export function coregFusionEvidence(
  ct: VolumeIngestionPlan,
  pet: VolumeIngestionPlan,
): ViewGeometryEvidence {
  return {
    volumes: new Map([
      [CT_ASSET_ID, residentGeometry(ct)],
      [COREG_PET_ASSET_ID, residentGeometry(pet)],
    ]),
  };
}

/**
 * Compiles the co-referenced CT+PET fusion with the committed SUVbw factor
 * supplied by the caller (read from `expected-quantitation.json`, never
 * hardcoded here).
 */
export function compileCoregFusion(
  pet: VolumeIngestionPlan,
  ct: VolumeIngestionPlan,
  suvFactor: number,
) {
  return compileFusion(pet, ct, {
    petAssetId: COREG_PET_ASSET_ID,
    petBinding: petBindingFromSuvFactor(suvFactor),
  });
}
