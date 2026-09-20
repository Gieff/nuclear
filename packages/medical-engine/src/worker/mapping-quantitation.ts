/**
 * @nuclear/medical-engine — PET quantitation result mapper.
 *
 * Maps the `nuclear.quantitation.suvbw` payload to `PetQuantitationResult` and
 * the exact present-key PET acquisition inputs. No missing DICOM attribute is
 * ever fabricated and no SUV factor is recomputed.
 */

import type {
  PetAcquisitionMetadata,
  PetQuantitationResult,
  SeriesInstanceUID,
  StudyInstanceUID,
} from '@nuclear/shared-types';
import { WorkerContractError } from './errors.js';
import { asNumber, asNumberOrNull, asRecord, asString, asStringOrNull } from './narrowing.js';
import { mapDiagnostics, mapWorkerMetadata } from './protocol.js';
import type {
  WorkerPartialPetAcquisition,
  WorkerPetQuantitationResult,
} from './types.js';

const STRING_INPUT_KEYS = [
  'units',
  'decayCorrection',
  'radiopharmaceuticalStartDateTime',
  'acquisitionDateTime',
] as const;

const NUMBER_INPUT_KEYS = [
  'radionuclideHalfLifeSeconds',
  'radionuclideTotalDoseBq',
  'patientWeightKg',
] as const;

function mapPartialPetAcquisition(value: unknown): WorkerPartialPetAcquisition {
  const record = asRecord(value, 'quantitation.petAcquisition');
  const acquisition: Record<string, string | number> = {};
  for (const key of STRING_INPUT_KEYS) {
    if (record[key] !== undefined) {
      acquisition[key] = asString(record[key], `petAcquisition.${key}`);
    }
  }
  for (const key of NUMBER_INPUT_KEYS) {
    if (record[key] !== undefined) {
      acquisition[key] = asNumber(record[key], `petAcquisition.${key}`);
    }
  }
  return acquisition as WorkerPartialPetAcquisition;
}

function toPetAcquisitionMetadata(
  acquisition: WorkerPartialPetAcquisition,
): PetAcquisitionMetadata | null {
  if (
    acquisition.units === undefined ||
    acquisition.decayCorrection === undefined ||
    acquisition.radionuclideHalfLifeSeconds === undefined ||
    acquisition.radionuclideTotalDoseBq === undefined ||
    acquisition.radiopharmaceuticalStartDateTime === undefined ||
    acquisition.acquisitionDateTime === undefined ||
    acquisition.patientWeightKg === undefined
  ) {
    return null;
  }
  return {
    units: acquisition.units,
    decayCorrection: acquisition.decayCorrection,
    radionuclideHalfLifeSeconds: acquisition.radionuclideHalfLifeSeconds,
    radionuclideTotalDoseBq: acquisition.radionuclideTotalDoseBq,
    radiopharmaceuticalStartDateTime: acquisition.radiopharmaceuticalStartDateTime,
    acquisitionDateTime: acquisition.acquisitionDateTime,
    patientWeightKg: acquisition.patientWeightKg,
  };
}

/** Map `nuclear.quantitation.suvbw` preserving the exact present-key inputs. */
export function mapQuantitationResult(value: unknown): WorkerPetQuantitationResult {
  const record = asRecord(value, 'quantitation result');
  const method = asString(record.method, 'quantitation.method');
  if (method !== 'suv-bw') {
    throw new WorkerContractError(`Unsupported quantitation method '${method}'.`);
  }
  const status = asString(record.status, 'quantitation.status');
  if (status !== 'computed' && status !== 'invalid' && status !== 'unavailable') {
    throw new WorkerContractError(`Unsupported quantitation status '${status}'.`);
  }
  const workerMetadata = mapWorkerMetadata(record.workerMetadata);
  const suvFactor = asNumberOrNull(record.suvFactor, 'quantitation.suvFactor');
  if (status === 'computed' && suvFactor === null) {
    throw new WorkerContractError(
      "A 'computed' quantitation result must carry a numeric 'suvFactor'.",
    );
  }
  if (status !== 'computed' && suvFactor !== null) {
    throw new WorkerContractError(
      `A '${status}' quantitation result must not carry 'suvFactor'.`,
    );
  }
  const diagnostic = asStringOrNull(record.diagnostic, 'quantitation.diagnostic');
  const quantitation: PetQuantitationResult = {
    method,
    status,
    ...(suvFactor === null ? {} : { suvFactor }),
    ...(diagnostic === null ? {} : { diagnostic }),
    workerMetadata,
  };
  const petAcquisition = mapPartialPetAcquisition(record.petAcquisition);
  return {
    quantitation,
    seriesInstanceUID: asString(
      record.seriesInstanceUID,
      'quantitation.seriesInstanceUID',
    ) as SeriesInstanceUID,
    studyInstanceUID: asStringOrNull(
      record.studyInstanceUID,
      'quantitation.studyInstanceUID',
    ) as StudyInstanceUID | null,
    petAcquisition,
    petAcquisitionMetadata: toPetAcquisitionMetadata(petAcquisition),
    elapsedSeconds: asNumberOrNull(record.elapsedSeconds, 'quantitation.elapsedSeconds'),
    decayedDoseBq: asNumberOrNull(record.decayedDoseBq, 'quantitation.decayedDoseBq'),
    diagnostics: mapDiagnostics(record.diagnostics, 'quantitation.diagnostics'),
  };
}
