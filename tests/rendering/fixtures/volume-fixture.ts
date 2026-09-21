/**
 * NuClear P3.2 — committed-fixture decoding and request assembly (test
 * infrastructure, browser-side).
 *
 * Pure helpers shared by the volume probe: decode the declared payload, build
 * the `ImagingAsset` from the fixture descriptor and map the raw worker
 * geometry through the real mapper. No Cornerstone import here.
 */

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
} from '../../../packages/shared-types/src/index.ts';
import {
  VOLUME_INGESTION_ERROR_CODES,
  VolumeIngestionError,
} from '../../../packages/medical-engine/src/renderer/volume-errors.ts';
import type {
  ScalarDataDomain,
  VolumeScalarArray,
  VolumeScalarDataType,
  VolumeSignedness,
} from '../../../packages/medical-engine/src/renderer/volume-types.ts';
import { mapGeometryResult } from '../../../packages/medical-engine/src/worker/mapping.ts';
import type { WorkerGeometryComputed } from '../../../packages/medical-engine/src/worker/types.ts';

export interface FixtureClassification {
  supported: boolean;
  reason: string | null;
}

export interface VolumeFixtureDescriptor {
  assetId: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  frameOfReferenceUID: string;
  modality: string;
  kind: string;
  classification: FixtureClassification;
  availability: string;
  instanceCount: number;
}

export interface RawPixelPayload {
  dtype: VolumeScalarDataType;
  signedness: VolumeSignedness;
  samplesPerPixel: number;
  bitsAllocated: number;
  bitsStored: number;
  highBit: number;
  photometricInterpretation: string;
  scalarDataDomain: ScalarDataDomain;
  rescale?: { slope: number; intercept: number };
  dimensions: [number, number, number];
  values: string;
}

export interface VolumeProbeInput {
  fixture: VolumeFixtureDescriptor;
  pixels: RawPixelPayload;
  expectedGeometry: unknown;
}

export function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function readTypedArray(bytes: Uint8Array, dtype: VolumeScalarDataType): VolumeScalarArray {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = true;
  switch (dtype) {
    case 'int8':
      return new Int8Array(bytes);
    case 'uint8':
      return new Uint8Array(bytes);
    case 'int16': {
      const out = new Int16Array(bytes.byteLength / 2);
      for (let i = 0; i < out.length; i += 1) out[i] = view.getInt16(i * 2, littleEndian);
      return out;
    }
    case 'uint16': {
      const out = new Uint16Array(bytes.byteLength / 2);
      for (let i = 0; i < out.length; i += 1) out[i] = view.getUint16(i * 2, littleEndian);
      return out;
    }
    case 'int32': {
      const out = new Int32Array(bytes.byteLength / 4);
      for (let i = 0; i < out.length; i += 1) out[i] = view.getInt32(i * 4, littleEndian);
      return out;
    }
    case 'uint32': {
      const out = new Uint32Array(bytes.byteLength / 4);
      for (let i = 0; i < out.length; i += 1) out[i] = view.getUint32(i * 4, littleEndian);
      return out;
    }
    case 'float32': {
      const out = new Float32Array(bytes.byteLength / 4);
      for (let i = 0; i < out.length; i += 1) out[i] = view.getFloat32(i * 4, littleEndian);
      return out;
    }
    case 'float64': {
      const out = new Float64Array(bytes.byteLength / 8);
      for (let i = 0; i < out.length; i += 1) out[i] = view.getFloat64(i * 8, littleEndian);
      return out;
    }
  }
}

function valueSemanticsFor(domain: ScalarDataDomain): ValueSemantics {
  if (domain === 'rescaled-hu') return { type: 'hounsfield', unit: 'HU' };
  if (domain === 'rescaled-bqml') return { type: 'activity-concentration', unit: 'Bq/mL' };
  return { type: 'generic-intensity', unit: 'a.u.' };
}

export function buildAsset(
  fixture: VolumeFixtureDescriptor,
  geometry: AssetGeometry,
  pixel: RawPixelPayload,
  geometricDigest: string,
): ImagingAsset {
  return {
    id: fixture.assetId as AssetId,
    studyInstanceUID: fixture.studyInstanceUID as StudyInstanceUID,
    seriesInstanceUID: fixture.seriesInstanceUID as SeriesInstanceUID,
    sourceLocator: { kind: 'local-folder', path: `fixtures/volumes/${fixture.assetId}/instances` },
    sourceFingerprint: {
      studyInstanceUID: fixture.studyInstanceUID as StudyInstanceUID,
      seriesInstanceUID: fixture.seriesInstanceUID as SeriesInstanceUID,
      instanceCount: fixture.instanceCount,
      contentDigest: geometricDigest,
      geometricDigest,
    },
    modality: fixture.modality as Modality,
    kind: fixture.kind as AssetKind,
    geometry,
    frameOfReferenceUID: fixture.frameOfReferenceUID as FrameOfReferenceUID,
    metadata: {
      instanceCount: fixture.instanceCount,
      rescaleSlope: pixel.rescale?.slope ?? 1,
      rescaleIntercept: pixel.rescale?.intercept ?? 0,
    },
    valueSemantics: valueSemanticsFor(pixel.scalarDataDomain),
  };
}

export function requireComputed(evidence: unknown): WorkerGeometryComputed {
  const mapped = mapGeometryResult(evidence);
  if (mapped.status !== 'computed') {
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.evidenceUnavailable,
      `fixture geometry evidence is '${mapped.status}', not 'computed'`,
    );
  }
  return mapped;
}
