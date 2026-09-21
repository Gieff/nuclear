/**
 * NuClear P3.3-B — shared residency probe contract and plan builder
 * (test infrastructure).
 *
 * Extracted from `residency-entry.ts` so both the entry wiring and the probe
 * implementations stay within the 300-line source limit. Pure helpers only:
 * no module-level adapter/manager state and no global installation. Bundled by
 * esbuild alongside its importer; never reachable from product code.
 */

import type {
  AssetAvailabilityStatus,
  AssetResidencyTier,
  ResourceDemand,
} from '../../../packages/shared-types/src/index.ts';
import {
  buildVolumeIngestionPlan,
  RendererError,
  VolumeIngestionError,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import type { VolumeIngestionPlan } from '../../../packages/medical-engine/src/renderer/index.ts';
import {
  ResidencyError,
  type ResourceRetention,
} from '../../../packages/medical-engine/src/residency/index.ts';
import {
  buildAsset,
  decodeBase64,
  readTypedArray,
  requireComputed,
} from './volume-fixture.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';

/** NuClear declares `gpu-ready`; `gpu-resident` is not observable in P3.3. */
const REQUIRED_TIERS: readonly AssetResidencyTier[] = ['gpu-ready'];

export interface FusionProbeInput {
  ct: VolumeProbeInput;
  pet: VolumeProbeInput;
}

/** Plain, serializable probe result: custom `Error` fields do not survive `page.evaluate`. */
export interface ResidencyAck {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  volumeId?: string;
  reloadedVolumeId?: string;
  tier?: string;
  ctTier?: string;
  petTier?: string;
  cacheVolumeIds?: string[];
  residualCacheVolumeIds?: string[];
  snapshotVolumeIds?: string[];
  snapshotLeaseCount?: number;
  acquired?: boolean;
  released?: boolean;
}

export function makeRetention(
  leaseId: string,
  plan: VolumeIngestionPlan,
  state: AssetAvailabilityStatus['state'] = 'online',
): ResourceRetention {
  const demand: ResourceDemand = {
    assetId: plan.assetId,
    priority: 'visible-interactive',
    requiredTiers: REQUIRED_TIERS,
  };
  return { leaseId, plan, demand, availability: { state } };
}

/** Builds the plan through the same Node-safe planner the product uses. */
export function planFromInput(input: VolumeProbeInput): VolumeIngestionPlan {
  const evidence = requireComputed(input.expectedGeometry);
  const pixel = input.pixels;
  return buildVolumeIngestionPlan({
    asset: buildAsset(input.fixture, evidence.assetGeometry, pixel, evidence.geometricDigest),
    availability: { state: input.fixture.availability as AssetAvailabilityStatus['state'] },
    classification: {
      supported: input.fixture.classification.supported,
      modality: input.fixture.modality,
      reason: input.fixture.classification.reason,
    },
    geometryEvidence: evidence,
    pixels: {
      dtype: pixel.dtype,
      signedness: pixel.signedness,
      samplesPerPixel: pixel.samplesPerPixel,
      bitsAllocated: pixel.bitsAllocated,
      bitsStored: pixel.bitsStored,
      highBit: pixel.highBit,
      photometricInterpretation: pixel.photometricInterpretation,
      scalarDataDomain: pixel.scalarDataDomain,
      ...(pixel.rescale ? { rescale: pixel.rescale } : {}),
      dimensions: pixel.dimensions,
      scalarData: readTypedArray(decodeBase64(pixel.values), pixel.dtype),
    },
  });
}

export function describeError(error: unknown): ResidencyAck {
  if (
    error instanceof VolumeIngestionError ||
    error instanceof RendererError ||
    error instanceof ResidencyError
  ) {
    return { ok: false, name: error.name, code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { ok: false, name: error.name, code: 'UNKNOWN', message: error.message };
  }
  return { ok: false, name: 'Error', code: 'UNKNOWN', message: String(error) };
}
