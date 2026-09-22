/**
 * NuClear P4.1.1 / C1 — workspace input integrity tests.
 *
 * Pure Node, real public API. Proves `ImagingWorkspace` refuses non-finite and
 * non-JSON-safe input with a typed, path-naming `WorkspaceError` and never
 * mutates state on refusal, while valid payloads still round-trip losslessly.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  AssetId,
  ImagingAsset,
  StudyReference,
} from '../../packages/shared-types/src/index.js';
import {
  ImagingWorkspace,
  WorkspaceError,
  mockCtAsset,
  mockPetAsset,
  mockStudyReference,
  type WorkspaceErrorCode,
} from './fixtures/workspace-fixtures.ts';

// The fixture module registers the `.ts` resolve hook before this dynamic
// import, so the real product sources are imported by value.
const { assertSerializableValue, cloneSerializableValue } = await import(
  '../../packages/view-engine/src/workspace/index.ts'
);

/**
 * Deliberately invalid clinical payloads must bypass the compile-time
 * contract; each value is freshly constructed from the fixture (never a
 * pre-existing fixture escape) and widened once, locally, to reach the API.
 */
function invalidAsset(overrides: Record<string, unknown>): ImagingAsset {
  return { ...mockCtAsset, ...overrides } as unknown as ImagingAsset;
}

function invalidStudy(overrides: Record<string, unknown>): StudyReference {
  return { ...mockStudyReference, ...overrides } as unknown as StudyReference;
}

/** Asserts the exact code and that the message names the offending path. */
function expectRefusal(
  run: () => unknown,
  code: WorkspaceErrorCode,
  pathFragment: string,
): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof WorkspaceError, `expected WorkspaceError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(
      error.message.includes(pathFragment),
      `expected message to name '${pathFragment}', got: ${error.message}`,
    );
    return true;
  });
}

/** `ImagingWorkspace` arrives as a value, so derive its instance type here. */
type Workspace = InstanceType<typeof ImagingWorkspace>;

/** Stable fingerprint of the whole workspace used for no-mutation assertions. */
function snapshotJson(workspace: Workspace): string {
  return JSON.stringify(workspace.snapshot());
}

function registeredWorkspace(): Workspace {
  const workspace = new ImagingWorkspace();
  workspace.registerStudy(mockStudyReference);
  workspace.registerAsset(mockCtAsset);
  return workspace;
}

describe('NuClear P4.1.1 — workspace input integrity', () => {
  it('1. valid study and assets register; snapshot deep-equals its JSON round-trip', () => {
    const workspace = new ImagingWorkspace();
    workspace.registerStudy(mockStudyReference);
    workspace.registerAsset(mockCtAsset);
    workspace.registerAsset(mockPetAsset);

    const snapshot = workspace.snapshot();
    assert.deepEqual(snapshot, JSON.parse(JSON.stringify(snapshot)));
    assert.deepEqual(snapshot.studies, [mockStudyReference]);
    assert.deepEqual(snapshot.assets, [mockCtAsset, mockPetAsset]);
  });

  it('2. getAsset returns a deep-frozen value; mutation throws and never touches stored state', () => {
    const workspace = registeredWorkspace();
    const returned = workspace.getAsset(mockCtAsset.id);
    assert.deepEqual(returned, mockCtAsset);
    assert.ok(Object.isFrozen(returned), 'getAsset must publish a frozen value');
    assert.ok(Object.isFrozen(returned.metadata), 'nested asset metadata must be frozen');

    const mutable = returned as unknown as { metadata: { rescaleSlope: number } };
    assert.throws(
      () => {
        mutable.metadata.rescaleSlope = 999;
      },
      TypeError,
      'mutating a published asset must throw in strict mode',
    );
    assert.equal(workspace.getAsset(mockCtAsset.id).metadata.rescaleSlope, 1.0);
    assert.equal(mockCtAsset.metadata.rescaleSlope, 1.0, 'the caller fixture must stay mutable');
  });

  it('3. NaN in geometry.origin[0] is refused without mutating state', () => {
    const workspace = registeredWorkspace();
    const before = snapshotJson(workspace);
    const invalid = invalidAsset({
      id: 'asset-ct-nan-origin' as AssetId,
      geometry: { ...mockCtAsset.geometry, origin: [Number.NaN, -249.51171875, -500] },
    });

    expectRefusal(
      () => workspace.registerAsset(invalid),
      'WORKSPACE_NON_FINITE_NUMBER',
      'geometry.origin[0]',
    );
    assert.equal(snapshotJson(workspace), before);
    assert.equal(workspace.listAssets().length, 1);
  });

  it('4. NaN and ±Infinity in metadata/geometry are refused with the exact path', () => {
    const workspace = registeredWorkspace();
    const before = snapshotJson(workspace);

    const nanSlope = invalidAsset({
      id: 'asset-nan-slope' as AssetId,
      metadata: { ...mockCtAsset.metadata, rescaleSlope: Number.NaN },
    });
    expectRefusal(
      () => workspace.registerAsset(nanSlope),
      'WORKSPACE_NON_FINITE_NUMBER',
      'metadata.rescaleSlope',
    );

    const positive = invalidAsset({
      id: 'asset-pos-inf' as AssetId,
      metadata: { ...mockCtAsset.metadata, rescaleIntercept: Number.POSITIVE_INFINITY },
    });
    expectRefusal(
      () => workspace.registerAsset(positive),
      'WORKSPACE_NON_FINITE_NUMBER',
      'metadata.rescaleIntercept',
    );

    const negative = invalidAsset({
      id: 'asset-neg-inf' as AssetId,
      geometry: { ...mockCtAsset.geometry, spacing: [4, 4, Number.NEGATIVE_INFINITY] },
    });
    expectRefusal(
      () => workspace.registerAsset(negative),
      'WORKSPACE_NON_FINITE_NUMBER',
      'geometry.spacing[2]',
    );

    assert.equal(snapshotJson(workspace), before);
  });

  it('5. a nested Date is refused as an unsupported value', () => {
    const workspace = registeredWorkspace();
    const before = snapshotJson(workspace);
    const invalid = invalidAsset({
      id: 'asset-date' as AssetId,
      metadata: {
        ...mockCtAsset.metadata,
        seriesDescription: new Date('2026-09-20T10:00:00Z'),
      },
    });

    expectRefusal(
      () => workspace.registerAsset(invalid),
      'WORKSPACE_UNSUPPORTED_VALUE',
      'metadata.seriesDescription',
    );
    assert.equal(snapshotJson(workspace), before);
  });

  it('6. nested Map, Set, bigint and function are refused', () => {
    const workspace = registeredWorkspace();
    const before = snapshotJson(workspace);
    const metadata = mockCtAsset.metadata;

    const map = invalidAsset({
      id: 'asset-map' as AssetId,
      metadata: { ...metadata, extra: new Map() },
    });
    expectRefusal(() => workspace.registerAsset(map), 'WORKSPACE_UNSUPPORTED_VALUE', 'metadata.extra');

    const set = invalidAsset({
      id: 'asset-set' as AssetId,
      metadata: { ...metadata, extra: new Set() },
    });
    expectRefusal(() => workspace.registerAsset(set), 'WORKSPACE_UNSUPPORTED_VALUE', 'metadata.extra');

    const bigint = invalidAsset({
      id: 'asset-bigint' as AssetId,
      metadata: { ...metadata, instanceCount: 200n },
    });
    expectRefusal(
      () => workspace.registerAsset(bigint),
      'WORKSPACE_UNSUPPORTED_VALUE',
      'metadata.instanceCount',
    );

    const fn = invalidAsset({
      id: 'asset-function' as AssetId,
      metadata: { ...metadata, extra: () => 1 },
    });
    expectRefusal(() => workspace.registerAsset(fn), 'WORKSPACE_UNSUPPORTED_VALUE', 'metadata.extra');

    assert.equal(snapshotJson(workspace), before);
  });

  it('7. a cyclic asset is refused as WORKSPACE_CYCLIC_VALUE', () => {
    const workspace = registeredWorkspace();
    const before = snapshotJson(workspace);
    const cyclic: Record<string, unknown> = { ...mockCtAsset };
    cyclic.self = cyclic;

    expectRefusal(
      () => workspace.registerAsset(cyclic as unknown as ImagingAsset),
      'WORKSPACE_CYCLIC_VALUE',
      'self',
    );
    assert.equal(snapshotJson(workspace), before);
  });

  it('8. study inputs are validated: non-finite weight and bad values are refused', () => {
    const workspace = new ImagingWorkspace();
    const before = snapshotJson(workspace);

    const nanWeight = invalidStudy({
      patient: { ...mockStudyReference.patient, patientWeightKg: Number.NaN },
    });
    expectRefusal(
      () => workspace.registerStudy(nanWeight),
      'WORKSPACE_NON_FINITE_NUMBER',
      'patient.patientWeightKg',
    );

    const dateField = invalidStudy({
      patient: { ...mockStudyReference.patient, patientSex: new Date('2026-09-20T10:00:00Z') },
    });
    expectRefusal(
      () => workspace.registerStudy(dateField),
      'WORKSPACE_UNSUPPORTED_VALUE',
      'patient.patientSex',
    );

    assert.equal(snapshotJson(workspace), before);
    assert.equal(workspace.listStudies().length, 0);
  });

  it('9. an explicitly-undefined metadata property is refused with its exact path and no mutation', () => {
    const workspace = registeredWorkspace();
    const before = snapshotJson(workspace);
    const invalid = invalidAsset({
      id: 'asset-undefined-metadata' as AssetId,
      metadata: { ...mockCtAsset.metadata, seriesNumber: undefined },
    });

    expectRefusal(
      () => workspace.registerAsset(invalid),
      'WORKSPACE_UNDEFINED_VALUE',
      'metadata.seriesNumber',
    );
    assert.equal(snapshotJson(workspace), before);
    assert.equal(workspace.listAssets().length, 1);
  });

  it('10. an explicitly-undefined array element is refused naming the exact index', () => {
    const workspace = registeredWorkspace();
    const before = snapshotJson(workspace);
    const invalid = invalidAsset({
      id: 'asset-undefined-array' as AssetId,
      geometry: { ...mockCtAsset.geometry, origin: [undefined, -249.51171875, -500] },
    });

    expectRefusal(
      () => workspace.registerAsset(invalid),
      'WORKSPACE_UNDEFINED_VALUE',
      'geometry.origin[0]',
    );
    assert.equal(snapshotJson(workspace), before);
  });

  it('11. an asset whose optional property is omitted (absent) still registers', () => {
    const workspace = registeredWorkspace();
    // No key is present with value `undefined`: an absent optional property is
    // the representable form, so a fresh fixture spread must still register.
    const asset: ImagingAsset = { ...mockCtAsset, id: 'asset-omitted-optional' as AssetId };
    workspace.registerAsset(asset);
    assert.equal(
      workspace.getAsset('asset-omitted-optional' as AssetId).id,
      'asset-omitted-optional',
    );
    assert.equal(workspace.listAssets().length, 2);
  });
});

describe('NuClear P4.1.1 — value-integrity guarantees', () => {
  it('preserves -0, which is finite and must not be normalised', () => {
    const cloned = cloneSerializableValue({ value: -0 }, "probe 'negative-zero'");
    assert.ok(Object.is(cloned.value, -0));
  });

  it('allows shared non-cyclic references and keeps their identity inside the clone', () => {
    const shared = { voxel: 7 };
    const cloned = cloneSerializableValue({ a: shared, b: shared }, "probe 'shared'");
    assert.notEqual(cloned.a, shared);
    assert.equal(cloned.a, cloned.b);
  });

  it('refuses symbol values and symbol-keyed properties by path', () => {
    assert.throws(
      () => assertSerializableValue({ a: Symbol('x') }, "probe 'symbol-value'"),
      (error: unknown) =>
        error instanceof WorkspaceError &&
        error.code === 'WORKSPACE_UNSUPPORTED_VALUE' &&
        error.message.includes('a'),
    );

    const withSymbolKey: Record<string, unknown> & { [key: symbol]: unknown } = { ok: true };
    withSymbolKey[Symbol('secret')] = 1;
    assert.throws(
      () => assertSerializableValue(withSymbolKey, "probe 'symbol-key'"),
      (error: unknown) =>
        error instanceof WorkspaceError &&
        error.code === 'WORKSPACE_UNSUPPORTED_VALUE' &&
        error.message.includes('Symbol(secret)'),
    );
  });

  it('refuses an explicitly-undefined object property and names its path', () => {
    assert.throws(
      () => assertSerializableValue({ optional: undefined }, "probe 'undefined-property'"),
      (error: unknown) =>
        error instanceof WorkspaceError &&
        error.code === 'WORKSPACE_UNDEFINED_VALUE' &&
        error.message.includes('optional'),
    );
  });

  it('refuses an explicitly-undefined array element and a hole, naming the index', () => {
    assert.throws(
      () => assertSerializableValue([1, undefined], "probe 'undefined-element'"),
      (error: unknown) =>
        error instanceof WorkspaceError &&
        error.code === 'WORKSPACE_UNDEFINED_VALUE' &&
        error.message.includes('[1]'),
    );

    const holey: unknown[] = new Array(3);
    holey[0] = 1;
    holey[2] = 3;
    assert.throws(
      () => assertSerializableValue(holey, "probe 'undefined-hole'"),
      (error: unknown) =>
        error instanceof WorkspaceError &&
        error.code === 'WORKSPACE_UNDEFINED_VALUE' &&
        error.message.includes('[1]'),
    );
  });

  it('refuses a nested explicitly-undefined property and names the nested path', () => {
    assert.throws(
      () => assertSerializableValue({ a: { b: undefined } }, "probe 'undefined-nested'"),
      (error: unknown) =>
        error instanceof WorkspaceError &&
        error.code === 'WORKSPACE_UNDEFINED_VALUE' &&
        error.message.includes('a.b'),
    );
  });

  it('refuses a root undefined value', () => {
    assert.throws(
      () => assertSerializableValue(undefined, "probe 'undefined-root'"),
      (error: unknown) =>
        error instanceof WorkspaceError &&
        error.code === 'WORKSPACE_UNDEFINED_VALUE' &&
        error.message.includes("probe 'undefined-root'"),
    );
  });

  it('accepts absent optional properties (no key present at all)', () => {
    assert.doesNotThrow(() => assertSerializableValue({ present: 1 }, "probe 'absent-optional'"));
    assert.doesNotThrow(() => assertSerializableValue({}, "probe 'empty-object'"));
  });
});
