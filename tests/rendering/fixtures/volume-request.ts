/**
 * NuClear P3.2 — committed-fixture request builder (test infrastructure).
 *
 * Loads the Task A CT/PT fixtures, decodes their declared little-endian payload
 * and assembles a fully valid `VolumeIngestionRequest` through the real
 * `mapGeometryResult` mapper. Pure Node; shared by the volume-ingestion tests.
 */

import { readFileSync } from 'node:fs';

import type {
  AssetGeometry,
  AssetId,
  AssetKind,
  FrameOfReferenceUID,
  ImagingAsset,
  Modality,
  SeriesInstanceUID,
  StudyInstanceUID,
  ValueSemantics,
} from '../../../packages/shared-types/src/index.js';
import type {
  VolumePixelPayload,
  VolumeScalarArray,
  VolumeScalarDataType,
  VolumeSignedness,
} from '../../../packages/medical-engine/src/renderer/volume.ts';
import type {
  WorkerGeometryComputed,
  WorkerGeometryResult,
} from '../../../packages/medical-engine/src/worker/types.ts';
import { mapGeometryResult } from '../../../packages/medical-engine/src/index.js';

export type FixtureName = 'ct-axial' | 'pt-axial';

export interface RawPixels {
  dtype: VolumeScalarDataType;
  signedness: VolumeSignedness;
  samplesPerPixel: number;
  bitsAllocated: number;
  bitsStored: number;
  highBit: number;
  photometricInterpretation: string;
  scalarDataDomain: 'stored-values' | 'rescaled-hu' | 'rescaled-bqml';
  rescale?: { slope: number; intercept: number };
  dimensions: [number, number, number];
  values: string;
}

export interface RawFixture {
  assetId: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  frameOfReferenceUID: string;
  modality: string;
  kind: string;
  classification: { supported: boolean; reason: string | null };
  availability: string;
  instanceCount: number;
}

export interface Fixture {
  fixture: RawFixture;
  pixels: RawPixels;
  rawGeometry: Record<string, unknown>;
  evidence: WorkerGeometryComputed;
}

export interface Request {
  asset: ImagingAsset;
  availability: { state: 'online' | 'loading' | 'offline-cached' | 'missing' | 'mismatch' };
  classification: { supported: boolean; modality: string; reason: string | null };
  geometryEvidence: WorkerGeometryResult;
  pixels: VolumePixelPayload;
}

function readJson(path: URL): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function computed(evidence: WorkerGeometryResult): WorkerGeometryComputed {
  if (evidence.status !== 'computed') {
    throw new Error(`fixture geometry evidence is '${evidence.status}', not 'computed'`);
  }
  return evidence;
}

export function loadFixture(name: FixtureName): Fixture {
  const dir = new URL(`./volumes/${name}/`, import.meta.url);
  const rawGeometry = readJson(new URL('expected-geometry.json', dir)) as Record<string, unknown>;
  return {
    fixture: readJson(new URL('fixture.json', dir)) as RawFixture,
    pixels: readJson(new URL('pixels.json', dir)) as RawPixels,
    rawGeometry,
    evidence: computed(mapGeometryResult(rawGeometry)),
  };
}

/** Decodes the committed payload honouring its declared little-endian order. */
export function decodeScalarData(pixels: RawPixels): VolumeScalarArray {
  const bytes = Buffer.from(pixels.values, 'base64');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (pixels.dtype) {
    case 'int8':
      return new Int8Array(bytes);
    case 'uint8':
      return new Uint8Array(bytes);
    case 'int16': {
      const out = new Int16Array(bytes.byteLength / 2);
      for (let i = 0; i < out.length; i += 1) out[i] = view.getInt16(i * 2, true);
      return out;
    }
    case 'uint16': {
      const out = new Uint16Array(bytes.byteLength / 2);
      for (let i = 0; i < out.length; i += 1) out[i] = view.getUint16(i * 2, true);
      return out;
    }
    case 'float32': {
      const out = new Float32Array(bytes.byteLength / 4);
      for (let i = 0; i < out.length; i += 1) out[i] = view.getFloat32(i * 4, true);
      return out;
    }
    default:
      // Runtime guard for a cast that bypasses the restricted contract.
      throw new Error(`Unsupported scalar payload dtype '${String(pixels.dtype)}'`);
  }
}

function valueSemanticsFor(domain: RawPixels['scalarDataDomain']): ValueSemantics {
  if (domain === 'rescaled-hu') return { type: 'hounsfield', unit: 'HU' };
  if (domain === 'rescaled-bqml') return { type: 'activity-concentration', unit: 'Bq/mL' };
  return { type: 'generic-intensity', unit: 'a.u.' };
}

function makePayload(pixels: RawPixels): VolumePixelPayload {
  return {
    dtype: pixels.dtype,
    signedness: pixels.signedness,
    samplesPerPixel: pixels.samplesPerPixel,
    bitsAllocated: pixels.bitsAllocated,
    bitsStored: pixels.bitsStored,
    highBit: pixels.highBit,
    photometricInterpretation: pixels.photometricInterpretation,
    scalarDataDomain: pixels.scalarDataDomain,
    ...(pixels.rescale ? { rescale: pixels.rescale } : {}),
    dimensions: [pixels.dimensions[0], pixels.dimensions[1], pixels.dimensions[2]],
    scalarData: decodeScalarData(pixels),
  };
}

function makeAsset(fixture: RawFixture, geometry: AssetGeometry): ImagingAsset {
  return {
    id: fixture.assetId as AssetId,
    studyInstanceUID: fixture.studyInstanceUID as StudyInstanceUID,
    seriesInstanceUID: fixture.seriesInstanceUID as SeriesInstanceUID,
    sourceLocator: { kind: 'local-folder', path: `fixtures/volumes/${fixture.assetId}/instances` },
    sourceFingerprint: {
      studyInstanceUID: fixture.studyInstanceUID as StudyInstanceUID,
      seriesInstanceUID: fixture.seriesInstanceUID as SeriesInstanceUID,
      instanceCount: fixture.instanceCount,
      contentDigest: 'sha256:fixture',
    },
    modality: fixture.modality as Modality,
    kind: fixture.kind as AssetKind,
    geometry,
    frameOfReferenceUID: fixture.frameOfReferenceUID as FrameOfReferenceUID,
    metadata: {
      instanceCount: fixture.instanceCount,
      rescaleSlope: 1,
      rescaleIntercept: 0,
    },
    valueSemantics: valueSemanticsFor(
      fixture.modality === 'PT' ? 'rescaled-bqml' : 'rescaled-hu',
    ),
  };
}

/** Builds a fully valid request; individual tests override one field at a time. */
export function makeRequest(name: FixtureName): Request {
  const { fixture, pixels, evidence } = loadFixture(name);
  return {
    asset: makeAsset(fixture, evidence.assetGeometry),
    availability: { state: fixture.availability as Request['availability']['state'] },
    classification: {
      supported: fixture.classification.supported,
      modality: fixture.modality,
      reason: fixture.classification.reason,
    },
    geometryEvidence: evidence,
    pixels: makePayload(pixels),
  };
}
