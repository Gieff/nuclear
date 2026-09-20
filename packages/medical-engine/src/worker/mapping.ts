/**
 * @nuclear/medical-engine — inspection and geometry result mappers.
 *
 * Pure translations from worker JSON to typed NuClear contracts. No
 * arithmetic, DICOM interpretation or scientific formula is performed:
 * numeric values are copied verbatim and missing evidence fails closed.
 */

import type {
  AssetGeometry,
  FrameOfReferenceUID,
  Modality,
  SeriesInstanceUID,
  StudyInstanceUID,
  StudySeriesReference,
} from '@nuclear/shared-types';
import { WorkerContractError } from './errors.js';
import {
  asArray,
  asBoolean,
  asNumber,
  asNumberOrNull,
  asRecord,
  asString,
  asStringOrNull,
  bounds,
  six,
  stringArray,
  triple,
} from './narrowing.js';
import { mapDiagnostics, mapWorkerMetadata } from './protocol.js';
import type {
  WorkerGeometryResult,
  WorkerInspectionResult,
  WorkerSeriesInspection,
  WorkerStudyInspection,
} from './types.js';

/**
 * Every member of the shared-types `Modality` union, keyed so that adding or
 * removing a union member becomes a compile-time error here instead of a
 * silent runtime gap. `shared-types` is a zero-runtime leaf, so the runtime
 * vocabulary check has to live in the engine; this record cannot drift from
 * the contract without breaking `npm run typecheck`.
 */
const MODALITY_SET: Readonly<Record<Modality, true>> = {
  CT: true,
  PT: true,
  MR: true,
  NM: true,
  CR: true,
  DX: true,
  SC: true,
  OT: true,
};

function requireModality(value: string, where: string): Modality {
  if (!Object.prototype.hasOwnProperty.call(MODALITY_SET, value)) {
    throw new WorkerContractError(`${where} '${value}' is not a NuClear Modality.`);
  }
  return value as Modality;
}

function mapSeriesInspection(value: unknown, where: string): WorkerSeriesInspection {
  const record = asRecord(value, where);
  return {
    seriesInstanceUID: asString(
      record.seriesInstanceUID,
      `${where}.seriesInstanceUID`,
    ) as SeriesInstanceUID,
    seriesNumber: asNumberOrNull(record.seriesNumber, `${where}.seriesNumber`),
    modality: asString(record.modality, `${where}.modality`),
    classification: asString(record.classification, `${where}.classification`),
    supported: asBoolean(record.supported, `${where}.supported`),
    instanceCount: asNumber(record.instanceCount, `${where}.instanceCount`),
    reason: asStringOrNull(record.reason, `${where}.reason`),
  };
}

function mapStudyInspection(value: unknown, where: string): WorkerStudyInspection {
  const record = asRecord(value, where);
  return {
    studyInstanceUID: asString(
      record.studyInstanceUID,
      `${where}.studyInstanceUID`,
    ) as StudyInstanceUID,
    modalities: stringArray(record.modalities, `${where}.modalities`),
    series: asArray(record.series, `${where}.series`).map((entry, index) =>
      mapSeriesInspection(entry, `${where}.series[${index}]`),
    ),
  };
}

/** Map `nuclear.dicom.inspect` including its worker provenance. */
export function mapInspectionResult(value: unknown): WorkerInspectionResult {
  const record = asRecord(value, 'inspect result');
  return {
    studies: asArray(record.studies, 'inspect.studies').map((study, index) =>
      mapStudyInspection(study, `inspect.studies[${index}]`),
    ),
    diagnostics: mapDiagnostics(record.diagnostics, 'inspect.diagnostics'),
    skippedFileCount: asNumber(record.skippedFileCount, 'inspect.skippedFileCount'),
    workerMetadata: mapWorkerMetadata(record.workerMetadata),
  };
}

/** Project one worker series entry onto the persistent Phase 1 contract. */
export function toStudySeriesReference(entry: WorkerSeriesInspection): StudySeriesReference {
  return {
    seriesInstanceUID: entry.seriesInstanceUID,
    ...(entry.seriesNumber === null ? {} : { seriesNumber: entry.seriesNumber }),
    modality: requireModality(entry.modality, 'series.modality'),
    numberOfInstances: entry.instanceCount,
  };
}

/** Map `nuclear.dicom.geometry` onto a discriminated typed result. */
export function mapGeometryResult(value: unknown): WorkerGeometryResult {
  const record = asRecord(value, 'geometry result');
  const status = asString(record.status, 'geometry.status');
  const seriesInstanceUID = asString(
    record.seriesInstanceUID,
    'geometry.seriesInstanceUID',
  ) as SeriesInstanceUID;
  const diagnostics = mapDiagnostics(record.diagnostics, 'geometry.diagnostics');
  const workerMetadata = mapWorkerMetadata(record.workerMetadata);

  if (status === 'computed') {
    const geometry = asRecord(record.geometry, 'geometry.geometry');
    const assetGeometry: AssetGeometry = {
      frameOfReferenceUID: asString(
        geometry.frameOfReferenceUID,
        'geometry.frameOfReferenceUID',
      ) as FrameOfReferenceUID,
      dimensions: triple(geometry.dimensions, 'geometry.dimensions'),
      spacing: triple(geometry.spacing, 'geometry.spacing'),
      origin: triple(geometry.origin, 'geometry.origin'),
      direction: six(geometry.direction, 'geometry.direction'),
      bounds: bounds(geometry.bounds, 'geometry.bounds'),
    };
    return {
      status: 'computed',
      seriesInstanceUID,
      studyInstanceUID: asString(
        record.studyInstanceUID,
        'geometry.studyInstanceUID',
      ) as StudyInstanceUID,
      modality: asString(record.modality, 'geometry.modality'),
      instanceCount: asNumber(record.instanceCount, 'geometry.instanceCount'),
      assetGeometry,
      geometricDigest: asString(geometry.geometricDigest, 'geometry.geometricDigest'),
      sliceNormal: triple(geometry.sliceNormal, 'geometry.sliceNormal'),
      slicePositionsLpsMm: asArray(
        geometry.slicePositionsLpsMm,
        'geometry.slicePositionsLpsMm',
      ).map((position, index) =>
        triple(position, `geometry.slicePositionsLpsMm[${index}]`),
      ),
      diagnostics,
      workerMetadata,
    };
  }
  if (status === 'rejected') {
    return {
      status: 'rejected',
      seriesInstanceUID,
      studyInstanceUID: asString(
        record.studyInstanceUID,
        'geometry.studyInstanceUID',
      ) as StudyInstanceUID,
      reason: asString(record.reason, 'geometry.reason'),
      diagnostics,
      workerMetadata,
    };
  }
  if (status === 'unavailable') {
    return {
      status: 'unavailable',
      seriesInstanceUID,
      reason: asString(record.reason, 'geometry.reason'),
      diagnostics,
      workerMetadata,
    };
  }
  throw new WorkerContractError(`Unsupported geometry status '${status}'.`);
}
