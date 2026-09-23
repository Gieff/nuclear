/**
 * @nuclear/view-engine — explicit inter-study spatial-intent propagation
 * (P4.4b, ADR-012 §2/§3/§4/§6/§7/§8, OD-1 Candidate A / OD-5; ratified
 * 2026-09-23).
 *
 * One workspace-level operation accepts the origin view's proposed
 * `SpatialState` plus a causality token, stages the origin and every reachable
 * `transformed` target through `propagate-traverse`, then publishes all
 * replacements atomically through the internal `replaceRegisteredPreparedView`
 * path. There is **no** observer/notify chain: a hard refusal leaves every
 * canonical view unchanged; `clamp`/`hide`/`warn` outcomes are result metadata
 * only and are never written to a published DTO.
 *
 * Math ownership (R-4/OD-2): transform application and native-grid domain
 * membership are consumed from `@nuclear/medical-engine` by the traversal half;
 * this module composes and never re-derives matrix or geometry science.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type {
  AssetId,
  ImagingAsset,
  PreparedView,
  SpatialState,
  ViewId,
} from '@nuclear/shared-types';
import { LinkError } from './errors.js';
import { lockedStates } from '../locks/guard.js';
import { type PreparedViewRegistry } from '../prepared-view/index.js';
import type { SharedStateGroupRegistry } from '../shared-state/index.js';
import { replaceRegisteredPreparedView } from '../prepared-view/registry.js';
import { deepFreeze } from '../internal/deep-freeze.js';
import { traverseSpatialIntent } from './propagate-traverse.js';
import type { SpatialIntentTargetOutcome } from './propagate-traverse.js';

export type { SpatialIntentOutcomeKind, SpatialIntentTargetOutcome } from './propagate-traverse.js';

/** Causality token: one user intent, one frame (`originViewId`, opaque linkId, epoch). */
export interface CausalityToken {
  readonly originViewId: ViewId;
  readonly linkId: string;
  readonly epoch: number;
}

export interface ApplySpatialIntentInput {
  readonly originViewId: ViewId;
  readonly nextSpatialState: SpatialState;
  readonly causalityToken: CausalityToken;
  readonly preparedViews: PreparedViewRegistry;
  readonly sharedStateGroups: SharedStateGroupRegistry;
  readonly lookupAsset: (assetId: AssetId) => ImagingAsset | undefined;
}

export interface SpatialIntentResult {
  readonly causalityToken: CausalityToken;
  readonly origin: PreparedView;
  readonly targets: readonly SpatialIntentTargetOutcome[];
}

function refuseMalformed(detail: string): never {
  throw new LinkError(
    'LINK_MALFORMED',
    `Spatial intent is malformed: ${detail} Remediation: pass a non-empty causality token whose linkId is a non-empty string and whose epoch is a finite number.`,
  );
}

/** Validates the token shape/origin before any registry access. */
function validateToken(token: CausalityToken, originViewId: ViewId): CausalityToken {
  if (token === null || typeof token !== 'object') refuseMalformed('causalityToken is not an object.');
  if (token.originViewId !== originViewId) {
    throw new LinkError(
      'LINK_ORIGIN_UNKNOWN',
      `Causality token origin '${String(token.originViewId)}' disagrees with the intent origin '${originViewId}'. Remediation: pass a token whose originViewId is the view the intent originates from.`,
    );
  }
  if (typeof token.linkId !== 'string' || token.linkId.length === 0) {
    refuseMalformed('causalityToken.linkId must be a non-empty string.');
  }
  if (typeof token.epoch !== 'number' || !Number.isFinite(token.epoch)) {
    refuseMalformed('causalityToken.epoch must be a finite number.');
  }
  return { ...token };
}

function findBySourceViewId(views: readonly PreparedView[], viewId: ViewId): PreparedView | undefined {
  return views.find((view) => view.sourceViewId === viewId);
}

/**
 * Applies one explicit workspace-level spatial intent and returns the frozen
 * origin projection plus the deterministic per-target outcomes.
 *
 * @throws LinkError `LINK_MALFORMED`, `LINK_ORIGIN_UNKNOWN`,
 * `LINK_SHARED_STATE_CONFLICT`, `LINK_TARGET_SPATIAL_LOCKED`,
 * `LINK_PROPAGATION_CONFLICT`, `LINK_VIEW_MISMATCH`,
 * `LINK_RELATIVE_MODE_UNSUPPORTED`, `LINK_INTER_STUDY_TRANSFORM_FRAME_MISMATCH`,
 * `LINK_TRANSFORM_INVALID` or `LINK_TARGET_DOMAIN_UNAVAILABLE`.
 */
export function applySpatialIntent(input: ApplySpatialIntentInput): SpatialIntentResult {
  const { originViewId, nextSpatialState, preparedViews, sharedStateGroups, lookupAsset } = input;
  const causalityToken = validateToken(input.causalityToken, originViewId);

  const registered = preparedViews.list();
  const origin = findBySourceViewId(registered, originViewId);
  if (origin === undefined) {
    throw new LinkError(
      'LINK_ORIGIN_UNKNOWN',
      `No registered prepared view has source view '${originViewId}'. Remediation: register a prepared view whose sourceViewId is the intent origin before applying a spatial intent.`,
    );
  }
  if (sharedStateGroups.groupOf(origin.id) !== undefined) {
    throw new LinkError(
      'LINK_SHARED_STATE_CONFLICT',
      `Spatial-intent origin prepared view '${origin.id}' (source view '${origin.sourceViewId}') is attached to a shared-state group; an inter-study intent never shares absolute state. Remediation: detach the origin before applying an inter-study spatial intent.`,
    );
  }
  if (lockedStates(origin).has('spatial')) {
    throw new LinkError(
      'LINK_TARGET_SPATIAL_LOCKED',
      `Spatial-intent origin prepared view '${origin.id}' (source view '${origin.sourceViewId}') holds a StateLock on state 'spatial'. Remediation: release the 'spatial' lock on the origin before applying the intent; locks win (ADR-012 §7).`,
    );
  }

  // Staging only: the traversal performs no registry write; publication below
  // (one synchronous loop) is reached only after the full traversal validates.
  const { stagedViews, targets } = traverseSpatialIntent({
    origin,
    registered,
    nextSpatialState,
    sharedStateGroups,
    lookupAsset,
  });
  for (const view of stagedViews.values()) {
    replaceRegisteredPreparedView(preparedViews, view);
  }
  return deepFreeze({
    causalityToken,
    origin: stagedViews.get(origin.id) ?? origin,
    targets,
  });
}
