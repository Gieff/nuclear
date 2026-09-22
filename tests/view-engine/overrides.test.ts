/**
 * NuClear P4.5 — local view override resolution (ADR-010 §4).
 *
 * Pure Node: no DOM, WebGL or Cornerstone. The static import of the workspace
 * fixtures registers the `.js`→`.ts` resolve hook before the product modules
 * are dynamically imported by value. Positives cover every overridable state;
 * negatives pin the fail-closed validation order. A `LocalViewOverride` is a
 * local divergence and is deliberately NOT blocked by a `StateLock`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  CameraState,
  CompositionState,
  ComposerViewInstanceId,
  LocalViewOverride,
  MedicalViewState,
  PreparedView,
  PreparedViewId,
  PresentationState,
  ProjectionState,
  SpatialState,
  ViewId,
  ViewStateOverride,
} from '../../packages/shared-types/src/index.js';
import { mockIdentityTransform, mockViewProvenance } from '../fixtures/clinical-contracts.fixture.ts';
import {
  mockFusionView,
  mockFusionViewProvenance,
  mockLocalOverride,
  mockMedicalView,
} from '../fixtures/view-contracts.fixture.ts';
import { mockCtAsset, mockPetAsset, mockStudyReference } from './fixtures/workspace-fixtures.ts';

const overridesModule = await import('../../packages/view-engine/src/overrides/index.ts');
const preparedViewModule = await import('../../packages/view-engine/src/prepared-view/index.ts');
const { ImagingWorkspace } = await import('../../packages/view-engine/src/workspace/index.ts');

const { resolveLocalViewOverride, OverrideError } = overridesModule;
const { assemblePreparedView, PreparedViewError } = preparedViewModule;

const COMPOSER = 'composer-instance' as ComposerViewInstanceId;
const CT_PREPARED = 'prepared-ct-override' as PreparedViewId;
const FUSION_PREPARED = 'prepared-fusion-override' as PreparedViewId;
const UNKNOWN_PREPARED = 'prepared-missing-override' as PreparedViewId;

function ctPrepared(): PreparedView {
  return assemblePreparedView({
    preparedViewId: CT_PREPARED,
    state: structuredClone(mockMedicalView),
    provenance: structuredClone(mockViewProvenance),
  });
}

function fusionPrepared(): PreparedView {
  return assemblePreparedView({
    preparedViewId: FUSION_PREPARED,
    state: structuredClone(mockFusionView),
    provenance: structuredClone(mockFusionViewProvenance),
  });
}

function overrideWith(
  source: PreparedView,
  overrides: readonly ViewStateOverride[],
): LocalViewOverride {
  return { sourceViewId: source.sourceViewId, targetComposerViewInstanceId: COMPOSER, overrides };
}

function spatialValue(): SpatialState {
  return { ...structuredClone(mockMedicalView.spatial), sliceOffsetMm: 12 };
}

function cameraValue(zoom = 2.5): CameraState {
  return { ...structuredClone(mockMedicalView.camera), zoom };
}

function projectionValue(): ProjectionState {
  return { mode: 'MIP', slabThicknessMm: 8 };
}

function presentationValue(): PresentationState {
  return { ...structuredClone(mockMedicalView.presentation), opacity: 0.5 };
}

function compositionValue(): CompositionState {
  return {
    mode: 'single',
    layers: [{ assetId: mockCtAsset.id, role: 'base', transformId: mockIdentityTransform.id }],
  };
}

function expectOverrideError(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof OverrideError, `expected OverrideError, got ${String(error)}`);
    assert.equal(error.name, 'OverrideError');
    assert.equal(error.code, code);
    assert.ok(error.message.includes('Remediation:'), 'message must carry a remediation clause');
    return true;
  });
}

const positiveCases: ReadonlyArray<{ readonly label: string; readonly entry: ViewStateOverride }> = [
  { label: 'spatial', entry: { state: 'spatial', value: spatialValue() } },
  { label: 'camera', entry: { state: 'camera', value: cameraValue() } },
  { label: 'projection', entry: { state: 'projection', value: projectionValue() } },
  { label: 'presentation', entry: { state: 'presentation', value: presentationValue() } },
  { label: 'composition', entry: { state: 'composition', value: compositionValue() } },
];

const SINGLE_STATES: readonly ViewStateOverride['state'][] = [
  'spatial',
  'camera',
  'projection',
  'presentation',
  'composition',
];

describe('NuClear P4.5 — local view override (ADR-010 §4)', () => {
  it('a. resolves every overridable state without mutating the source', () => {
    for (const testCase of positiveCases) {
      const source = ctPrepared();
      const stateRef = source.state;
      const snapshot = structuredClone(source.state);
      const override = overrideWith(source, [testCase.entry]);
      const overrideSnapshot = structuredClone(override);

      const resolved = resolveLocalViewOverride(source, override);

      assert.equal(source.state, stateRef, `${testCase.label}: source state identity preserved`);
      assert.deepEqual(source.state, snapshot, `${testCase.label}: source deep-equality preserved`);
      assert.ok(Object.isFrozen(source.state), `${testCase.label}: source stays frozen`);
      assert.deepEqual(override, overrideSnapshot, `${testCase.label}: override unchanged`);

      const expected: MedicalViewState = { ...snapshot, [testCase.label]: testCase.entry.value };
      assert.deepEqual(resolved.state, expected, `${testCase.label}: merged state`);

      const resolvedRecord = resolved.state as unknown as Record<string, unknown>;
      const sourceRecord = source.state as unknown as Record<string, unknown>;
      for (const other of SINGLE_STATES) {
        if (other === testCase.label) continue;
        assert.equal(
          resolvedRecord[other],
          sourceRecord[other],
          `${testCase.label}: non-overridden '${other}' identity preserved`,
        );
      }

      assert.equal(resolved.targetComposerViewInstanceId, COMPOSER);
      assert.equal(resolved.sourceViewId, source.sourceViewId);
      assert.equal(resolved.sourcePreparedViewId, source.id);
      assert.ok(Object.isFrozen(resolved), `${testCase.label}: resolved wrapper frozen`);
      assert.ok(Object.isFrozen(resolved.state), `${testCase.label}: resolved state frozen`);
      assert.deepEqual(
        JSON.parse(JSON.stringify(resolved)),
        resolved,
        `${testCase.label}: JSON-lossless`,
      );
    }
  });

  it('b. resolves the curated mockLocalOverride fixture', () => {
    const source = ctPrepared();
    const resolved = resolveLocalViewOverride(source, mockLocalOverride);
    assert.equal(resolved.targetComposerViewInstanceId, mockLocalOverride.targetComposerViewInstanceId);
    assert.equal(resolved.sourceViewId, mockLocalOverride.sourceViewId);
    assert.deepEqual(resolved.state.camera, mockLocalOverride.overrides[0].value);
  });

  it('c. re-resolving is idempotent and leaves the source untouched', () => {
    const source = ctPrepared();
    const stateRef = source.state;
    const override = overrideWith(source, [{ state: 'camera', value: cameraValue() }]);

    const first = resolveLocalViewOverride(source, override);
    const second = resolveLocalViewOverride(source, override);

    assert.deepEqual(second, first, 'a re-resolve is structurally equal');
    assert.notEqual(second.state, first.state, 'each resolve publishes a fresh container');
    assert.equal(source.state, stateRef, 'the source is still the same object');
  });

  it('d. rejects a malformed override before any freeze', () => {
    const source = ctPrepared();
    const malformed: readonly LocalViewOverride[] = [
      null as unknown as LocalViewOverride,
      {
        sourceViewId: 'view-ct',
        targetComposerViewInstanceId: 'composer-x',
        overrides: 'not-an-array',
      } as unknown as LocalViewOverride,
      {
        sourceViewId: 'view-ct',
        targetComposerViewInstanceId: 'composer-x',
        overrides: [{ state: 'binding', value: {} }],
      } as unknown as LocalViewOverride,
      {
        sourceViewId: 'view-ct',
        targetComposerViewInstanceId: 'composer-x',
        overrides: [{ state: 'camera' }],
      } as unknown as LocalViewOverride,
    ];
    for (const override of malformed) {
      expectOverrideError(() => resolveLocalViewOverride(source, override), 'OVERRIDE_MALFORMED');
    }
  });

  it('e. rejects a source mismatch, an empty override and a duplicate state', () => {
    const source = ctPrepared();
    const mismatched: LocalViewOverride = {
      ...overrideWith(source, [{ state: 'camera', value: cameraValue() }]),
      sourceViewId: 'view-other' as ViewId,
    };
    expectOverrideError(() => resolveLocalViewOverride(source, mismatched), 'OVERRIDE_SOURCE_MISMATCH');
    expectOverrideError(() => resolveLocalViewOverride(source, overrideWith(source, [])), 'OVERRIDE_EMPTY');
    expectOverrideError(
      () =>
        resolveLocalViewOverride(
          source,
          overrideWith(source, [
            { state: 'camera', value: cameraValue(2) },
            { state: 'camera', value: cameraValue(3) },
          ]),
        ),
      'OVERRIDE_DUPLICATE_STATE',
    );
  });

  it('f. refuses presentation on a composed source', () => {
    const fusion = fusionPrepared();
    expectOverrideError(
      () => resolveLocalViewOverride(fusion, overrideWith(fusion, [{ state: 'presentation', value: presentationValue() }])),
      'OVERRIDE_STATE_NOT_APPLICABLE',
    );
  });

  it('g. refuses a composition variant change or an incoherent dataBinding', () => {
    const single = ctPrepared();
    expectOverrideError(
      () =>
        resolveLocalViewOverride(
          single,
          overrideWith(single, [{ state: 'composition', value: mockFusionView.composition }]),
        ),
      'OVERRIDE_STATE_NOT_APPLICABLE',
    );
    expectOverrideError(
      () =>
        resolveLocalViewOverride(
          single,
          overrideWith(single, [
            { state: 'composition', value: { mode: 'single', layers: [{ assetId: mockPetAsset.id, role: 'base' }] } },
          ]),
        ),
      'OVERRIDE_STATE_NOT_APPLICABLE',
    );

    const fusion = fusionPrepared();
    expectOverrideError(
      () =>
        resolveLocalViewOverride(
          fusion,
          overrideWith(fusion, [
            { state: 'composition', value: { mode: 'single', layers: [{ assetId: mockCtAsset.id, role: 'base' }] } },
          ]),
        ),
      'OVERRIDE_STATE_NOT_APPLICABLE',
    );
  });

  it('h. resolves through ImagingWorkspace and propagates an unknown prepared view id', () => {
    const workspace = new ImagingWorkspace();
    workspace.registerStudy(mockStudyReference);
    workspace.registerAsset(mockCtAsset);
    workspace.registerAsset(mockPetAsset);
    const source = ctPrepared();
    workspace.registerPreparedView(source);
    const override = overrideWith(source, [{ state: 'camera', value: cameraValue() }]);

    const resolved = workspace.resolveLocalViewOverride(CT_PREPARED, override);
    assert.equal(resolved.sourcePreparedViewId, CT_PREPARED);
    assert.deepEqual(resolved.state.camera, cameraValue());

    assert.throws(
      () => workspace.resolveLocalViewOverride(UNKNOWN_PREPARED, override),
      (error: unknown) => {
        assert.ok(error instanceof PreparedViewError, `expected PreparedViewError, got ${String(error)}`);
        assert.equal(error.code, 'PREPARED_VIEW_UNKNOWN_ID');
        return true;
      },
    );
  });

  it('i. refuses malformed composition values with a typed OverrideError, not a TypeError', () => {
    const single = ctPrepared();
    const fusion = fusionPrepared();
    const malformedCompositions: ReadonlyArray<{ source: PreparedView; value: unknown }> = [
      { source: single, value: null },
      { source: single, value: 'garbage' },
      { source: single, value: { mode: 'single' } },
      { source: fusion, value: { mode: 'mystery', layers: [] } },
    ];
    for (const { source, value } of malformedCompositions) {
      expectOverrideError(
        () =>
          resolveLocalViewOverride(
            source,
            overrideWith(source, [{ state: 'composition', value: value as CompositionState }]),
          ),
        'OVERRIDE_MALFORMED',
      );
    }

    // Structurally shaped but incoherent first layers must still be a typed
    // refusal (never an unguarded `TypeError` on `layers[0]`/`binding`).
    const incoherentLayers: ReadonlyArray<{ source: PreparedView; value: CompositionState }> = [
      { source: single, value: { mode: 'single', layers: [null] } as unknown as CompositionState },
      { source: fusion, value: { mode: 'multi-layer', layers: [{}] } as unknown as CompositionState },
    ];
    for (const { source, value } of incoherentLayers) {
      expectOverrideError(
        () => resolveLocalViewOverride(source, overrideWith(source, [{ state: 'composition', value }])),
        'OVERRIDE_STATE_NOT_APPLICABLE',
      );
    }

    assert.ok(Object.isFrozen(single.state), 'a refused override leaves the source frozen/untouched');
    assert.ok(Object.isFrozen(fusion.state));
  });
});
