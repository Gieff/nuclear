/**
 * @nuclear/medical-engine — browser-only Cornerstone volume cache binding (P3.2/P3.2.1).
 *
 * Owns the only calls that hand a validated plan to Cornerstone's cache:
 * `volumeLoader.createLocalVolume`, the fail-closed duplicate-id pre-check and
 * `cache.removeVolumeLoadObject`. It is browser-only and deliberately NOT
 * re-exported from `renderer/index.ts`, because that barrel is imported in
 * Node contexts through `volume.js`.
 *
 * Construction is wrapped fail-closed: a failed `createLocalVolume` is
 * translated into a typed `VOLUME_CONSTRUCTION_FAILED`, any residual cache
 * entry it managed to register is removed first, and the original cause is
 * always preserved.
 */

import { cache, volumeLoader } from '@cornerstonejs/core';

import { describeLoadedVolume } from './volume.js';
import { VOLUME_INGESTION_ERROR_CODES, VolumeIngestionError } from './volume-errors.js';
import type { LoadedVolume, VolumeIngestionPlan } from './volume-types.js';

/**
 * Mutable holder for Cornerstone's local-volume constructor.
 *
 * esbuild compiles the `@cornerstonejs/core` ESM module exports into an object
 * whose properties are non-configurable getters, so the browser harness cannot
 * reassign `volumeLoader.createLocalVolume` directly. This NuClear-owned holder
 * is the single tested seam; product code never mutates it.
 */
export const localVolumeConstructor: {
  createLocalVolume: typeof volumeLoader.createLocalVolume;
} = {
  createLocalVolume: volumeLoader.createLocalVolume,
};

/** Fail-closed duplicate-`volumeId` pre-check (Cornerstone would otherwise reuse it silently). */
export function assertVolumeUncached(volumeId: string): void {
  if (cache.getVolume(volumeId) !== undefined) {
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.payloadInvalid,
      `Volume '${volumeId}' is already cached; release it before loading.`,
    );
  }
}

/** Removes a half-registered volume; never masks the original construction cause. */
function removeResidualVolume(volumeId: string): void {
  try {
    removeVolumeArtifacts(volumeId);
  } catch {
    // Documented benign fallback: residual cleanup is best-effort. A cleanup
    // failure must never replace the actionable construction error below,
    // whose `cause` preserves the original Cornerstone failure.
  }
}

/**
 * Removes one cached volume and every derived image it owns.
 *
 * Cornerstone's `removeVolumeLoadObject`/`_decacheVolume` clears the derived
 * slice images' `sharedCacheKey` but leaves each `${volumeId}_slice_<i>` entry
 * in the image cache. `createLocalVolume` re-registers those ids with
 * `cache.putImageSync` and throws "imageId already in cache" on a second load,
 * so a per-volume release must also drop this volume's own derived images or
 * the documented evict -> reload path cannot reconstruct the same `volumeId`.
 * This stays strictly per-volume: only `volume.imageIds` is touched.
 *
 * @returns `false` when the volume is not cached, `true` once it is cleaned.
 */
function removeVolumeArtifacts(volumeId: string): boolean {
  const volume = cache.getVolume(volumeId);
  if (volume === undefined) {
    return false;
  }
  cache.removeVolumeLoadObject(volumeId);
  for (const imageId of volume.imageIds) {
    if (cache.getImage(imageId) !== undefined) {
      cache.removeImageLoadObject(imageId);
    }
  }
  return true;
}

/**
 * Constructs the plan's local volume verbatim and returns its serializable
 * descriptor. A `createLocalVolume` failure fails closed with
 * `VOLUME_CONSTRUCTION_FAILED` after residual cache cleanup.
 */
export function bindVolume(plan: VolumeIngestionPlan): LoadedVolume {
  assertVolumeUncached(plan.volumeId);
  try {
    localVolumeConstructor.createLocalVolume(plan.volumeId, {
      metadata: plan.metadata,
      dimensions: [plan.dimensions[0], plan.dimensions[1], plan.dimensions[2]],
      spacing: [plan.spacing[0], plan.spacing[1], plan.spacing[2]],
      origin: [plan.origin[0], plan.origin[1], plan.origin[2]],
      direction: [...plan.direction],
      scalarData: plan.scalarData,
    });
  } catch (error) {
    removeResidualVolume(plan.volumeId);
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.constructionFailed,
      `Volume '${plan.volumeId}' could not be constructed by Cornerstone's local volume loader. Verify the scalar array constructor matches the declared dtype and that the declared grid/metadata are coherent, then retry the load.`,
      { cause: error },
    );
  }
  return describeLoadedVolume(plan);
}

/** Releases a cached volume and its derived images; an unknown id fails closed. */
export function releaseBoundVolume(volumeId: string): void {
  if (!removeVolumeArtifacts(volumeId)) {
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.payloadInvalid,
      `Volume '${volumeId}' is not cached; nothing to release.`,
    );
  }
}

/**
 * Releases one cached volume if present, reporting absence instead of throwing.
 *
 * Residency eviction is per-volume and idempotent by nature: a resource may
 * already be gone when the manager confirms release. `false` therefore means
 * "not cached", never "failed"; callers that need a hard error use
 * `releaseBoundVolume`. There is deliberately no purge-all variant.
 */
export function releaseBoundVolumeIfPresent(volumeId: string): boolean {
  return removeVolumeArtifacts(volumeId);
}
