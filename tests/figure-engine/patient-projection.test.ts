/**
 * NuClear P5.4 — OD-5 patient-annotation projection (ADR-014 OD-4/OD-5, options
 * A/A/A ratified 2026-09-23).
 *
 * Pure Node: no DOM, no WebGL and no Cornerstone. Uses the curated Fase-1
 * editorial fixture and the `mockPreparedView.state` transform set.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type {
  AssetAvailabilityStatus,
  MedicalViewState,
  PanelContentAnnotationAnchor,
  PatientAnnotationAnchor,
} from '../../packages/shared-types/src/index.js';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  projectPatientAnnotation,
} = await import('../../packages/figure-engine/src/publication/index.ts');

const { mockEditorialAnchor, mockFraming, mockLayout, mockPatientAnchor } = await import(
  '../fixtures/figure-contracts.fixture.ts'
);
const { mockPreparedView } = await import('../fixtures/view-contracts.fixture.ts');

const VIEW = mockPreparedView.state;
const EPSILON = 1e-9;
const PATIENT_ANCHOR = mockPatientAnchor as PatientAnnotationAnchor;

function anchorWith(overrides: Partial<PatientAnnotationAnchor>): PatientAnnotationAnchor {
  return { ...PATIENT_ANCHOR, ...overrides };
}

function stateWith(patch: {
  readonly spatial?: unknown;
  readonly coordinateTransforms?: unknown;
}): MedicalViewState {
  return { ...VIEW, ...patch } as unknown as MedicalViewState;
}

function project(
  anchor: PatientAnnotationAnchor,
  state: MedicalViewState = VIEW,
  availability: AssetAvailabilityStatus['state'] = 'online',
) {
  return projectPatientAnnotation({
    anchor,
    availability,
    state,
    framing: mockFraming,
    layout: mockLayout,
  });
}

function assertNear(actual: readonly [number, number] | undefined, expected: readonly [number, number]): void {
  assert.ok(actual, 'expected a sheet point');
  assert.ok(Math.abs(actual[0] - expected[0]) <= EPSILON, `x: ${actual[0]} vs ${expected[0]}`);
  assert.ok(Math.abs(actual[1] - expected[1]) <= EPSILON, `y: ${actual[1]} vs ${expected[1]}`);
}

function expectAnnotationError(run: () => unknown): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof FigurePublicationError, `expected FigurePublicationError, got ${String(error)}`);
    assert.equal(error.code, FIGURE_PUBLICATION_ERROR_CODES.annotationInvalid);
    assert.ok(error.message.length > 0);
    return true;
  });
}

describe('NuClear P5.4 — OD-5 patient-annotation projection', () => {
  it('1. projects an on-plane anchor through the full OD-5 chain', () => {
    const result = project(anchorWith({ positionLpsMm: [0, 0, 0] }));
    assert.equal(result.visible, true);
    assert.equal(result.opacity, 1);
    assert.equal(result.outOfPlaneDistanceMm, 0);
    assertNear(result.sheetPointMm, [60, 60]);
    assert.ok(Object.isFrozen(result));
  });

  it('2. applies the authored transforms, viewport normalization and OD-1/OD-2', () => {
    // lps (10,0,0) -> viewPlane (10,0,0) -> viewport (266,256,0)
    // -> normalized (266/512, 0.5) -> panel content (41.5625, 40) -> sheet (61.5625, 60).
    const result = project(anchorWith({ positionLpsMm: [10, 0, 0] }));
    assert.equal(result.visible, true);
    assertNear(result.sheetPointMm, [61.5625, 60]);
  });

  it('3. reports the signed out-of-plane distance from the LPS plane geometry', () => {
    const above = project(anchorWith({ positionLpsMm: [0, 0, 3], planeToleranceMm: 5 }));
    assert.equal(above.outOfPlaneDistanceMm, 3);
    assert.equal(above.visible, true);

    const below = project(anchorWith({ positionLpsMm: [0, 0, -3], planeToleranceMm: 5 }));
    assert.equal(below.outOfPlaneDistanceMm, -3);
    assert.equal(below.visible, true);
  });

  it('4. shifts the plane by sliceOffsetMm and referenceLocation (OD-5a)', () => {
    const shiftedOffset = stateWith({
      spatial: { ...VIEW.spatial, sliceOffsetMm: 3 },
    });
    const byOffset = project(anchorWith({ positionLpsMm: [0, 0, 0], planeToleranceMm: 5 }), shiftedOffset);
    assert.equal(byOffset.outOfPlaneDistanceMm, -3);

    const shiftedReference = stateWith({
      spatial: { ...VIEW.spatial, referenceLocation: [0, 0, 5] },
    });
    const byReference = project(anchorWith({ positionLpsMm: [0, 0, 2], planeToleranceMm: 5 }), shiftedReference);
    assert.equal(byReference.outOfPlaneDistanceMm, -3);
  });

  it('5. applies the OD-4 fade band and hide cutoff to the projected distance', () => {
    const onPlane = project(anchorWith({ positionLpsMm: [0, 0, 0], outOfPlaneBehavior: 'fade' }));
    assert.equal(onPlane.opacity, 1);

    const mid = project(anchorWith({ positionLpsMm: [0, 0, 3], planeToleranceMm: 2, outOfPlaneBehavior: 'fade' }));
    assert.equal(mid.opacity, 0.5);

    const endpoint = project(anchorWith({ positionLpsMm: [0, 0, 4], planeToleranceMm: 2, outOfPlaneBehavior: 'fade' }));
    assert.equal(endpoint.visible, true);
    assert.equal(endpoint.opacity, 0);

    const beyond = project(anchorWith({ positionLpsMm: [0, 0, 4.0001], planeToleranceMm: 2, outOfPlaneBehavior: 'fade' }));
    assert.equal(beyond.visible, false);
    assert.equal(beyond.outOfPlaneDistanceMm, 4.0001);

    const hidden = project(anchorWith({ positionLpsMm: [0, 0, 3], planeToleranceMm: 2, outOfPlaneBehavior: 'hide' }));
    assert.equal(hidden.visible, false);
  });

  it('6. hides the annotation with no sheet point when the source is not online', () => {
    for (const availability of ['loading', 'offline-cached', 'missing', 'mismatch'] as const) {
      const result = project(anchorWith({ positionLpsMm: [0, 0, 0] }), VIEW, availability);
      assert.deepEqual(
        { visible: result.visible, opacity: result.opacity },
        { visible: false, opacity: 0 },
        availability,
      );
      assert.equal(result.sheetPointMm, undefined);
      assert.equal(result.outOfPlaneDistanceMm, 0);
    }
  });

  it('7. refuses a non-patient anchor with FIGURE_ANNOTATION_INVALID', () => {
    const editorial = mockEditorialAnchor as unknown as PatientAnnotationAnchor;
    expectAnnotationError(() => project(editorial));
    const content = mockEditorialAnchor as PanelContentAnnotationAnchor;
    assert.equal(content.kind, 'panel-content');
  });

  it('8. refuses malformed anchor/state/transforms fail-closed', () => {
    expectAnnotationError(() => project(anchorWith({ positionLpsMm: [Number.NaN, 0, 0] })));
    expectAnnotationError(() => project(anchorWith({ planeToleranceMm: -1 })));
    expectAnnotationError(() => project(anchorWith({ outOfPlaneBehavior: 'scroll' as 'hide' })));
    expectAnnotationError(() =>
      project(anchorWith({ positionLpsMm: [0, 0, 0] }), stateWith({ spatial: { ...VIEW.spatial, viewPlaneNormal: [0, 0, 2] } })),
    );
    expectAnnotationError(() =>
      project(
        anchorWith({ positionLpsMm: [0, 0, 0] }),
        stateWith({
          coordinateTransforms: { ...VIEW.coordinateTransforms, patientToViewPlane: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2] },
        }),
      ),
    );
    // A non-zero projective-row element (m[12]) is not affine either.
    expectAnnotationError(() =>
      project(
        anchorWith({ positionLpsMm: [0, 0, 0] }),
        stateWith({
          coordinateTransforms: { ...VIEW.coordinateTransforms, patientToViewPlane: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1] },
        }),
      ),
    );
    expectAnnotationError(() =>
      project(
        anchorWith({ positionLpsMm: [0, 0, 0] }),
        stateWith({ coordinateTransforms: { ...VIEW.coordinateTransforms, viewportSizePx: [0, 512] } }),
      ),
    );
    expectAnnotationError(() =>
      project(
        anchorWith({ positionLpsMm: [0, 0, 0] }),
        stateWith({ coordinateTransforms: { ...VIEW.coordinateTransforms, viewportSizePx: [-1, 512] } }),
      ),
    );
  });
});
