/**
 * @nuclear/medical-engine — P3.2.1 fixture payload validation (Node-safe).
 *
 * Pure, fail-closed validation of a declared fixture pixel payload against the
 * accepted worker geometry and the asset's `valueSemantics`. Cornerstone's
 * `createLocalVolume` derives the volume's byte length from the scalar array
 * constructor and only understands five typed arrays, so an incoherent or
 * unsupported payload must be refused before it reaches the cache with an
 * undefined byte length.
 *
 * This module never imports `@cornerstonejs/core`, never parses DICOM, performs
 * no clinical conversion and never infers a format from a path or a value range
 * (ADR-004). The declared-domain ↔ `valueSemantics` mapping below is the
 * fixture-only coherence rule; it is not a radiometric conversion.
 */

import type { ImagingAsset, ValueSemanticsType } from '@nuclear/shared-types';
import type { WorkerGeometryComputed } from '../worker/types.js';
import { VOLUME_INGESTION_ERROR_CODES, VolumeIngestionError } from './volume-errors.js';
import type {
  ScalarDataDomain,
  VolumePixelPayload,
  VolumeScalarDataType,
  VolumeSignedness,
} from './volume-types.js';

/** Exactly the scalar element types Cornerstone 5.10.7 can construct locally. */
const SUPPORTED_SCALAR_DATA_TYPES: readonly VolumeScalarDataType[] = [
  'int8',
  'uint8',
  'int16',
  'uint16',
  'float32',
];

/** Declared width in bits of each scalar element type. */
const SCALAR_DATA_BITS: Readonly<Record<VolumeScalarDataType, number>> = {
  int8: 8,
  uint8: 8,
  int16: 16,
  uint16: 16,
  float32: 32,
};

/** Signedness each declared scalar element type must declare. */
const SCALAR_DATA_SIGNEDNESS: Readonly<Record<VolumeScalarDataType, VolumeSignedness>> = {
  int8: 'signed',
  int16: 'signed',
  uint8: 'unsigned',
  uint16: 'unsigned',
  float32: 'not-applicable',
};

/** DICOM `BitsAllocated` widths that a supported payload may declare. */
const SUPPORTED_ALLOCATED_BITS: readonly number[] = [8, 16, 32];

/** Fixture-only coherence: declared scalar domain → allowed `valueSemantics`. */
const DOMAIN_VALUE_SEMANTICS: Readonly<
  Record<ScalarDataDomain, { readonly types: readonly ValueSemanticsType[]; readonly unit?: string }>
> = {
  'rescaled-hu': { types: ['hounsfield'], unit: 'HU' },
  'rescaled-bqml': { types: ['activity-concentration'], unit: 'Bq/mL' },
  'stored-values': { types: ['raw-counts', 'generic-intensity'] },
};

/** The runtime constructor each declared scalar type must actually carry. */
function declaredConstructor(dtype: VolumeScalarDataType): Function | undefined {
  switch (dtype) {
    case 'int8':
      return Int8Array;
    case 'uint8':
      return Uint8Array;
    case 'int16':
      return Int16Array;
    case 'uint16':
      return Uint16Array;
    case 'float32':
      return Float32Array;
    default:
      return undefined;
  }
}

function refusePayload(evidence: WorkerGeometryComputed, field: string, detail: string): never {
  throw new VolumeIngestionError(
    VOLUME_INGESTION_ERROR_CODES.payloadInvalid,
    `Refusing volume for series '${evidence.seriesInstanceUID}': pixel payload field '${field}' is invalid — ${detail}. Correct the fixture descriptor; no payload is sent to Cornerstone until it is coherent.`,
  );
}

/**
 * Fail-closed payload validation, invoked after every geometry check.
 *
 * Bit-layout rule (P3.2.1): `BitsAllocated`/`BitsStored`/`HighBit` describe the
 * *stored* pixel encoding. When `scalarDataDomain === 'stored-values'` the
 * scalar array is that stored encoding, so `bitsAllocated` must equal the
 * declared element width. For `rescaled-hu`/`rescaled-bqml` the scalar array is
 * a derived representation; a rescaled `float32` may therefore carry the
 * narrower source layout (the committed PT fixture is source 16-bit), but the
 * declared layout must still be a supported, structurally coherent width.
 */
export function validatePixelPayload(
  pixels: VolumePixelPayload,
  evidence: WorkerGeometryComputed,
): void {
  if (pixels.samplesPerPixel !== 1) {
    refusePayload(
      evidence,
      'samplesPerPixel',
      `expected 1 (single-component volume), received ${pixels.samplesPerPixel}`,
    );
  }

  if (!SUPPORTED_SCALAR_DATA_TYPES.includes(pixels.dtype)) {
    refusePayload(
      evidence,
      'dtype',
      `'${String(pixels.dtype)}' is not one of ${SUPPORTED_SCALAR_DATA_TYPES.join(', ')}; Cornerstone 5.10.7 cannot derive a byte length for it`,
    );
  }
  if (pixels.scalarData.constructor !== declaredConstructor(pixels.dtype)) {
    refusePayload(
      evidence,
      'scalarData',
      `the actual ${pixels.scalarData.constructor.name} does not match declared dtype '${pixels.dtype}' (expected ${declaredConstructor(pixels.dtype)?.name ?? 'a supported typed array'})`,
    );
  }

  const requiredSignedness = SCALAR_DATA_SIGNEDNESS[pixels.dtype];
  if (pixels.signedness !== requiredSignedness) {
    refusePayload(
      evidence,
      'signedness',
      `dtype '${pixels.dtype}' requires signedness '${requiredSignedness}', received '${pixels.signedness}'`,
    );
  }

  const declaredWidth = SCALAR_DATA_BITS[pixels.dtype];
  const rescaledFloat =
    pixels.dtype === 'float32' && pixels.scalarDataDomain !== 'stored-values';
  if (pixels.bitsAllocated !== declaredWidth) {
    if (!rescaledFloat) {
      refusePayload(
        evidence,
        'bitsAllocated',
        `dtype '${pixels.dtype}' requires ${declaredWidth}, received ${pixels.bitsAllocated}`,
      );
    }
    if (!SUPPORTED_ALLOCATED_BITS.includes(pixels.bitsAllocated)) {
      refusePayload(
        evidence,
        'bitsAllocated',
        `rescaled '${pixels.dtype}' source layout must be one of ${SUPPORTED_ALLOCATED_BITS.join(', ')}, received ${pixels.bitsAllocated}`,
      );
    }
  }
  if (!Number.isSafeInteger(pixels.bitsStored) || pixels.bitsStored < 1 || pixels.bitsStored > pixels.bitsAllocated) {
    refusePayload(
      evidence,
      'bitsStored',
      `expected 1 <= bitsStored <= bitsAllocated (${pixels.bitsAllocated}), received ${pixels.bitsStored}`,
    );
  }
  if (pixels.highBit !== pixels.bitsStored - 1) {
    refusePayload(
      evidence,
      'highBit',
      `must equal bitsStored - 1 (${pixels.bitsStored - 1}), received ${pixels.highBit}`,
    );
  }

  if (
    typeof pixels.photometricInterpretation !== 'string' ||
    pixels.photometricInterpretation.length === 0
  ) {
    refusePayload(
      evidence,
      'photometricInterpretation',
      `must be a non-empty string, received ${JSON.stringify(pixels.photometricInterpretation)}`,
    );
  }

  const [columns, rows, slices] = evidence.assetGeometry.dimensions;
  const expectedLength = columns * rows * slices;
  const [nx, ny, nz] = pixels.dimensions;
  const dimensionsAreIntegers =
    pixels.dimensions.length === 3 &&
    [nx, ny, nz].every((value) => Number.isSafeInteger(value) && value > 0);
  if (!dimensionsAreIntegers) {
    refusePayload(
      evidence,
      'dimensions',
      `expected three positive safe integers, received [${[...pixels.dimensions].join(', ')}]`,
    );
  }
  if (nx !== columns || ny !== rows || nz !== slices) {
    refusePayload(
      evidence,
      'dimensions',
      `[${nx}, ${ny}, ${nz}] disagrees with the verified worker grid [${columns}, ${rows}, ${slices}]`,
    );
  }
  if (pixels.scalarData.length !== expectedLength) {
    refusePayload(
      evidence,
      'scalarData.length',
      `${pixels.scalarData.length} does not equal the verified grid voxel count ${expectedLength} (${columns}*${rows}*${slices})`,
    );
  }

  if (pixels.dtype === 'float32') {
    const scalarData = pixels.scalarData;
    for (let index = 0; index < scalarData.length; index += 1) {
      if (!Number.isFinite(scalarData[index])) {
        refusePayload(
          evidence,
          'scalarData',
          `float32 voxel ${index} is not finite (${String(scalarData[index])}); Cornerstone cannot render NaN/Infinity`,
        );
      }
    }
  }
}

/**
 * Fixture-only coherence between the declared scalar domain and the asset's
 * `valueSemantics`. No clinical conversion is performed; this only refuses a
 * descriptor whose declared domain contradicts the asset's declared meaning.
 */
export function validateScalarSemantics(
  asset: ImagingAsset,
  pixels: VolumePixelPayload,
): void {
  const rule = DOMAIN_VALUE_SEMANTICS[pixels.scalarDataDomain];
  const semantics = asset.valueSemantics;
  if (rule === undefined || !rule.types.includes(semantics.type)) {
    const expected = rule === undefined ? '(no declared domain rule)' : rule.types.map((type) => `'${type}'`).join(' or ');
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.scalarSemanticsDisagreement,
      `Refusing volume '${asset.id}': declared scalar domain '${pixels.scalarDataDomain}' requires value semantics type ${expected}, but the asset declares '${semantics.type}'. Align the fixture descriptor with the asset's declared value semantics.`,
    );
  }
  if (rule.unit !== undefined && semantics.unit.length > 0 && semantics.unit !== rule.unit) {
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.scalarSemanticsDisagreement,
      `Refusing volume '${asset.id}': declared scalar domain '${pixels.scalarDataDomain}' requires unit '${rule.unit}', but the asset declares '${semantics.unit}'. Align the fixture descriptor with the asset's declared value semantics.`,
    );
  }
}
