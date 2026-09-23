/**
 * NuClear P5.4 — OD-4 patient-annotation visibility policy.
 *
 * Pure Node: no DOM, no WebGL and no Cornerstone. The out-of-plane distance is
 * a **declared input** (the LPS→viewport projection is blocked on an ADR-014
 * follow-up; see `annotation-policy.ts`).
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  resolvePatientAnnotationVisibility,
} = await import('../../packages/figure-engine/src/publication/index.ts');

type State = 'online' | 'loading' | 'offline-cached' | 'missing' | 'mismatch';

function resolve(
  state: State,
  distanceMm: number,
  planeToleranceMm: number,
  outOfPlaneBehavior: 'hide' | 'fade',
) {
  return resolvePatientAnnotationVisibility({
    availability: state,
    outOfPlaneDistanceMm: distanceMm,
    planeToleranceMm,
    outOfPlaneBehavior,
  });
}

function expectError(input: Parameters<typeof resolvePatientAnnotationVisibility>[0]): void {
  assert.throws(
    () => resolvePatientAnnotationVisibility(input),
    (error: unknown) => {
      assert.ok(error instanceof FigurePublicationError, `expected FigurePublicationError, got ${String(error)}`);
      assert.equal(error.code, FIGURE_PUBLICATION_ERROR_CODES.annotationInvalid);
      return true;
    },
  );
}

describe('NuClear P5.4 — OD-4 patient-annotation visibility policy', () => {
  it('1. hides the annotation fail-closed for every non-online availability', () => {
    for (const state of ['loading', 'offline-cached', 'missing', 'mismatch'] as const) {
      for (const behavior of ['hide', 'fade'] as const) {
        assert.deepEqual(resolve(state, 0, 2, behavior), { visible: false, opacity: 0 }, `${state}/${behavior} on-plane`);
        assert.deepEqual(resolve(state, 10, 2, behavior), { visible: false, opacity: 0 }, `${state}/${behavior} off-plane`);
      }
    }
  });

  it('2. tolerance 0 has no fade band: visible only on the exact plane', () => {
    for (const behavior of ['hide', 'fade'] as const) {
      assert.deepEqual(resolve('online', 0, 0, behavior), { visible: true, opacity: 1 });
      assert.deepEqual(resolve('online', 0.0001, 0, behavior), { visible: false, opacity: 0 });
      assert.deepEqual(resolve('online', -0.0001, 0, behavior), { visible: false, opacity: 0 });
    }
  });

  it('3. fade behavior uses a linear band over (tolerance, 2 x tolerance]', () => {
    const tol = 2;
    assert.deepEqual(resolve('online', 0, tol, 'fade'), { visible: true, opacity: 1 });
    assert.deepEqual(resolve('online', 2, tol, 'fade'), { visible: true, opacity: 1 });
    assert.deepEqual(resolve('online', 3, tol, 'fade'), { visible: true, opacity: 0.5 });
    assert.deepEqual(resolve('online', 4, tol, 'fade'), { visible: true, opacity: 0 });
    assert.deepEqual(resolve('online', 4.0001, tol, 'fade'), { visible: false, opacity: 0 });
  });

  it('4. hide behavior cuts hard at the tolerance and uses the absolute distance', () => {
    const tol = 2;
    assert.deepEqual(resolve('online', 2, tol, 'hide'), { visible: true, opacity: 1 });
    assert.deepEqual(resolve('online', 2.0001, tol, 'hide'), { visible: false, opacity: 0 });
    // `hide` also cuts at and beyond the fade endpoint of a `fade` policy.
    assert.deepEqual(resolve('online', 4, tol, 'hide'), { visible: false, opacity: 0 });
    // Signed distance is folded to its magnitude.
    assert.deepEqual(resolve('online', -3, tol, 'fade'), { visible: true, opacity: 0.5 });
    assert.deepEqual(resolve('online', -2, tol, 'hide'), { visible: true, opacity: 1 });
  });

  it('5. refuses malformed input with FIGURE_ANNOTATION_INVALID', () => {
    expectError({ availability: 'weird' as State, outOfPlaneDistanceMm: 0, planeToleranceMm: 2, outOfPlaneBehavior: 'hide' });
    expectError({ availability: 'online', outOfPlaneDistanceMm: Number.NaN, planeToleranceMm: 2, outOfPlaneBehavior: 'hide' });
    expectError({ availability: 'online', outOfPlaneDistanceMm: 0, planeToleranceMm: -1, outOfPlaneBehavior: 'hide' });
    expectError({ availability: 'online', outOfPlaneDistanceMm: 0, planeToleranceMm: Number.POSITIVE_INFINITY, outOfPlaneBehavior: 'fade' });
    expectError({ availability: 'online', outOfPlaneDistanceMm: Number.POSITIVE_INFINITY, planeToleranceMm: 2, outOfPlaneBehavior: 'fade' });
    expectError({ availability: 'online', outOfPlaneDistanceMm: Number.NEGATIVE_INFINITY, planeToleranceMm: 2, outOfPlaneBehavior: 'fade' });
    expectError({ availability: 'online', outOfPlaneDistanceMm: 0, planeToleranceMm: Number.NaN, outOfPlaneBehavior: 'fade' });
    expectError({ availability: 'online', outOfPlaneDistanceMm: 0, planeToleranceMm: 2, outOfPlaneBehavior: 'scroll' as 'hide' });
  });
});
