/**
 * @nuclear/medical-engine — Cornerstone residency backend (P3.3-B, browser-only).
 *
 * Binds the pure `VolumeResidencyBackend` port from `src/residency/**` to real
 * Cornerstone volume-cache operations through the committed `volume-binding.ts`
 * (`volumeLoader.createLocalVolume` / `cache.removeVolumeLoadObject`). The pure
 * residency core imports no `@cornerstonejs/core`; this adapter is the only
 * place where that port touches the real cache, and it is exported solely from
 * `renderer/index.ts` (never from `src/index.ts`).
 *
 * Two honesty rules are enforced here:
 * - RAM is measured (`plan.scalarData.byteLength`); VRAM is left `undefined`,
 *   because Cornerstone exposes no VRAM byte count. It is reported as
 *   unavailable, never fabricated from a guessed formula.
 * - Acquiring stages a real local volume in Cornerstone's cache, which NuClear
 *   reports as `gpu-ready`. Actual WebGL 3D-texture residency (`gpu-resident`)
 *   is a rendering concern deferred to P3.4; this backend must not claim it.
 */

import { cache } from '@cornerstonejs/core';

import type {
  ResidencyMeasurement,
  StableResidencyTier,
  VolumeResidencyBackend,
} from '../residency/residency-types.js';
import type { LoadedVolume, VolumeIngestionPlan } from './volume.js';

/**
 * Structural host the backend drives. `CornerstoneRendererAdapter` satisfies it
 * as-is; tests may inject a deterministic stand-in.
 */
export interface CornerstoneVolumeResidencyHost {
  loadVolume(plan: VolumeIngestionPlan): LoadedVolume;
  releaseVolumeIfPresent(volumeId: string): boolean;
}

/**
 * Adapts a host's real Cornerstone volume operations to the residency port.
 *
 * - `measure`: reports the decoded scalar array's RAM bytes and leaves VRAM
 *   undefined — the backend exposes no VRAM measurement.
 * - `acquire`: constructs the local volume (real cache staging) and reports
 *   `gpu-ready`; the tier vocabulary's `gpu-resident` (live 3D texture) is not
 *   observable here and remains P3.4 work.
 * - `release`: per-volume only, idempotent, `false` when the id is not cached.
 * - `listAcquiredVolumeIds`: the real `cache.getVolumes()` enumeration.
 */
export function createCornerstoneVolumeResidencyBackend(
  host: CornerstoneVolumeResidencyHost,
): VolumeResidencyBackend {
  return {
    measure(plan: VolumeIngestionPlan, _targetTier: StableResidencyTier): ResidencyMeasurement {
      return { byteSizeRAM: plan.scalarData.byteLength };
    },
    acquire(plan: VolumeIngestionPlan, _targetTier: StableResidencyTier): StableResidencyTier {
      host.loadVolume(plan);
      return 'gpu-ready';
    },
    release(volumeId: string): boolean {
      return host.releaseVolumeIfPresent(volumeId);
    },
    listAcquiredVolumeIds(): readonly string[] {
      return cache.getVolumes().map((volume) => volume.volumeId);
    },
  };
}
