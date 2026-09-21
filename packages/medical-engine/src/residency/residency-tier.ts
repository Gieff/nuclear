/**
 * @nuclear/medical-engine — pure residency ladder helpers (P3.3-A).
 *
 * No runtime state, no backend access: only deterministic rank arithmetic and
 * fail-closed demand validation. Deliberately avoids `Math` so the P2.5 source
 * integrity gate stays green.
 */

import type { AssetResidencyTier, ResourceDemand } from '@nuclear/shared-types';
import { RESIDENCY_ERROR_CODES, ResidencyError } from './residency-errors.js';
import {
  RESIDENCY_TIER_LADDER,
  RESOURCE_PRIORITY_LADDER,
  type ResourcePriorityLadder,
  type StableResidencyTier,
} from './residency-types.js';

/** Narrows a free string to a stable ladder tier. */
export function isStableResidencyTier(value: string): value is StableResidencyTier {
  return (RESIDENCY_TIER_LADDER as readonly string[]).includes(value);
}

/** Position of a stable tier in the ladder (0 = least resident). */
export function tierRank(tier: StableResidencyTier): number {
  return RESIDENCY_TIER_LADDER.indexOf(tier);
}

/**
 * Rank of any `AssetResidencyTier`, treating the transition tiers `loading`
 * and `evicted` as below every stable tier.
 */
export function residencyRank(tier: AssetResidencyTier): number {
  return isStableResidencyTier(tier) ? RESIDENCY_TIER_LADDER.indexOf(tier) : -1;
}

/** True only for tiers that actually occupy RAM/VRAM. */
export function isPhysicalTier(
  tier: AssetResidencyTier,
): tier is 'cpu-cached' | 'gpu-ready' | 'gpu-resident' {
  return tier === 'cpu-cached' || tier === 'gpu-ready' || tier === 'gpu-resident';
}

/**
 * Highest stable tier a demand requires. Fails closed for an empty tier list
 * and for the transition tiers `loading`/`evicted`, which can never be a
 * stable acquisition result.
 */
export function requiredTierOf(demand: ResourceDemand): StableResidencyTier {
  const tiers = demand.requiredTiers;
  if (tiers.length === 0) {
    throw new ResidencyError(
      RESIDENCY_ERROR_CODES.invalidDemand,
      `Resource demand for asset '${demand.assetId}' declares no required tiers; declare at least 'source-available'.`,
    );
  }
  let required: StableResidencyTier = 'metadata-only';
  for (const tier of tiers) {
    if (!isStableResidencyTier(tier)) {
      throw new ResidencyError(
        RESIDENCY_ERROR_CODES.invalidDemand,
        `Resource demand for asset '${demand.assetId}' requires '${String(tier)}'; 'loading' and 'evicted' are transitions, not stable acquisition targets.`,
      );
    }
    if (tierRank(tier) > tierRank(required)) {
      required = tier;
    }
  }
  return required;
}

/** Position of a declared priority in the eviction ladder (0 = evict first). */
export function priorityRank(priority: ResourcePriorityLadder): number {
  const rank = RESOURCE_PRIORITY_LADDER.indexOf(priority);
  if (rank === -1) {
    throw new ResidencyError(
      RESIDENCY_ERROR_CODES.invalidDemand,
      `Unknown resource priority '${String(priority)}'; declare one of ${RESOURCE_PRIORITY_LADDER.join(', ')}.`,
    );
  }
  return rank;
}
