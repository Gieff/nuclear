/**
 * @nuclear/medical-engine — P3.3-A resource residency contracts (Node-safe).
 *
 * Type-only module plus two frozen ladders. It imports nothing from
 * `@cornerstonejs/core`: the residency state machine is pure Node and can be
 * exercised without DOM or WebGL. Resource identity is the physical
 * `volumeId` of a validated `VolumeIngestionPlan`; a lease id replaces any
 * UI slot/cell id, so one volume can serve several consumers at once.
 *
 * Semantic lifetime and RAM/VRAM residency are separate axes: eviction frees
 * physical resources only and never deletes `assetId`, `geometricDigest` or
 * the validated plan.
 */

import type {
  AssetAvailabilityStatus,
  AssetId,
  AssetResidencyTier,
  ResourceDemand,
  ResourcePriority,
} from '@nuclear/shared-types';
import type { VolumeIngestionPlan } from '../renderer/volume-types.js';

/**
 * Stable residency ladder, ordered from least to most resident. `loading` and
 * `evicted` from `AssetResidencyTier` are transitions, not acquisition targets
 * and are deliberately absent here.
 */
export const RESIDENCY_TIER_LADDER = [
  'metadata-only',
  'source-available',
  'cpu-cached',
  'gpu-ready',
  'gpu-resident',
] as const;

/** A stable, reachable tier of the residency ladder. */
export type StableResidencyTier = (typeof RESIDENCY_TIER_LADDER)[number];

/**
 * Resource demand ladder, ordered from lowest (evict first) to highest.
 * `unused` is index 0; `visible-interactive` is the most protected.
 */
export const RESOURCE_PRIORITY_LADDER = [
  'unused',
  'prefetch-candidate',
  'prepared-hidden',
  'visible-read-only',
  'visible-interactive',
] as const;

/** Ladder mirror of the declarative `ResourcePriority` vocabulary. */
export type ResourcePriorityLadder = (typeof RESOURCE_PRIORITY_LADDER)[number];

/** Whether a backend actually reported byte sizes for a tier. */
export type ResidencyMeasurementState = 'measured' | 'unavailable';

/**
 * One consumer's declared hold on a physical volume.
 *
 * `leaseId` is opaque and owned by the caller (the future view-engine); it is
 * never derived from a slot, cell or DOM node. The plan is re-presented on
 * every retain so the manager can re-validate provenance fail-closed without
 * trusting an earlier copy.
 */
export interface ResourceRetention {
  readonly leaseId: string;
  readonly plan: VolumeIngestionPlan;
  readonly demand: ResourceDemand;
  readonly availability: AssetAvailabilityStatus;
}

/**
 * Honest byte accounting. A missing field means "not exposed by the backend",
 * never zero and never an estimate.
 */
export interface ResidencyMeasurement {
  readonly byteSizeRAM?: number;
  readonly byteSizeVRAM?: number;
}

/**
 * Physical backend boundary. P3.3-B binds this to Cornerstone; P3.3-A tests use
 * a deterministic in-memory mock. `release` frees exactly one volume — there is
 * deliberately no purge-all method.
 */
export interface VolumeResidencyBackend {
  /** Reports the bytes a `targetTier` acquisition would occupy, if known. */
  measure(plan: VolumeIngestionPlan, targetTier: StableResidencyTier): ResidencyMeasurement;
  /** Acquires the volume at (at least) `targetTier`; returns the tier reached. */
  acquire(plan: VolumeIngestionPlan, targetTier: StableResidencyTier): StableResidencyTier;
  /** Releases a single volume; `true` when it was present. */
  release(volumeId: string): boolean;
  /** Lists acquired volume ids (used to confirm an ambiguous release). */
  listAcquiredVolumeIds(): readonly string[];
}

/** Optional RAM/GPU budget. An absent field means that axis is unbounded. */
export interface ResourceBudget {
  readonly cpuBytes?: number;
  readonly gpuBytes?: number;
}

/** One live lease projected into a serializable snapshot. */
export interface ResourceLeaseSnapshot {
  readonly leaseId: string;
  readonly volumeId: string;
  readonly assetId: AssetId;
  readonly priority: ResourcePriority;
  readonly requiredTier: StableResidencyTier;
}

/** Full semantic + physical snapshot of one tracked resource. */
export interface ResourceResidencySnapshot {
  readonly volumeId: string;
  readonly assetId: AssetId;
  readonly geometricDigest: string;
  readonly tier: AssetResidencyTier;
  readonly byteSizeRAM?: number;
  readonly byteSizeVRAM?: number;
  readonly measurement: ResidencyMeasurementState;
  readonly leases: readonly ResourceLeaseSnapshot[];
}

/** Outcome of one acquisition or eviction attempt. */
export type ResidencyDisposition =
  | 'resident'
  | 'deferred'
  | 'budget-exhausted'
  | 'loader-failed'
  | 'eviction-failed'
  | 'enumeration-failed';

/** Per-volume settlement record; failures always carry a message. */
export interface ResourceSettlement {
  readonly volumeId: string;
  readonly disposition: ResidencyDisposition;
  readonly tier: AssetResidencyTier;
  readonly requiredTier: StableResidencyTier;
  readonly message?: string;
}

/** Complete, serializable result of one `reconcile`/`settle` pass. */
export interface ResidencySettlementResult {
  readonly settlements: readonly ResourceSettlement[];
  readonly evictedVolumeIds: readonly string[];
  readonly resources: readonly ResourceResidencySnapshot[];
  readonly leases: readonly ResourceLeaseSnapshot[];
}
