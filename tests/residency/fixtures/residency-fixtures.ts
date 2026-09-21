/**
 * NuClear P3.3-A — deterministic residency test fixtures.
 *
 * Builds structurally valid `VolumeIngestionPlan` values without running the
 * P3.2 pipeline, plus an in-memory `VolumeResidencyBackend` mock that records
 * every acquire/release in order. Pure Node: no DOM, no WebGL, no Cornerstone.
 */

import type {
  AssetAvailabilityStatus,
  AssetId,
  AssetResidencyTier,
  FrameOfReferenceUID,
  ResourceDemand,
  ResourcePriority,
  SeriesInstanceUID,
} from '../../../packages/shared-types/src/index.ts';
import type {
  RendererVolumeMetadata,
  VolumeIngestionPlan,
} from '../../../packages/medical-engine/src/renderer/volume-types.ts';
import type {
  ResidencyMeasurement,
  ResourceRetention,
  StableResidencyTier,
  VolumeResidencyBackend,
} from '../../../packages/medical-engine/src/residency/residency-types.ts';

/** Deterministic 2x2x2 CT plan with an Int16Array payload. */
export function makePlan(assetId: string, digest: string): VolumeIngestionPlan {
  const uid = `1.2.826.0.1.${digest}`;
  const metadata: RendererVolumeMetadata = {
    BitsAllocated: 16,
    BitsStored: 16,
    HighBit: 15,
    SamplesPerPixel: 1,
    PhotometricInterpretation: 'MONOCHROME2',
    PixelRepresentation: 1,
    Modality: 'CT',
    SeriesInstanceUID: uid,
    ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
    PixelSpacing: [1, 1],
    FrameOfReferenceUID: uid,
    Columns: 2,
    Rows: 2,
    voiLut: [],
    VOILUTFunction: 'LINEAR',
  };
  return {
    volumeId: `nuclear-volume:${assetId}:${digest}`,
    assetId: assetId as AssetId,
    seriesInstanceUID: uid as SeriesInstanceUID,
    frameOfReferenceUID: uid as FrameOfReferenceUID,
    dimensions: [2, 2, 2] as const,
    spacing: [1, 1, 1] as const,
    origin: [0, 0, 0] as const,
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const,
    scalarDataDomain: 'rescaled-hu',
    scalarData: new Int16Array([0, 1, 2, 3, 4, 5, 6, 7]),
    metadata,
    provenance: { geometricDigest: digest, workerModality: 'CT' },
  };
}

export interface RetentionOptions {
  readonly priority?: ResourcePriority;
  readonly requiredTiers?: readonly AssetResidencyTier[];
  readonly availability?: AssetAvailabilityStatus;
  readonly demandAssetId?: string;
}

/** Builds a retention whose demand defaults to the plan's own asset. */
export function makeRetention(
  leaseId: string,
  plan: VolumeIngestionPlan,
  options: RetentionOptions = {},
): ResourceRetention {
  const demand: ResourceDemand = {
    assetId: (options.demandAssetId ?? plan.assetId) as AssetId,
    priority: options.priority ?? 'visible-interactive',
    requiredTiers: options.requiredTiers ?? ['gpu-resident'],
  };
  return {
    leaseId,
    plan,
    demand,
    availability: options.availability ?? { state: 'online' },
  };
}

export interface MockBackendOptions {
  readonly measurements?: Partial<Record<StableResidencyTier, ResidencyMeasurement>>;
  readonly achievedTier?: Partial<Record<StableResidencyTier, StableResidencyTier>>;
}

/** Deterministic in-memory residency backend with injectable failures. */
export class MockResidencyBackend implements VolumeResidencyBackend {
  readonly acquireLog: Array<{ volumeId: string; targetTier: StableResidencyTier }> = [];
  readonly releaseLog: string[] = [];
  readonly resident = new Map<string, StableResidencyTier>();
  acquireThrows: Error | undefined;
  releaseThrows: Error | undefined;
  listThrows: Error | undefined;
  private readonly measurements: Partial<Record<StableResidencyTier, ResidencyMeasurement>>;
  private readonly achievedTier: Partial<Record<StableResidencyTier, StableResidencyTier>>;

  constructor(options: MockBackendOptions = {}) {
    this.measurements = options.measurements ?? {};
    this.achievedTier = options.achievedTier ?? {};
  }

  measure(_plan: VolumeIngestionPlan, targetTier: StableResidencyTier): ResidencyMeasurement {
    return this.measurements[targetTier] ?? {};
  }

  acquire(plan: VolumeIngestionPlan, targetTier: StableResidencyTier): StableResidencyTier {
    if (this.acquireThrows !== undefined) {
      throw this.acquireThrows;
    }
    const achieved = this.achievedTier[targetTier] ?? targetTier;
    this.resident.set(plan.volumeId, achieved);
    this.acquireLog.push({ volumeId: plan.volumeId, targetTier });
    return achieved;
  }

  release(volumeId: string): boolean {
    if (this.releaseThrows !== undefined) {
      throw this.releaseThrows;
    }
    if (!this.resident.has(volumeId)) {
      return false;
    }
    this.resident.delete(volumeId);
    this.releaseLog.push(volumeId);
    return true;
  }

  listAcquiredVolumeIds(): readonly string[] {
    if (this.listThrows !== undefined) {
      throw this.listThrows;
    }
    return [...this.resident.keys()];
  }
}
