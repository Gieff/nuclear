/**
 * NuClear P3.4-B.2.2.1 — spatial/transforms carried and camera disposition.
 *
 * The pure plan must carry `SpatialState` and `CoordinateTransformSet` verbatim
 * (no normalization, no cross product, no re-derivation) and must apply only
 * the neutral `CameraState`, refusing any other camera as a typed, deliberate
 * decision instead of silently dropping or inventing camera semantics.
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
  mockFusionView,
  mockMedicalView,
} from './fixtures/view-application-fixtures.ts';

describe('NuClear P3.4-B.2.2.1 — spatial and transforms carried verbatim', () => {
  it('17. a single CT plan carries viewPlaneNormal, viewUp, referenceLocation and sliceOffsetMm verbatim', () => {
    const plan = compileMedicalViewApplication({
      state: mockMedicalView,
      volumeIds: CT_VOLUME_IDS,
      petBindings: NO_BINDINGS,
    });
    const { spatial } = mockMedicalView;
    // Assert the comparison against a local so `assert.deepEqual`'s assertion
    // signature (`asserts actual is T`) cannot narrow `plan.spatial` itself.
    const planSpatial = plan.spatial;
    assert.deepEqual(planSpatial, {
      frameOfReferenceUID: spatial.frameOfReferenceUID,
      orientation: spatial.orientation,
      viewPlaneNormal: spatial.viewPlaneNormal,
      viewUp: spatial.viewUp,
      referenceLocation: spatial.referenceLocation,
      sliceOffsetMm: spatial.sliceOffsetMm,
    });
    // Identity proves the fields are carried verbatim, never normalized or derived.
    assert.equal(plan.spatial.frameOfReferenceUID, spatial.frameOfReferenceUID);
    assert.equal(plan.spatial.orientation, spatial.orientation);
    assert.equal(plan.spatial.viewPlaneNormal, spatial.viewPlaneNormal);
    assert.equal(plan.spatial.viewUp, spatial.viewUp);
    assert.equal(plan.spatial.referenceLocation, spatial.referenceLocation);
    assert.equal(plan.spatial.patientPosition, undefined);
  });

  it('17b. a spatial patientPosition is carried verbatim when present', () => {
    const state = {
      ...mockMedicalView,
      spatial: { ...mockMedicalView.spatial, patientPosition: 'HFS' },
    };
    const plan = compileMedicalViewApplication({
      state,
      volumeIds: CT_VOLUME_IDS,
      petBindings: NO_BINDINGS,
    });
    assert.equal(plan.spatial.patientPosition, 'HFS');
  });

  it('18. a fusion plan carries the same CoordinateTransformSet verbatim', () => {
    const plan = compileMedicalViewApplication({
      state: mockFusionView,
      volumeIds: FUSION_VOLUME_IDS,
      petBindings: PET_BINDINGS,
    });
    const transforms = mockFusionView.coordinateTransforms;
    assert.deepEqual(plan.transforms, {
      patientToViewPlane: transforms.patientToViewPlane,
      viewPlaneToViewport: transforms.viewPlaneToViewport,
      viewportSizePx: transforms.viewportSizePx,
    });
    // Identity proves the matrices are carried, never composed or re-derived.
    assert.equal(
      plan.transforms.patientToViewPlane,
      transforms.patientToViewPlane,
    );
    assert.equal(
      plan.transforms.viewPlaneToViewport,
      transforms.viewPlaneToViewport,
    );
    assert.equal(plan.transforms.viewportSizePx, transforms.viewportSizePx);
    assert.deepEqual(plan.spatial, {
      frameOfReferenceUID: mockFusionView.spatial.frameOfReferenceUID,
      orientation: mockFusionView.spatial.orientation,
      viewPlaneNormal: mockFusionView.spatial.viewPlaneNormal,
      viewUp: mockFusionView.spatial.viewUp,
      referenceLocation: mockFusionView.spatial.referenceLocation,
      sliceOffsetMm: mockFusionView.spatial.sliceOffsetMm,
    });
  });
});

describe('NuClear P3.4-B.2.2.1 — camera disposition is neutral-only', () => {
  it('19. the neutral fixture camera compiles (control)', () => {
    const plan = compileMedicalViewApplication({
      state: mockMedicalView,
      volumeIds: CT_VOLUME_IDS,
      petBindings: NO_BINDINGS,
    });
    assert.equal(plan.viewId, 'view-ct');
  });

  it('20. non-neutral zoom/panMm/rotationDeg/focalPointMm/fitMode refuse VIEW_CAMERA_UNSUPPORTED naming each field', () => {
    const cases = [
      [{ zoom: 2 }, 'zoom'],
      [{ panMm: [5, 0] }, 'panMm'],
      [{ rotationDeg: 30 }, 'rotationDeg'],
      [{ focalPointMm: [0, 4] }, 'focalPointMm'],
      [{ fitMode: 'fit-width' }, 'fitMode'],
    ] as const;
    for (const [override, field] of cases) {
      const state = {
        ...mockMedicalView,
        camera: { ...mockMedicalView.camera, ...override },
      };
      const error = expectCode(
        () =>
          compileMedicalViewApplication({
            state,
            volumeIds: CT_VOLUME_IDS,
            petBindings: NO_BINDINGS,
          }),
        VIEW_APPLICATION_ERROR_CODES.cameraUnsupported,
      );
      assert.ok(
        error.message.includes(field),
        `expected the refusal to name '${field}', got '${error.message}'`,
      );
    }
  });

  it('21. a fusion view with a non-neutral camera refuses before any layer is compiled', () => {
    const state = {
      ...mockFusionView,
      camera: { ...mockFusionView.camera, zoom: 2 },
    };
    const error = expectCode(
      () =>
        compileMedicalViewApplication({
          state,
          // Deliberately unbound/none: the camera refusal must win.
          volumeIds: new Map(),
          petBindings: NO_BINDINGS,
        }),
      VIEW_APPLICATION_ERROR_CODES.cameraUnsupported,
    );
    assert.ok(error.message.includes('zoom'), error.message);
  });
});
