/**
 * NuClear P3.2 — pure, fail-closed volume ingestion planning.
 *
 * Imports the Node-safe `volume.ts` directly (no browser, no Cornerstone) and
 * drives it with the committed Task A fixtures through the real
 * `mapGeometryResult` mapper. Covers the positive CT/PT plans, every
 * fail-closed refusal code, and the non-identity Cornerstone direction layout
 * that the axial-identity fixtures cannot disambiguate.
 */

import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type { AssetGeometry, FrameOfReferenceUID, SeriesInstanceUID } from '../../packages/shared-types/src/index.js';
import type { WorkerGeometryComputed } from '../../packages/medical-engine/src/worker/types.ts';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));
const {
  assembleCornerstoneDirection,
  buildVolumeIngestionPlan,
  VOLUME_INGESTION_ERROR_CODES,
  VolumeIngestionError,
} = await import('../../packages/medical-engine/src/renderer/volume.ts');
const { loadFixture, makeRequest } = await import('./fixtures/volume-request.ts');
const { mapGeometryResult } = await import('../../packages/medical-engine/src/index.js');

function expectCode(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof VolumeIngestionError, `expected VolumeIngestionError, got ${String(error)}`);
    assert.equal((error as VolumeIngestionError).code, code);
    assert.ok((error as VolumeIngestionError).message.length > 0, 'expected an actionable message');
    return true;
  });
}

describe('NuClear P3.2 — volume ingestion planning', () => {
  it('builds the CT plan with storable geometry, metadata and provenance', () => {
    const { fixture, rawGeometry, evidence } = loadFixture('ct-axial');
    const plan = buildVolumeIngestionPlan(makeRequest('ct-axial'));
    const digest = (rawGeometry.geometry as Record<string, unknown>).geometricDigest;

    assert.equal(plan.assetId, fixture.assetId);
    assert.equal(plan.seriesInstanceUID, fixture.seriesInstanceUID);
    assert.equal(plan.frameOfReferenceUID, fixture.frameOfReferenceUID);
    assert.deepEqual([...plan.dimensions], [4, 4, 3]);
    assert.deepEqual([...plan.spacing], [0.5, 0.5, 2]);
    assert.deepEqual([...plan.origin], [0, 0, 0]);
    assert.deepEqual([...plan.direction], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    assert.equal(plan.scalarDataDomain, 'rescaled-hu');
    assert.ok(plan.scalarData instanceof Int16Array, 'CT scalar data must be Int16Array');
    assert.equal(plan.scalarData.length, 48);
    assert.equal(plan.volumeId, `nuclear-volume:${fixture.assetId}:${String(digest)}`);
    assert.equal(plan.provenance.geometricDigest, digest);
    assert.equal(plan.provenance.workerModality, 'CT');
    assert.equal(plan.metadata.Modality, 'CT');
    assert.equal(plan.metadata.BitsAllocated, 16);
    assert.equal(plan.metadata.BitsStored, 16);
    assert.equal(plan.metadata.HighBit, 15);
    assert.equal(plan.metadata.SamplesPerPixel, 1);
    assert.equal(plan.metadata.PhotometricInterpretation, 'MONOCHROME2');
    assert.equal(plan.metadata.PixelRepresentation, 1);
    assert.deepEqual(plan.metadata.ImageOrientationPatient, [1, 0, 0, 0, 1, 0]);
    assert.deepEqual(plan.metadata.PixelSpacing, [0.5, 0.5]);
    assert.equal(plan.metadata.Columns, 4);
    assert.equal(plan.metadata.Rows, 4);
    assert.deepEqual(plan.metadata.voiLut, [], 'no window/level may be invented');
    assert.equal(plan.metadata.VOILUTFunction, 'LINEAR');
    assert.equal(plan.metadata.SeriesInstanceUID, evidence.seriesInstanceUID);
  });

  it('builds the PT plan as rescaled Bq/mL float scalar data', () => {
    const plan = buildVolumeIngestionPlan(makeRequest('pt-axial'));
    assert.equal(plan.scalarDataDomain, 'rescaled-bqml');
    assert.ok(plan.scalarData instanceof Float32Array, 'PT scalar data must be Float32Array');
    assert.equal(plan.scalarData.length, 48);
    assert.equal(plan.scalarData[0], 100000);
    assert.equal(plan.scalarData[47], 147000);
    assert.equal(plan.metadata.Modality, 'PT');
    assert.equal(plan.metadata.PixelRepresentation, 0, 'float payloads use unsigned convention');
    assert.equal(plan.provenance.workerModality, 'PT');
  });
});

describe('NuClear P3.2 — volume ingestion fail-closed refusals', () => {
  const base = () => makeRequest('ct-axial');
  const codes = VOLUME_INGESTION_ERROR_CODES;

  it('refuses each non-online/non-loading availability state', () => {
    expectCode(
      () => buildVolumeIngestionPlan({ ...base(), availability: { state: 'missing' } }),
      codes.sourceUnavailable,
    );
    expectCode(
      () => buildVolumeIngestionPlan({ ...base(), availability: { state: 'offline-cached' } }),
      codes.sourceUnavailable,
    );
    expectCode(
      () => buildVolumeIngestionPlan({ ...base(), availability: { state: 'mismatch' } }),
      codes.sourceMismatch,
    );
  });

  it('proceeds for loading and online availability', () => {
    assert.ok(buildVolumeIngestionPlan({ ...base(), availability: { state: 'online' } }));
    assert.ok(buildVolumeIngestionPlan({ ...base(), availability: { state: 'loading' } }));
  });

  it('refuses an unsupported worker classification', () => {
    expectCode(
      () =>
        buildVolumeIngestionPlan({
          ...base(),
          classification: { supported: false, modality: 'CT', reason: 'uncalibrated' },
        }),
      codes.unsupportedClassification,
    );
  });

  it('refuses unsupported modality and asset kind', () => {
    const request = base();
    expectCode(
      () => buildVolumeIngestionPlan({ ...request, asset: { ...request.asset, modality: 'MR' } }),
      codes.unsupportedClassification,
    );
    expectCode(
      () => buildVolumeIngestionPlan({ ...request, asset: { ...request.asset, kind: 'stack' } }),
      codes.unsupportedClassification,
    );
  });

  it('refuses rejected and unavailable worker evidence', () => {
    const { rawGeometry } = loadFixture('ct-axial');
    const rejected = mapGeometryResult({ ...rawGeometry, status: 'rejected', reason: 'inconsistent-frame-of-reference' });
    const unavailable = mapGeometryResult({ ...rawGeometry, status: 'unavailable', reason: 'series-not-found' });
    expectCode(() => buildVolumeIngestionPlan({ ...base(), geometryEvidence: rejected }), codes.evidenceUnavailable);
    expectCode(() => buildVolumeIngestionPlan({ ...base(), geometryEvidence: unavailable }), codes.evidenceUnavailable);
  });

  it('refuses series, frame-of-reference and modality disagreement with evidence', () => {
    const request = base();
    expectCode(
      () =>
        buildVolumeIngestionPlan({
          ...request,
          asset: { ...request.asset, seriesInstanceUID: '1.2.3.other' as SeriesInstanceUID },
        }),
      codes.geometryDisagreement,
    );
    expectCode(
      () => buildVolumeIngestionPlan({ ...request, asset: { ...request.asset, seriesInstanceUID: undefined } }),
      codes.geometryDisagreement,
    );
    expectCode(
      () =>
        buildVolumeIngestionPlan({
          ...request,
          asset: { ...request.asset, frameOfReferenceUID: '1.2.3.other' as FrameOfReferenceUID },
        }),
      codes.geometryDisagreement,
    );
    // PT stays an acceptable CT/PT volume, so step 5 (not step 3) must fire.
    expectCode(
      () => buildVolumeIngestionPlan({ ...request, asset: { ...request.asset, modality: 'PT' } }),
      codes.geometryDisagreement,
    );
  });

  it('refuses deep asset.geometry disagreement with the worker geometry', () => {
    const request = base();
    const fields: Array<(geometry: AssetGeometry) => AssetGeometry> = [
      (g) => ({ ...g, frameOfReferenceUID: '1.2.3.other' as FrameOfReferenceUID }),
      (g) => ({ ...g, dimensions: [4, 4, 4] }),
      (g) => ({ ...g, spacing: [0.5, 0.5, 3] }),
      (g) => ({ ...g, origin: [1, 0, 0] }),
      (g) => ({ ...g, direction: [0, 1, 0, 1, 0, 0] }),
    ];
    for (const mutate of fields) {
      expectCode(
        () => buildVolumeIngestionPlan({ ...request, asset: { ...request.asset, geometry: mutate(request.asset.geometry) } }),
        codes.geometryDisagreement,
      );
    }
  });

  it('refuses payload dimension and voxel-count mismatch', () => {
    const request = base();
    expectCode(
      () => buildVolumeIngestionPlan({ ...request, pixels: { ...request.pixels, dimensions: [4, 4, 4] } }),
      codes.payloadInvalid,
    );
    const short = new Int16Array(request.pixels.scalarData.length - 1);
    expectCode(
      () => buildVolumeIngestionPlan({ ...request, pixels: { ...request.pixels, scalarData: short } }),
      codes.payloadInvalid,
    );
  });
});

describe('NuClear P3.2 — Cornerstone direction layout', () => {
  it('lays out a non-identity direction as [iAxis(3), jAxis(3), kAxis(3)]', () => {
    // Identity fixtures cannot disambiguate element order; this can.
    const direction = assembleCornerstoneDirection([0, 1, 0, -1, 0, 0], [0, 0, 1]);
    assert.deepEqual([...direction], [0, 1, 0, -1, 0, 0, 0, 0, 1]);
  });

  it('propagates a non-identity worker orientation into the plan verbatim', () => {
    const request = makeRequest('ct-axial');
    const orientation = [0, 1, 0, -1, 0, 0] as const;
    const geometryEvidence: WorkerGeometryComputed = {
      ...request.geometryEvidence,
      assetGeometry: { ...request.geometryEvidence.assetGeometry, direction: orientation },
      sliceNormal: [0, 0, 1],
    };
    const asset = { ...request.asset, geometry: { ...request.asset.geometry, direction: orientation } };
    const plan = buildVolumeIngestionPlan({ ...request, asset, geometryEvidence });
    assert.deepEqual([...plan.direction], [0, 1, 0, -1, 0, 0, 0, 0, 1]);
    assert.deepEqual([...plan.dimensions], [...request.geometryEvidence.assetGeometry.dimensions]);
    assert.deepEqual([...plan.origin], [...request.geometryEvidence.assetGeometry.origin]);
  });
});
