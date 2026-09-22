/**
 * NuClear P3.4-C.1 — pure capture descriptor/provenance and fail-closed
 * scalar-domain guards. No DOM, no WebGL, no Cornerstone: the real raster
 * read-back and the §6 scalar comparison belong to P3.4-C.2.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CAPTURE_SCALAR_RELATIVE_TOLERANCE,
  CT_VOLUME_IDS,
  FUSION_VOLUME_IDS,
  NO_BINDINGS,
  PET_BINDINGS,
  PET_TRANSPORT_SCALAR_DOMAIN,
  PET_VOLUME_IDS,
  VIEW_APPLICATION_ERROR_CODES,
  assertPetTransportEvidence,
  buildCaptureProvenance,
  compileMedicalViewApplication,
  expectCode,
  mockCtAsset,
  mockFusionView,
  mockMedicalView,
  mockMultiLayerView,
  mockPetAsset,
  mockPetView,
  validateViewCamera,
} from './fixtures/view-application-fixtures.ts';

const VIEW_BLEND_MODE = 'COMPOSITE';

describe('NuClear P3.4-C.1 — capture provenance', () => {
  it('1. a single CT plan + rescaled-hu evidence builds a one-layer provenance carried verbatim from the plan', () => {
    const plan = compileMedicalViewApplication({
      state: mockMedicalView,
      volumeIds: CT_VOLUME_IDS,
      petBindings: NO_BINDINGS,
    });
    const provenance = buildCaptureProvenance(
      plan,
      [{ assetId: mockCtAsset.id, scalarDataDomain: 'rescaled-hu' }],
      VIEW_BLEND_MODE,
    );

    assert.equal(provenance.viewId, 'view-ct');
    assert.equal(provenance.blendMode, VIEW_BLEND_MODE);
    assert.deepEqual(provenance.appliedOrientation, {
      viewPlaneNormal: plan.spatial.viewPlaneNormal,
      viewUp: plan.spatial.viewUp,
    });
    // Identity proves the orientation is copied by reference, never re-derived.
    assert.equal(
      provenance.appliedOrientation.viewPlaneNormal,
      plan.spatial.viewPlaneNormal,
    );
    assert.equal(provenance.appliedOrientation.viewUp, plan.spatial.viewUp);

    assert.equal(provenance.layers.length, 1);
    const [layer] = provenance.layers;
    assert.equal(layer.assetId, mockCtAsset.id);
    assert.equal(layer.volumeId, 'volume-ct');
    assert.equal(layer.role, 'base');
    assert.equal(layer.modality, 'ct');
    assert.equal(layer.paletteName, 'Grayscale');
    assert.equal(layer.scalarDataDomain, 'rescaled-hu');
    assert.deepEqual(layer.voiRange, { lower: -1000, upper: 1000 });
  });

  it('2. the fusion fixture builds a two-layer provenance: CT base, PET overlay carrying PET and the compiled overlay voiRange', () => {
    const plan = compileMedicalViewApplication({
      state: mockFusionView,
      volumeIds: FUSION_VOLUME_IDS,
      petBindings: PET_BINDINGS,
    });
    const petPlanRange = plan.layers[1].properties.voiRange;
    const provenance = buildCaptureProvenance(
      plan,
      [
        { assetId: mockCtAsset.id, scalarDataDomain: 'rescaled-hu' },
        {
          assetId: mockPetAsset.id,
          scalarDataDomain: PET_TRANSPORT_SCALAR_DOMAIN,
          scalarData: [0, 1, 2, 3],
        },
      ],
      VIEW_BLEND_MODE,
    );

    assert.equal(provenance.layers.length, 2);
    assert.equal(provenance.layers[0].modality, 'ct');
    assert.equal(provenance.layers[0].paletteName, 'Grayscale');
    assert.equal(provenance.layers[1].modality, 'pet');
    assert.equal(provenance.layers[1].role, 'overlay');
    assert.equal(provenance.layers[1].paletteName, 'PET');
    assert.equal(
      provenance.layers[1].scalarDataDomain,
      PET_TRANSPORT_SCALAR_DOMAIN,
    );
    assert.deepEqual(provenance.layers[1].voiRange, {
      lower: petPlanRange.lower,
      upper: petPlanRange.upper,
    });
  });

  it('3. a PET layer declaring rescaled-hu evidence refuses VIEW_SCALAR_DOMAIN_UNVERIFIED naming the asset and observed domain', () => {
    const plan = compileMedicalViewApplication({
      state: mockFusionView,
      volumeIds: FUSION_VOLUME_IDS,
      petBindings: PET_BINDINGS,
    });
    const error = expectCode(
      () =>
        buildCaptureProvenance(
          plan,
          [
            { assetId: mockCtAsset.id, scalarDataDomain: 'rescaled-hu' },
            {
              assetId: mockPetAsset.id,
              scalarDataDomain: 'rescaled-hu',
              scalarData: [0, 1, 2],
            },
          ],
          VIEW_BLEND_MODE,
        ),
      VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
    );
    assert.ok(error.message.includes(mockPetAsset.id), error.message);
    assert.ok(error.message.includes('rescaled-hu'), error.message);
  });

  it('4. a PET layer with missing or empty scalarData refuses VIEW_SCALAR_DOMAIN_UNVERIFIED', () => {
    const plan = compileMedicalViewApplication({
      state: mockFusionView,
      volumeIds: FUSION_VOLUME_IDS,
      petBindings: PET_BINDINGS,
    });
    const scalarCases: (ArrayLike<number> | undefined)[] = [undefined, []];
    for (const scalarData of scalarCases) {
      expectCode(
        () =>
          buildCaptureProvenance(
            plan,
            [
              { assetId: mockCtAsset.id, scalarDataDomain: 'rescaled-hu' },
              {
                assetId: mockPetAsset.id,
                scalarDataDomain: PET_TRANSPORT_SCALAR_DOMAIN,
                scalarData,
              },
            ],
            VIEW_BLEND_MODE,
          ),
        VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
      );
    }
    // Non-finite committed scalars are refused rather than tolerated.
    const nonFiniteCases: ArrayLike<number>[] = [
      [0, Number.NaN, 2],
      [Number.POSITIVE_INFINITY],
    ];
    for (const scalarData of nonFiniteCases) {
      expectCode(
        () =>
          buildCaptureProvenance(
            plan,
            [
              { assetId: mockCtAsset.id, scalarDataDomain: 'rescaled-hu' },
              {
                assetId: mockPetAsset.id,
                scalarDataDomain: PET_TRANSPORT_SCALAR_DOMAIN,
                scalarData,
              },
            ],
            VIEW_BLEND_MODE,
          ),
        VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
      );
    }
  });

  it('5. a plan layer with no evidence entry, or a blank scalarDataDomain, refuses VIEW_SCALAR_DOMAIN_UNVERIFIED', () => {
    const plan = compileMedicalViewApplication({
      state: mockFusionView,
      volumeIds: FUSION_VOLUME_IDS,
      petBindings: PET_BINDINGS,
    });
    // Missing evidence entry for the PET overlay.
    expectCode(
      () =>
        buildCaptureProvenance(
          plan,
          [{ assetId: mockCtAsset.id, scalarDataDomain: 'rescaled-hu' }],
          VIEW_BLEND_MODE,
        ),
      VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
    );
    // Blank scalarDataDomain on the CT base.
    expectCode(
      () =>
        buildCaptureProvenance(
          plan,
          [
            { assetId: mockCtAsset.id, scalarDataDomain: '   ' },
            {
              assetId: mockPetAsset.id,
              scalarDataDomain: PET_TRANSPORT_SCALAR_DOMAIN,
              scalarData: [0],
            },
          ],
          VIEW_BLEND_MODE,
        ),
      VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
    );
  });
});

describe('NuClear P3.4-C.1 — pure camera validation', () => {
  it('6. validateViewCamera accepts the neutral fixture camera and refuses each non-neutral field with VIEW_CAMERA_UNSUPPORTED', () => {
    assert.doesNotThrow(() => validateViewCamera(mockMedicalView.camera));
    const cases = [
      [{ zoom: 2 }, 'zoom'],
      [{ panMm: [5, 0] }, 'panMm'],
      [{ rotationDeg: 30 }, 'rotationDeg'],
      [{ focalPointMm: [0, 4] }, 'focalPointMm'],
      [{ fitMode: 'fit-width' }, 'fitMode'],
    ] as const;
    for (const [override, field] of cases) {
      const error = expectCode(
        () => validateViewCamera({ ...mockMedicalView.camera, ...override }),
        VIEW_APPLICATION_ERROR_CODES.cameraUnsupported,
      );
      assert.ok(
        error.message.includes(field),
        `expected the refusal to name '${field}', got '${error.message}'`,
      );
    }
  });
});

describe('NuClear P3.4-C.1 — modality routing and transport guard', () => {
  it('7. modality routing: single PET -> pet, single CT -> ct, multi-layer -> generic', () => {
    const petPlan = compileMedicalViewApplication({
      state: mockPetView,
      volumeIds: PET_VOLUME_IDS,
      petBindings: PET_BINDINGS,
    });
    assert.equal(petPlan.layers[0].modality, 'pet');

    const ctPlan = compileMedicalViewApplication({
      state: mockMedicalView,
      volumeIds: CT_VOLUME_IDS,
      petBindings: NO_BINDINGS,
    });
    assert.equal(ctPlan.layers[0].modality, 'ct');

    const multiPlan = compileMedicalViewApplication({
      state: mockMultiLayerView,
      volumeIds: CT_VOLUME_IDS,
      petBindings: NO_BINDINGS,
    });
    assert.ok(multiPlan.layers.length >= 2, 'expected a multi-layer plan');
    for (const layer of multiPlan.layers) {
      assert.equal(layer.modality, 'generic');
    }
  });

  it('8. assertPetTransportEvidence is a no-op for a non-PET layer and accepts verified PET evidence', () => {
    assert.equal(CAPTURE_SCALAR_RELATIVE_TOLERANCE, 1e-6);

    const ctPlan = compileMedicalViewApplication({
      state: mockMedicalView,
      volumeIds: CT_VOLUME_IDS,
      petBindings: NO_BINDINGS,
    });
    // A non-PET layer has no transport obligation: even blank evidence is a no-op.
    assert.doesNotThrow(() =>
      assertPetTransportEvidence(ctPlan.layers[0], {
        assetId: mockCtAsset.id,
        scalarDataDomain: '',
      }),
    );

    const petPlan = compileMedicalViewApplication({
      state: mockPetView,
      volumeIds: PET_VOLUME_IDS,
      petBindings: PET_BINDINGS,
    });
    assert.doesNotThrow(() =>
      assertPetTransportEvidence(petPlan.layers[0], {
        assetId: mockPetAsset.id,
        scalarDataDomain: PET_TRANSPORT_SCALAR_DOMAIN,
        scalarData: [1, 2, 3],
      }),
    );
  });
});
