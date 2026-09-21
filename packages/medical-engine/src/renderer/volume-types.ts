/**
 * @nuclear/medical-engine — P3.2 volume ingestion contracts (Node-safe).
 *
 * Type-only module shared by `volume.ts` (pure planning) and the Cornerstone
 * adapter. It carries no runtime code and no `@cornerstonejs/core` import.
 */

import type {
  AssetAvailabilityStatus,
  AssetId,
  FrameOfReferenceUID,
  ImagingAsset,
  Point3D,
  SeriesInstanceUID,
} from '@nuclear/shared-types';
import type { WorkerGeometryResult } from '../worker/types.js';

/** Physical interpretation of the decoded scalar-data array. */
export type ScalarDataDomain = 'stored-values' | 'rescaled-hu' | 'rescaled-bqml';

/**
 * Typed arrays accepted as local-volume scalar data.
 *
 * Restricted to exactly the five constructors `@cornerstonejs/core@5.10.7`
 * `volumeLoader.createLocalVolume` can derive a `byteLength` for; an Int32Array,
 * Uint32Array or Float64Array reaches the cache with an undefined `byteLength`
 * and fails with a raw error instead of a typed refusal (P3.2.1).
 */
export type VolumeScalarArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Float32Array;

/** Declared element type of the payload (never inferred from a path or range). */
export type VolumeScalarDataType = 'int8' | 'uint8' | 'int16' | 'uint16' | 'float32';

/** Declared signedness of the payload. `not-applicable` is used by float types. */
export type VolumeSignedness = 'signed' | 'unsigned' | 'not-applicable';

/** Declared linear rescale applied to the source stored values. */
export interface VolumeRescale {
  readonly slope: number;
  readonly intercept: number;
}

export type VolumeDimensions = readonly [number, number, number];
export type VolumeDirection = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Declared pixel payload consumed verbatim by the ingestion plan. */
export interface VolumePixelPayload {
  readonly dtype: VolumeScalarDataType;
  readonly signedness: VolumeSignedness;
  readonly samplesPerPixel: number;
  readonly bitsAllocated: number;
  readonly bitsStored: number;
  readonly highBit: number;
  readonly photometricInterpretation: string;
  readonly scalarDataDomain: ScalarDataDomain;
  readonly rescale?: VolumeRescale;
  readonly dimensions: VolumeDimensions;
  readonly scalarData: VolumeScalarArray;
}

/** One Cornerstone VOI LUT entry. NuClear never fabricates these values. */
export interface RendererVolumeVoiLut {
  windowWidth: number;
  windowCenter: number;
}

/**
 * NuClear-owned, Cornerstone-shaped pixel-format metadata block.
 *
 * Field names match Cornerstone's `Metadata` contract so the adapter can hand
 * the block to `createLocalVolume` unchanged, while `volume.ts` stays free of
 * any Cornerstone import. `voiLut` is empty and `VOILUTFunction` is the
 * Cornerstone default selector: P3.2 must not invent CT/PET window/level values
 * (Phase 3 invariant 7; those require a declared, tested preset).
 */
export interface RendererVolumeMetadata {
  readonly BitsAllocated: number;
  readonly BitsStored: number;
  readonly HighBit: number;
  readonly SamplesPerPixel: number;
  readonly PhotometricInterpretation: string;
  readonly PixelRepresentation: 0 | 1;
  readonly Modality: string;
  readonly SeriesInstanceUID?: string;
  readonly ImageOrientationPatient: number[];
  readonly PixelSpacing: number[];
  readonly FrameOfReferenceUID: string;
  readonly Columns: number;
  readonly Rows: number;
  readonly voiLut: RendererVolumeVoiLut[];
  readonly VOILUTFunction: string;
}

/** Worker series classification carried into the ingestion request. */
export interface VolumeIngestionClassification {
  readonly supported: boolean;
  readonly modality: string;
  readonly reason?: string | null;
}

export interface VolumeIngestionRequest {
  readonly asset: ImagingAsset;
  readonly availability: AssetAvailabilityStatus;
  readonly classification: VolumeIngestionClassification;
  readonly geometryEvidence: WorkerGeometryResult;
  readonly pixels: VolumePixelPayload;
}

export interface VolumeIngestionProvenance {
  readonly geometricDigest: string;
  readonly workerModality: string;
}

export interface VolumeIngestionPlan {
  readonly volumeId: string;
  readonly assetId: AssetId;
  readonly seriesInstanceUID: SeriesInstanceUID;
  readonly frameOfReferenceUID: FrameOfReferenceUID;
  readonly dimensions: VolumeDimensions;
  readonly spacing: VolumeDimensions;
  readonly origin: Point3D;
  readonly direction: VolumeDirection;
  readonly scalarDataDomain: ScalarDataDomain;
  readonly scalarData: VolumeScalarArray;
  readonly metadata: RendererVolumeMetadata;
  readonly provenance: VolumeIngestionProvenance;
}

/** Serializable descriptor of a volume registered in Cornerstone's cache. */
export interface LoadedVolume {
  readonly volumeId: string;
  readonly dimensions: VolumeDimensions;
  readonly spacing: VolumeDimensions;
  readonly origin: Point3D;
  readonly direction: VolumeDirection;
  readonly scalarDataDomain: ScalarDataDomain;
  readonly scalarLength: number;
}
