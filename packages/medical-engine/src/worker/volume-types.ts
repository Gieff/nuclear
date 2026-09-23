/**
 * @nuclear/medical-engine — ADR-013 volume-transport bridge contracts.
 *
 * Type-only vocabulary for the worker-owned `nuclear.dicom.volume` transport:
 * the additive handshake capability, the caller-declared hydration request
 * (asset fingerprint + accepted geometry context) and the typed descriptor the
 * worker publishes. No pixels, no paths and no scientific formula live here;
 * the worker owns DICOM decode and the bridge only carries declared facts.
 */

import type {
  FrameOfReferenceUID,
  SeriesInstanceUID,
  SourceFingerprint,
  SourceLocator,
} from '@nuclear/shared-types';
import type { VolumeScalarArray } from '../renderer/volume-types.js';

/** Declared element types accepted by the v1 scalar payload (ADR-013 §3). */
export type WorkerVolumeScalarDataType =
  | 'int8'
  | 'uint8'
  | 'int16'
  | 'uint16'
  | 'float32';

/** Declared signedness; `not-applicable` is used by `float32`. */
export type WorkerVolumeSignedness = 'signed' | 'unsigned' | 'not-applicable';

/** Declared interpretation of the decoded scalar values (ADR-013 OD-F). */
export type WorkerVolumeScalarDataDomain =
  | 'stored-values'
  | 'rescaled-hu'
  | 'rescaled-bqml';

/** Linear rescale the worker applied to the source stored values. */
export interface WorkerVolumeRescale {
  readonly slope: number;
  readonly intercept: number;
}

/**
 * Additive handshake block `capabilities.volumeTransport` (ADR-013 §2).
 * Absent for workers that predate the transport; never fabricated.
 */
export interface WorkerVolumeTransportCapability {
  readonly root: string;
  readonly handleTtlSeconds: number;
  readonly maxResidentPayloads: number;
  readonly maxPayloadBytes: number;
}

/**
 * The exact caller-declared expectation the worker verifies before publishing a
 * payload: the asset's `SourceFingerprint` plus the accepted worker geometry
 * digest (ADR-013 §5). Optional `SourceFingerprint` fields are carried verbatim
 * so the worker fails closed on any field it cannot verify.
 */
export type WorkerVolumeExpectedFingerprint = SourceFingerprint & {
  readonly geometricDigest: string;
};

/** Observed source/series/FoR correlation returned by the worker. */
export interface WorkerVolumeCorrelation {
  readonly studyInstanceUID: string;
  readonly seriesInstanceUID: string;
  readonly instanceCount: number;
  readonly contentDigest: string;
  readonly geometricDigest: string;
  /**
   * Worker-observed SOP Instance UID set digest (ADR-013 §5, 2026-09-23),
   * always present. It is an observation, never computed, normalized or inferred
   * by TypeScript; the bridge only validates its `sha256:<64 lowercase hex>`
   * shape and compares it when the expected fingerprint supplies one.
   */
  readonly sopInstanceUIDsHash: string;
  readonly totalBytes?: number;
  readonly frameOfReferenceUID: string;
}

/** Validated `nuclear.dicom.volume` transport descriptor (ADR-013 §3/§5). */
export interface WorkerVolumeDescriptor {
  readonly handle: string;
  readonly fileName: string;
  readonly byteOrder: 'little';
  readonly dtype: WorkerVolumeScalarDataType;
  readonly signedness: WorkerVolumeSignedness;
  readonly samplesPerPixel: number;
  readonly bitsAllocated: number;
  readonly bitsStored: number;
  readonly highBit: number;
  readonly photometricInterpretation: string;
  readonly scalarDataDomain: WorkerVolumeScalarDataDomain;
  readonly rescale?: WorkerVolumeRescale;
  readonly dimensions: readonly [number, number, number];
  readonly byteLength: number;
  readonly contentHash: string;
  readonly geometricDigest: string;
  /**
   * ISO-8601 UTC instant at which the worker published the payload; the TTL
   * clock starts here, not at bridge receipt (ADR-013 §7).
   */
  readonly publishedAt: string;
  readonly ttlSeconds: number;
  readonly correlation: WorkerVolumeCorrelation;
}

/**
 * Bridge-side validation context derived from the registered asset and the
 * accepted worker geometry. These facts are bridge-only; they are not sent to
 * the worker, which independently recomputes and verifies them.
 */
export interface WorkerVolumeValidationContext {
  readonly seriesInstanceUID: SeriesInstanceUID;
  readonly expectedFingerprint: WorkerVolumeExpectedFingerprint;
  readonly expectedFrameOfReferenceUID: FrameOfReferenceUID;
  readonly expectedDimensions: readonly [number, number, number];
  readonly expectedGeometricDigest: string;
  readonly expectedRescale: WorkerVolumeRescale;
}

/** Caller-declared `nuclear.dicom.volume` hydration request. */
export interface WorkerVolumeHydrationRequest extends WorkerVolumeValidationContext {
  readonly locator: SourceLocator;
}

/** A hydrated payload: the validated descriptor plus its decoded scalar array. */
export interface WorkerHydratedVolume {
  readonly descriptor: WorkerVolumeDescriptor;
  readonly scalarData: VolumeScalarArray;
}
