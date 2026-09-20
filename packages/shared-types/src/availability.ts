/**
 * @nuclear/shared-types — Asset Availability & Resource Residency
 *
 * Distinguishes semantic availability (can the source be reached / verified)
 * from resource residency (which memory tier is currently occupied).
 *
 * Core Principle: "A semantic reference does not pin RAM or VRAM."
 */

import type { AssetId } from './identifiers.js';
import type { SourceFingerprint } from './source.js';

/**
 * Semantic availability status of an imaging source asset.
 * - online: Source is reachable, fingerprint verified, and ready for use.
 * - loading: Source is actively being verified or loaded.
 * - offline-cached: Source is unreachable, but an approved cached preview is available.
 * - missing: Source cannot be reached and no valid preview exists.
 * - mismatch: Source is reachable, but fingerprint does not match the expected state.
 */
export type AssetAvailability =
  | 'online'
  | 'loading'
  | 'offline-cached'
  | 'missing'
  | 'mismatch';

/** Detailed availability status including diagnostic metadata */
export interface AssetAvailabilityStatus {
  readonly state: AssetAvailability;
  readonly message?: string;
  readonly lastCheckedAt?: string; // ISO-8601 timestamp
  readonly expectedFingerprint?: SourceFingerprint;
  readonly observedFingerprint?: SourceFingerprint;
}

/**
 * Physical resource residency tiers managed by the medical engine's ResourceManager.
 * - metadata-only: Only geometry and DICOM descriptors reside in memory.
 * - source-available: Source confirmed on storage, voxel data unread.
 * - cpu-cached: Decoded voxel arrays resident in system RAM.
 * - gpu-ready: Cornerstone volume initialized and staged for WebGL upload.
 * - gpu-resident: 3D texture active in WebGL GPU VRAM for rendering.
 * - loading: In transit between memory tiers.
 * - evicted: Memory reclaimed due to budget; reloadable on demand.
 */
export type AssetResidencyTier =
  | 'metadata-only'
  | 'source-available'
  | 'cpu-cached'
  | 'gpu-ready'
  | 'gpu-resident'
  | 'loading'
  | 'evicted';

/** Diagnostic status of memory residency for an asset */
export interface AssetResidencyStatus {
  readonly tier: AssetResidencyTier;
  readonly byteSizeRAM?: number;
  readonly byteSizeVRAM?: number;
  readonly lastAccessedAt?: string; // ISO-8601 timestamp
}

/** Demand priority declared by the view-engine */
export type ResourcePriority =
  | 'visible-interactive'
  | 'visible-static'
  | 'pre-fetch'
  | 'idle';

/**
 * Demand declaration submitted by view-engine to medical-engine ResourceManager.
 */
export interface ResourceDemand {
  readonly assetId: AssetId;
  readonly priority: ResourcePriority;
  readonly requiredTiers: readonly AssetResidencyTier[];
}
