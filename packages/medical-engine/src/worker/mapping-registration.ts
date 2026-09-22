/**
 * @nuclear/medical-engine — `nuclear.registration` request/evidence mappers.
 *
 * Pure translations between the typed bridge contract and the worker JSON. No
 * arithmetic and no fabricated transform: the caller-declared `transformId` and
 * `outOfDomainBehavior` are serialized verbatim, and the worker success
 * evidence is validated fail-closed. Missing or malformed fields raise a
 * {@link WorkerContractError}; nothing is defaulted.
 */

import type {
  FrameOfReferenceUID,
  OutOfDomainBehavior,
  SpatialTransform,
  TransformId,
  TransformMethod,
  TransformProvenance,
  TransformType,
  TransformValidity,
} from '@nuclear/shared-types';
import { WorkerContractError } from './errors.js';
import { asBoolean, asNumber, asRecord, asString, matrix4x4 } from './narrowing.js';
import { mapWorkerMetadata } from './protocol.js';
import { requireSemanticEvidence } from './registration-evidence.js';
import type {
  WorkerRegistrationRequest,
  WorkerRegistrationResult,
} from './registration-types.js';

/**
 * Runtime vocabulary mirrors of the shared-types unions. `shared-types` is a
 * zero-runtime leaf, so the check lives here; adding a union member breaks
 * `npm run typecheck` until this record is updated.
 */
const TRANSFORM_TYPE_SET: Readonly<Record<TransformType, true>> = {
  identity: true,
  rigid: true,
  affine: true,
};

const TRANSFORM_METHOD_SET: Readonly<Record<TransformMethod, true>> = {
  'dicom-registration': true,
  'rigid-coregistration': true,
  'manual-alignment': true,
  identity: true,
};

const OUT_OF_DOMAIN_SET: Readonly<Record<OutOfDomainBehavior, true>> = {
  clamp: true,
  hide: true,
  warn: true,
};

/**
 * ISO-8601 instant, mirroring the Python validator
 * (`dicom.registration_validation`): `YYYY-MM-DDTHH:MM:SS`, optional fraction,
 * then `Z` or `±HH:MM`. Provenance completeness is required fail-closed even
 * though `shared-types` marks the fields optional.
 */
const ISO8601_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function requireNonEmptyString(value: string, where: string): string {
  if (value === '') {
    throw new WorkerContractError(`${where} must be a non-empty string.`);
  }
  return value;
}

function requireTransformType(value: string, where: string): TransformType {
  if (!Object.prototype.hasOwnProperty.call(TRANSFORM_TYPE_SET, value)) {
    throw new WorkerContractError(`${where} '${value}' is not a NuClear TransformType.`);
  }
  return value as TransformType;
}

function requireTransformMethod(value: string, where: string): TransformMethod {
  if (!Object.prototype.hasOwnProperty.call(TRANSFORM_METHOD_SET, value)) {
    throw new WorkerContractError(`${where} '${value}' is not a NuClear TransformMethod.`);
  }
  return value as TransformMethod;
}

function requireOutOfDomain(value: string, where: string): OutOfDomainBehavior {
  if (!Object.prototype.hasOwnProperty.call(OUT_OF_DOMAIN_SET, value)) {
    throw new WorkerContractError(`${where} '${value}' is not a NuClear OutOfDomainBehavior.`);
  }
  return value as OutOfDomainBehavior;
}

function requireMillimetres(value: unknown): 'mm' {
  const units = asString(value, 'registration.transform.units');
  if (units !== 'mm') {
    throw new WorkerContractError(
      `registration.transform.units '${units}' is not the required 'mm'.`,
    );
  }
  return 'mm';
}

function mapProvenance(value: unknown): TransformProvenance {
  const record = asRecord(value, 'registration.provenance');
  const method = requireTransformMethod(
    asString(record.method, 'registration.provenance.method'),
    'registration.provenance.method',
  );
  const provenance: {
    method: TransformMethod;
    workerVersion: string;
    timestamp: string;
    description?: string;
  } = {
    method,
    workerVersion: requireNonEmptyString(
      asString(record.workerVersion, 'registration.provenance.workerVersion'),
      'registration.provenance.workerVersion',
    ),
    timestamp: asString(record.timestamp, 'registration.provenance.timestamp'),
  };
  if (!ISO8601_INSTANT.test(provenance.timestamp)) {
    throw new WorkerContractError(
      'registration.provenance.timestamp must be an ISO-8601 instant.',
    );
  }
  if (record.description !== undefined) {
    provenance.description = asString(
      record.description,
      'registration.provenance.description',
    );
  }
  return provenance;
}

function mapValidity(value: unknown): TransformValidity {
  const record = asRecord(value, 'registration.validity');
  const validity: {
    isValid: boolean;
    outOfDomainBehavior: OutOfDomainBehavior;
    errorMarginMm?: number;
  } = {
    isValid: asBoolean(record.isValid, 'registration.validity.isValid'),
    outOfDomainBehavior: requireOutOfDomain(
      asString(record.outOfDomainBehavior, 'registration.validity.outOfDomainBehavior'),
      'registration.validity.outOfDomainBehavior',
    ),
  };
  if (record.errorMarginMm !== undefined) {
    validity.errorMarginMm = asNumber(
      record.errorMarginMm,
      'registration.validity.errorMarginMm',
    );
  }
  return validity;
}

/** Serialize the exact wire request schema for either registration mode. */
export function registrationRequestParams(
  request: WorkerRegistrationRequest,
): Readonly<Record<string, unknown>> {
  if (request.mode === 'rigid') {
    return {
      mode: request.mode,
      transformId: request.transformId,
      outOfDomainBehavior: request.outOfDomainBehavior,
      fixed: {
        locator: request.fixed.locator,
        seriesInstanceUID: request.fixed.seriesInstanceUID,
      },
      moving: {
        locator: request.moving.locator,
        seriesInstanceUID: request.moving.seriesInstanceUID,
      },
    };
  }
  return {
    mode: request.mode,
    transformId: request.transformId,
    outOfDomainBehavior: request.outOfDomainBehavior,
    sourceFrameOfReferenceUID: request.sourceFrameOfReferenceUID,
    targetFrameOfReferenceUID: request.targetFrameOfReferenceUID,
    landmarks: request.landmarks.map((pair) => ({
      source: pair.source,
      target: pair.target,
    })),
  };
}

/** Map `nuclear.registration` success evidence, failing closed on any gap. */
export function mapRegistrationResult(value: unknown): WorkerRegistrationResult {
  const record = asRecord(value, 'registration result');
  const raw = asRecord(record.transform, 'registration.transform');
  const transform: SpatialTransform = {
    id: asString(raw.id, 'registration.transform.id') as TransformId,
    sourceFrameOfReferenceUID: asString(
      raw.sourceFrameOfReferenceUID,
      'registration.transform.sourceFrameOfReferenceUID',
    ) as FrameOfReferenceUID,
    targetFrameOfReferenceUID: asString(
      raw.targetFrameOfReferenceUID,
      'registration.transform.targetFrameOfReferenceUID',
    ) as FrameOfReferenceUID,
    transformType: requireTransformType(
      asString(raw.transformType, 'registration.transform.transformType'),
      'registration.transform.transformType',
    ),
    matrix4x4: matrix4x4(raw.matrix4x4, 'registration.transform.matrix4x4'),
    units: requireMillimetres(raw.units),
    provenance: mapProvenance(raw.provenance),
    validity: mapValidity(raw.validity),
  };
  requireSemanticEvidence(transform);
  return { transform, workerMetadata: mapWorkerMetadata(record.workerMetadata) };
}
