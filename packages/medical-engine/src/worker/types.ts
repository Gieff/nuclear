/**
 * @nuclear/medical-engine — ScientificWorkerBridge public types.
 *
 * These contracts describe the TypeScript-side surface of the local Python
 * scientific worker transport (ADR-002). They carry no scientific formula:
 * the worker owns every DICOM, geometry and SUVbw computation.
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type {
  AssetGeometry,
  BoundingBox3D,
  PetAcquisitionMetadata,
  PetQuantitationResult,
  Point3D,
  ScientificWorkerMetadata,
  SeriesInstanceUID,
  SourceLocator,
  StudyInstanceUID,
  Vector3D,
} from '@nuclear/shared-types';
import type { WorkerVolumeTransportCapability } from './volume-types.js';

/** Supervisor lifecycle state of the bridge-managed worker process. */
export type WorkerAvailability =
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'restarting'
  | 'failed';

/** Structured, serializable diagnostic emitted by the worker. */
export interface WorkerDiagnostic {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
  readonly file: string | null;
}

/** Validated `nuclear.protocol.handshake` result. */
export interface WorkerHandshake {
  readonly protocolVersions: readonly string[];
  readonly operations: readonly string[];
  readonly workerMetadata: ScientificWorkerMetadata;
  /** Additive ADR-013 volume transport capability; absent on old workers. */
  readonly volumeTransport?: WorkerVolumeTransportCapability;
}

/** One inspected series with its worker-owned classification disposition. */
export interface WorkerSeriesInspection {
  readonly seriesInstanceUID: SeriesInstanceUID;
  readonly seriesNumber: number | null;
  readonly modality: string;
  readonly classification: string;
  readonly supported: boolean;
  readonly instanceCount: number;
  readonly reason: string | null;
}

/** One inspected study grouping all discovered series. */
export interface WorkerStudyInspection {
  readonly studyInstanceUID: StudyInstanceUID;
  readonly modalities: readonly string[];
  readonly series: readonly WorkerSeriesInspection[];
}

/** Mapped `nuclear.dicom.inspect` result including worker provenance. */
export interface WorkerInspectionResult {
  readonly studies: readonly WorkerStudyInspection[];
  readonly diagnostics: readonly WorkerDiagnostic[];
  readonly skippedFileCount: number;
  readonly workerMetadata: ScientificWorkerMetadata;
}

interface WorkerGeometryBase {
  readonly seriesInstanceUID: SeriesInstanceUID;
  readonly diagnostics: readonly WorkerDiagnostic[];
  readonly workerMetadata: ScientificWorkerMetadata;
}

/** `computed` geometry: the asset contract plus preserved raw evidence. */
export interface WorkerGeometryComputed extends WorkerGeometryBase {
  readonly status: 'computed';
  readonly studyInstanceUID: StudyInstanceUID;
  readonly modality: string;
  readonly instanceCount: number;
  readonly assetGeometry: AssetGeometry;
  readonly geometricDigest: string;
  readonly sliceNormal: Vector3D;
  readonly slicePositionsLpsMm: readonly Point3D[];
}

/** `rejected` geometry: a deterministic fail-closed disposition. */
export interface WorkerGeometryRejected extends WorkerGeometryBase {
  readonly status: 'rejected';
  readonly studyInstanceUID: StudyInstanceUID;
  readonly reason: string;
}

/** `unavailable` geometry: no matching series was found in the source. */
export interface WorkerGeometryUnavailable extends WorkerGeometryBase {
  readonly status: 'unavailable';
  readonly reason: string;
}

export type WorkerGeometryResult =
  | WorkerGeometryComputed
  | WorkerGeometryRejected
  | WorkerGeometryUnavailable;

/**
 * Present-key-only PET acquisition map. A key is absent when the worker did
 * not read the DICOM attribute; no missing value is ever fabricated here.
 */
export interface WorkerPartialPetAcquisition {
  readonly units?: string;
  readonly decayCorrection?: string;
  readonly radionuclideHalfLifeSeconds?: number;
  readonly radionuclideTotalDoseBq?: number;
  readonly radiopharmaceuticalStartDateTime?: string;
  readonly acquisitionDateTime?: string;
  readonly patientWeightKg?: number;
}

/** Mapped `nuclear.quantitation.suvbw` result with preserved raw evidence. */
export interface WorkerPetQuantitationResult {
  readonly quantitation: PetQuantitationResult;
  readonly seriesInstanceUID: SeriesInstanceUID;
  readonly studyInstanceUID: StudyInstanceUID | null;
  readonly petAcquisition: WorkerPartialPetAcquisition;
  /** Non-null only when every `PetAcquisitionMetadata` key was present. */
  readonly petAcquisitionMetadata: PetAcquisitionMetadata | null;
  readonly elapsedSeconds: number | null;
  readonly decayedDoseBq: number | null;
  readonly diagnostics: readonly WorkerDiagnostic[];
}

/** `computed` pairwise compatibility evidence (bridge-local contract). */
export interface WorkerCompatibilityComputed {
  readonly status: 'computed';
  readonly compatible: boolean;
  readonly frameOfReference: {
    readonly left: string;
    readonly right: string;
    readonly equal: boolean;
  };
  readonly orientation: {
    readonly maxAngularDeltaDeg: number;
    readonly coplanar: boolean;
  };
  readonly spacingMm: { readonly left: Vector3D; readonly right: Vector3D };
  readonly originLpsMm: { readonly left: Point3D; readonly right: Point3D };
  readonly extentOverlap: {
    readonly overlaps: boolean;
    readonly leftBounds: BoundingBox3D;
    readonly rightBounds: BoundingBox3D;
  };
  readonly incompatibilities: readonly string[];
  readonly diagnostics: readonly WorkerDiagnostic[];
  readonly workerMetadata: ScientificWorkerMetadata;
}

/** `rejected`/`unavailable` compatibility: one side could not be measured. */
export interface WorkerCompatibilityRejected {
  readonly status: 'rejected' | 'unavailable';
  readonly side: 'left' | 'right';
  readonly reason: string;
  readonly diagnostics: readonly WorkerDiagnostic[];
  readonly workerMetadata: ScientificWorkerMetadata;
}

export type WorkerCompatibilityResult =
  | WorkerCompatibilityComputed
  | WorkerCompatibilityRejected;

/** One side of a pairwise compatibility request. */
export interface WorkerSeriesSide {
  readonly locator: SourceLocator;
  readonly seriesInstanceUID: string;
}

/** Optional per-request transport overrides. */
export interface WorkerRequestOptions {
  readonly timeoutMs?: number;
}

/** Bounded exponential restart policy for the supervised worker. */
export interface WorkerRestartPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

/**
 * Construction options for {@link ScientificWorkerBridge}.
 *
 * `spawnWorker` is the testing seam: it receives a monotonically increasing
 * spawn attempt index (1, 2, 3, ...) and must return a stdio-piped child.
 */
export interface ScientificWorkerBridgeOptions {
  readonly command?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly requestTimeoutMs?: number;
  readonly handshakeTimeoutMs?: number;
  readonly restart?: Partial<WorkerRestartPolicy>;
  readonly onStderr?: (chunk: string) => void;
  readonly onAvailabilityChange?: (availability: WorkerAvailability) => void;
  readonly spawnWorker?: (attempt: number) => ChildProcessWithoutNullStreams;
  /** Injectable wall clock (ms) for the ADR-013 handle TTL guard; defaults to `Date.now`. */
  readonly volumeClock?: () => number;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15_000;
export const DEFAULT_RESTART_MAX_ATTEMPTS = 3;
export const DEFAULT_RESTART_BASE_DELAY_MS = 250;
export const DEFAULT_RESTART_MAX_DELAY_MS = 4_000;
/** Grace before `stop()` escalates from stdin EOF to SIGKILL. */
export const DEFAULT_STOP_GRACE_PERIOD_MS = 2_000;
