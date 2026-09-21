/**
 * NuClear P3.4-B.2.2.1.1 — pure fail-closed geometry / Frame-of-Reference
 * validation for a compiled `ViewApplicationPlan`.
 *
 * These checks are Node-safe and resolve no GPU resource: they assert that a
 * layer is refused unless its resident volume is co-referenced with the view
 * plane, that a different-Frame-of-Reference layer is refused until spatial
 * transform application exists, that the resident volume orientation is a
 * complete finite IOP, and that the compiled transform pixel space matches the
 * mounted viewport.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CT_VOLUME_IDS,
  FUSION_VOLUME_IDS,
  NO_BINDINGS,
  PET_BINDINGS,
  VIEW_APPLICATION_ERROR_CODES,
  compileMedicalViewApplication,
  expectCode,
  mockCtAsset,
  mockFusionView,
  mockMedicalView,
  mockPetAsset,
  validateLayerGeometry,
  validateViewportSize,
} from './fixtures/view-application-fixtures.ts';

import type {
  FrameOfReferenceUID,
  SpatialTransform,
  TransformId,
} from '../../packages/shared-types/src/index.js';
import type {
  ResidentVolumeGeometry,
  ViewGeometryEvidence,
} from '../../packages/medical-engine/src/view-application/index.js';

const VIEW_FOR = mockCtAsset.geometry.frameOfReferenceUID;
const OTHER_FOR = '1.2.840.10008.99.9' as FrameOfReferenceUID;
const AXIAL: readonly number[] = [1, 0, 0, 0, 1, 0];
const SAGITTAL: readonly number[] = [0, 1, 0, 1, 0, 0];
const BROKEN_IOP: readonly number[] = [1, 0, 0];
const MATRIX: SpatialTransform['matrix4x4'] = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];
/** A valid rigid transform that is not the identity (translation + rotation-free). */
const NON_IDENTITY_RIGID_MATRIX: SpatialTransform['matrix4x4'] = [
  1, 0, 0, 5,
  0, 1, 0, -3,
  0, 0, 1, 2,
  0, 0, 0, 1,
];

function resident(
  frameOfReferenceUID: string,
  orientation: readonly number[],
): ResidentVolumeGeometry {
  return { frameOfReferenceUID, orientation };
}

function bridgingTransform(
  overrides: Partial<SpatialTransform> = {},
): SpatialTransform {
  return {
    id: 'transform-bridge' as TransformId,
    sourceFrameOfReferenceUID: OTHER_FOR,
    targetFrameOfReferenceUID: VIEW_FOR,
    transformType: 'rigid',
    matrix4x4: MATRIX,
    units: 'mm',
    provenance: { method: 'rigid-coregistration' },
    validity: { isValid: true, outOfDomainBehavior: 'clamp' },
    ...overrides,
  };
}

function compileCtPlan() {
  return compileMedicalViewApplication({
    state: mockMedicalView,
    volumeIds: CT_VOLUME_IDS,
    petBindings: NO_BINDINGS,
  });
}

describe('NuClear P3.4-B.2.2.1.1 — resident geometry / Frame-of-Reference', () => {
  it('22. a co-referenced CT/PET fusion (same Frame of Reference) validates without any transform', () => {
    const plan = compileMedicalViewApplication({
      state: mockFusionView,
      volumeIds: FUSION_VOLUME_IDS,
      petBindings: PET_BINDINGS,
    });
    const evidence: ViewGeometryEvidence = {
      volumes: new Map([
        [mockCtAsset.id, resident(VIEW_FOR, AXIAL)],
        [mockPetAsset.id, resident(VIEW_FOR, AXIAL)],
      ]),
    };
    assert.doesNotThrow(() => validateLayerGeometry(plan, evidence));
  });

  it('23. a different-Frame-of-Reference layer with no transform refuses VIEW_FOR_MISMATCH', () => {
    const plan = compileCtPlan();
    const assetId = plan.layers[0].assetId;
    const evidence: ViewGeometryEvidence = {
      volumes: new Map([[assetId, resident(OTHER_FOR, AXIAL)]]),
    };
    expectCode(
      () => validateLayerGeometry(plan, evidence),
      VIEW_APPLICATION_ERROR_CODES.forMismatch,
    );
  });

  it('24. a different-Frame-of-Reference layer bridged by a valid mm transform refuses VIEW_TRANSFORM_UNSUPPORTED in either direction', () => {
    const plan = compileCtPlan();
    const assetId = plan.layers[0].assetId;
    for (const transform of [
      bridgingTransform(),
      bridgingTransform({
        sourceFrameOfReferenceUID: VIEW_FOR,
        targetFrameOfReferenceUID: OTHER_FOR,
      }),
    ]) {
      const evidence: ViewGeometryEvidence = {
        volumes: new Map([[assetId, resident(OTHER_FOR, AXIAL)]]),
        spatialTransforms: new Map([[assetId, transform]]),
      };
      expectCode(
        () => validateLayerGeometry(plan, evidence),
        VIEW_APPLICATION_ERROR_CODES.transformUnsupported,
      );
    }
  });

  it('25. a present but invalid, non-mm or wrongly framed transform refuses VIEW_TRANSFORM_INVALID', () => {
    const plan = compileCtPlan();
    const assetId = plan.layers[0].assetId;
    const cases: readonly (readonly [string, Partial<SpatialTransform>])[] = [
      ['isValid:false', { validity: { isValid: false, outOfDomainBehavior: 'clamp' } }],
      ['units:cm', { units: 'cm' as 'mm' }],
      [
        'wrong frames',
        {
          sourceFrameOfReferenceUID: 'frame-a' as FrameOfReferenceUID,
          targetFrameOfReferenceUID: 'frame-b' as FrameOfReferenceUID,
        },
      ],
    ];
    for (const [, overrides] of cases) {
      const evidence: ViewGeometryEvidence = {
        volumes: new Map([[assetId, resident(OTHER_FOR, AXIAL)]]),
        spatialTransforms: new Map([[assetId, bridgingTransform(overrides)]]),
      };
      expectCode(
        () => validateLayerGeometry(plan, evidence),
        VIEW_APPLICATION_ERROR_CODES.transformInvalid,
      );
    }
  });

  it('26. a layer with no resident volume evidence refuses VIEW_VOLUME_NOT_RESIDENT', () => {
    const plan = compileCtPlan();
    expectCode(
      () => validateLayerGeometry(plan, { volumes: new Map() }),
      VIEW_APPLICATION_ERROR_CODES.volumeNotResident,
    );
  });

  it('27. a valid non-identity rigid transform on a different-FoR layer also refuses VIEW_TRANSFORM_UNSUPPORTED', () => {
    const plan = compileCtPlan();
    const assetId = plan.layers[0].assetId;
    const evidence: ViewGeometryEvidence = {
      volumes: new Map([[assetId, resident(OTHER_FOR, AXIAL)]]),
      spatialTransforms: new Map([
        [assetId, bridgingTransform({ matrix4x4: NON_IDENTITY_RIGID_MATRIX })],
      ]),
    };
    expectCode(
      () => validateLayerGeometry(plan, evidence),
      VIEW_APPLICATION_ERROR_CODES.transformUnsupported,
    );
  });

  it('27b. a malformed non-6-value IOP on a different-FoR volume refuses VIEW_GEOMETRY_INCOMPATIBLE', () => {
    const plan = compileCtPlan();
    const assetId = plan.layers[0].assetId;
    const evidence: ViewGeometryEvidence = {
      volumes: new Map([[assetId, resident(OTHER_FOR, BROKEN_IOP)]]),
      spatialTransforms: new Map([[assetId, bridgingTransform()]]),
    };
    expectCode(
      () => validateLayerGeometry(plan, evidence),
      VIEW_APPLICATION_ERROR_CODES.geometryIncompatible,
    );
  });

  it('27c. a co-referenced volume in a different native acquisition plane (MPR) is accepted without a transform', () => {
    const plan = compileCtPlan();
    const assetId = plan.layers[0].assetId;
    const evidence: ViewGeometryEvidence = {
      volumes: new Map([[assetId, resident(VIEW_FOR, SAGITTAL)]]),
    };
    assert.doesNotThrow(() => validateLayerGeometry(plan, evidence));
  });

  it('27d. a co-referenced volume with a malformed IOP refuses VIEW_GEOMETRY_INCOMPATIBLE', () => {
    const plan = compileCtPlan();
    const assetId = plan.layers[0].assetId;
    const evidence: ViewGeometryEvidence = {
      volumes: new Map([[assetId, resident(VIEW_FOR, BROKEN_IOP)]]),
    };
    expectCode(
      () => validateLayerGeometry(plan, evidence),
      VIEW_APPLICATION_ERROR_CODES.geometryIncompatible,
    );
  });
});

describe('NuClear P3.4-B.2.2.1.1 — mounted viewport size', () => {
  it('28. validateViewportSize accepts the declared size and refuses a mismatch with VIEW_VIEWPORT_SIZE_MISMATCH', () => {
    const plan = compileCtPlan();
    assert.deepEqual(plan.transforms.viewportSizePx, [512, 512]);
    assert.doesNotThrow(() =>
      validateViewportSize(plan.transforms, [512, 512]),
    );
    expectCode(
      () => validateViewportSize(plan.transforms, [256, 256]),
      VIEW_APPLICATION_ERROR_CODES.viewportSizeMismatch,
    );
  });
});
