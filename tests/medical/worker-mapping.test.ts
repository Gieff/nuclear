/**
 * NuClear P2.5 — typed mapping of committed worker fixtures.
 *
 * Verifies that every mapper copies the worker payload verbatim, preserves
 * provenance and returns typed dispositions instead of throwing generically.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { describe, it } from 'node:test';
import type { ScientificWorkerMetadata } from '../../packages/shared-types/src/index.js';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const {
  mapCompatibilityResult,
  mapGeometryResult,
  mapInspectionResult,
  mapQuantitationResult,
  toStudySeriesReference,
} = await import('../../packages/medical-engine/src/index.js');

interface DiagnosticEntry {
  code: string;
  severity: string;
  message: string;
  file: string | null;
}
interface SeriesEntry {
  seriesInstanceUID: string;
  seriesNumber: number | null;
  modality: string;
  classification: string;
  supported: boolean;
  instanceCount: number;
  reason: string | null;
}
interface InspectionFixture {
  studies: Array<{ studyInstanceUID: string; modalities: string[]; series: SeriesEntry[] }>;
  diagnostics: DiagnosticEntry[];
  skippedFileCount: number;
}
interface GeometryFixture {
  status: string;
  seriesInstanceUID: string;
  studyInstanceUID?: string;
  modality?: string;
  instanceCount?: number;
  reason?: string;
  diagnostics: DiagnosticEntry[];
  geometry?: {
    frameOfReferenceUID: string;
    dimensions: number[];
    spacing: number[];
    origin: number[];
    direction: number[];
    sliceNormal: number[];
    slicePositionsLpsMm: number[][];
    bounds: { min: number[]; max: number[] };
    geometricDigest: string;
  };
}
interface QuantitationFixture {
  method: string;
  status: string;
  seriesInstanceUID: string;
  studyInstanceUID: string | null;
  petAcquisition: Record<string, unknown>;
  elapsedSeconds: number | null;
  decayedDoseBq: number | null;
  suvFactor?: number;
  diagnostic?: string;
  diagnostics: DiagnosticEntry[];
}
interface CompatibilityFixture {
  status: string;
  compatible: boolean;
  frameOfReference: { left: string; right: string; equal: boolean };
  orientation: { maxAngularDeltaDeg: number; coplanar: boolean };
  spacingMm: { left: number[]; right: number[] };
  originLpsMm: { left: number[]; right: number[] };
  extentOverlap: {
    overlaps: boolean;
    leftBounds: { min: number[]; max: number[] };
    rightBounds: { min: number[]; max: number[] };
  };
  incompatibilities: string[];
}

const SYNTH: ScientificWorkerMetadata = {
  workerVersion: '0.1.1',
  operation: 'nuclear.test.operation',
  timestamp: '2026-09-20T00:00:00Z',
  parameters: { synthetic: true },
};

function loadFixture<T>(relativePath: string): T {
  const url = new URL(`../fixtures/dicom/${relativePath}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

function withMetadata<T extends object>(fixture: T): T & { workerMetadata: ScientificWorkerMetadata } {
  return { ...fixture, workerMetadata: SYNTH };
}

describe('NuClear P2.5 — typed worker result mapping', () => {
  it('maps primary, unsupported and missing-tag inspections', () => {
    const ct = mapInspectionResult(
      withMetadata(loadFixture<InspectionFixture>('classification/ct-primary.expected.json')),
    );
    assert.equal(ct.studies.length, 1);
    assert.equal(ct.workerMetadata.workerVersion, '0.1.1');
    assert.equal(ct.workerMetadata.operation, SYNTH.operation);
    assert.equal(ct.workerMetadata.timestamp, SYNTH.timestamp);
    assert.equal(ct.skippedFileCount, 0);
    const ctSeries = ct.studies[0].series[0];
    assert.equal(ctSeries.classification, 'ct-primary');
    assert.equal(ctSeries.supported, true);
    assert.equal(ctSeries.reason, null);
    const ctReference = toStudySeriesReference(ctSeries);
    assert.equal(ctReference.seriesInstanceUID, ctSeries.seriesInstanceUID);
    assert.equal(ctReference.seriesNumber, 1);
    assert.equal(ctReference.modality, 'CT');
    assert.equal(ctReference.numberOfInstances, 3);

    const unsupported = mapInspectionResult(
      withMetadata(loadFixture<InspectionFixture>('classification/unsupported-modality.expected.json')),
    );
    const unsupportedSeries = unsupported.studies[0].series[0];
    assert.equal(unsupportedSeries.supported, false);
    assert.equal(unsupportedSeries.reason, 'unsupported-modality');
    assert.equal(toStudySeriesReference(unsupportedSeries).modality, 'MR');

    const missing = mapInspectionResult(
      withMetadata(loadFixture<InspectionFixture>('classification/missing-required-tag.expected.json')),
    );
    assert.equal(missing.diagnostics.length, 1);
    assert.equal(missing.diagnostics[0].code, 'dicom.missing-required-tag');
    assert.equal(missing.studies[0].series[0].reason, 'missing-required-tag:Modality');
    assert.equal(toStudySeriesReference(missing.studies[0].series[0]).modality, 'OT');
  });

  it('maps computed geometry preserving every raw number and the digest', () => {
    const fixture = loadFixture<GeometryFixture>('geometry/axial-exact.expected.json');
    const result = mapGeometryResult(withMetadata(fixture));
    assert.equal(result.status, 'computed');
    if (result.status !== 'computed') throw new Error('expected computed');
    assert.deepEqual(result.assetGeometry.dimensions, fixture.geometry?.dimensions);
    assert.ok(Object.is(result.assetGeometry.spacing[0], fixture.geometry?.spacing[0]));
    assert.ok(Object.is(result.assetGeometry.spacing[1], fixture.geometry?.spacing[1]));
    assert.ok(Object.is(result.assetGeometry.spacing[2], fixture.geometry?.spacing[2]));
    assert.deepEqual(result.assetGeometry.origin, fixture.geometry?.origin);
    assert.deepEqual(result.assetGeometry.direction, fixture.geometry?.direction);
    assert.deepEqual(result.assetGeometry.bounds.min, fixture.geometry?.bounds.min);
    assert.deepEqual(result.assetGeometry.bounds.max, fixture.geometry?.bounds.max);
    assert.equal(result.geometricDigest, fixture.geometry?.geometricDigest);
    assert.deepEqual(result.sliceNormal, fixture.geometry?.sliceNormal);
    assert.deepEqual(result.slicePositionsLpsMm, fixture.geometry?.slicePositionsLpsMm);
    assert.equal(result.instanceCount, 3);
  });

  it('maps rejected geometry as a typed disposition', () => {
    const fixture = loadFixture<GeometryFixture>('geometry/irregular-spacing.expected.json');
    const result = mapGeometryResult(withMetadata(fixture));
    assert.equal(result.status, 'rejected');
    if (result.status !== 'rejected') throw new Error('expected rejected');
    assert.equal(result.reason, 'irregular-slice-spacing');
    assert.equal(result.diagnostics[0].code, 'dicom.geometry.irregular-slice-spacing');
  });

  it('maps computed SUVbw with all seven PET inputs and identical factor', () => {
    const fixture = loadFixture<QuantitationFixture>('quantitation/suvbw-bqml.expected.json');
    const result = mapQuantitationResult(withMetadata(fixture));
    assert.equal(result.quantitation.method, 'suv-bw');
    assert.equal(result.quantitation.status, 'computed');
    assert.ok(Object.is(result.quantitation.suvFactor, fixture.suvFactor));
    assert.equal(result.quantitation.workerMetadata.workerVersion, SYNTH.workerVersion);
    assert.equal(result.quantitation.workerMetadata.operation, SYNTH.operation);
    assert.equal(result.quantitation.workerMetadata.timestamp, SYNTH.timestamp);
    assert.equal(result.studyInstanceUID, fixture.studyInstanceUID);
    assert.ok(Object.is(result.elapsedSeconds, fixture.elapsedSeconds));
    assert.ok(Object.is(result.decayedDoseBq, fixture.decayedDoseBq));
    assert.notEqual(result.petAcquisitionMetadata, null);
    assert.deepEqual(Object.keys(result.petAcquisition).sort(), [
      'acquisitionDateTime',
      'decayCorrection',
      'patientWeightKg',
      'radionuclideHalfLifeSeconds',
      'radionuclideTotalDoseBq',
      'radiopharmaceuticalStartDateTime',
      'units',
    ]);
    assert.equal(result.petAcquisitionMetadata?.patientWeightKg, 70.0);
  });

  it('preserves partial PET inputs and never fabricates missing fields', () => {
    const fixture = loadFixture<QuantitationFixture>('quantitation/missing-metadata.expected.json');
    const result = mapQuantitationResult(withMetadata(fixture));
    assert.equal(result.quantitation.status, 'unavailable');
    assert.equal(result.quantitation.diagnostic, fixture.diagnostic);
    assert.equal('suvFactor' in result.quantitation, false);
    assert.equal(result.petAcquisitionMetadata, null);
    assert.equal(result.petAcquisition.patientWeightKg, undefined);
    assert.deepEqual(Object.keys(result.petAcquisition).sort(), [
      'acquisitionDateTime',
      'decayCorrection',
      'radionuclideHalfLifeSeconds',
      'radionuclideTotalDoseBq',
      'radiopharmaceuticalStartDateTime',
      'units',
    ]);
  });

  it('maps invalid units and invalid decay correction without a factor', () => {
    const units = mapQuantitationResult(
      withMetadata(loadFixture<QuantitationFixture>('quantitation/unsupported-units.expected.json')),
    );
    const decay = mapQuantitationResult(
      withMetadata(loadFixture<QuantitationFixture>('quantitation/invalid-decay-correction.expected.json')),
    );
    assert.equal(units.quantitation.status, 'invalid');
    assert.equal(decay.quantitation.status, 'invalid');
    assert.equal('suvFactor' in units.quantitation, false);
    assert.equal('suvFactor' in decay.quantitation, false);
    assert.equal(units.quantitation.diagnostic, "Units 'CNTS' is not BQML.");
  });

  it('maps pairwise compatibility evidence and incompatibilities', () => {
    const fixture = loadFixture<CompatibilityFixture>('geometry/frame-of-reference-mismatch.expected.json');
    const result = mapCompatibilityResult(withMetadata(fixture));
    assert.equal(result.status, 'computed');
    if (result.status !== 'computed') throw new Error('expected computed');
    assert.equal(result.compatible, false);
    assert.equal(result.frameOfReference.equal, false);
    assert.notEqual(result.frameOfReference.left, result.frameOfReference.right);
    assert.ok(Object.is(result.orientation.maxAngularDeltaDeg, fixture.orientation.maxAngularDeltaDeg));
    assert.deepEqual(result.incompatibilities, ['frame-of-reference-mismatch']);
    assert.deepEqual(result.spacingMm.left, fixture.spacingMm.left);
    assert.deepEqual(result.extentOverlap.rightBounds.max, fixture.extentOverlap.rightBounds.max);
    assert.equal(result.workerMetadata.operation, SYNTH.operation);
  });
});
