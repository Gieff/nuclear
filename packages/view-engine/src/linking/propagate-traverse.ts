/**
 * @nuclear/view-engine — inter-study spatial traversal (P4.4b, ADR-012
 * §2/§3/§4/§6/§7/§8; ratified 2026-09-23).
 *
 * Private traversal half of `applySpatialIntent`: it stages the origin plus
 * every reachable `transformed` target (never touching a registry) and returns
 * the staged projections plus deterministic per-target outcomes. All domain /
 * transform math is consumed from `@nuclear/medical-engine` (R-4/OD-2).
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type {
  AssetGeometry,
  AssetId,
  ImagingAsset,
  InterStudyLink,
  PreparedView,
  PreparedViewId,
  SpatialState,
  ViewId,
} from '@nuclear/shared-types';
import {
  applySpatialTransform,
  clampPointToNativeGridDomain,
  isPointInNativeGridDomain,
  NativeGridDomainError,
  SpatialTransformError,
} from '@nuclear/medical-engine';
import { LinkError } from './errors.js';
import { lockedStates } from '../locks/guard.js';
import { assemblePreparedView } from '../prepared-view/index.js';
import type { SharedStateGroupRegistry } from '../shared-state/index.js';

export type SpatialIntentOutcomeKind = 'updated' | 'clamped' | 'hidden' | 'warned';

export interface SpatialIntentTargetOutcome {
  readonly preparedViewId: PreparedViewId;
  readonly sourceViewId: ViewId;
  readonly outcome: SpatialIntentOutcomeKind;
  /** Present iff out-of-domain occurred; always the OD-5 identifier, never thrown. */
  readonly outOfDomainCode?: 'LINK_TARGET_OUT_OF_DOMAIN';
  /** Final published spatial for 'updated'/'clamped'; absent for 'hidden'/'warned'. */
  readonly spatial?: SpatialState;
}

/** Result of resolving one edge for one target, before any registry write. */
type TargetStep =
  | {
      readonly advance: true;
      readonly kind: 'updated' | 'clamped';
      readonly spatial: SpatialState;
      readonly outOfDomainCode?: 'LINK_TARGET_OUT_OF_DOMAIN';
    }
  | {
      readonly advance: false;
      readonly kind: 'hidden' | 'warned';
      readonly outOfDomainCode: 'LINK_TARGET_OUT_OF_DOMAIN';
    };

export interface TraversalInput {
  readonly origin: PreparedView;
  readonly registered: readonly PreparedView[];
  readonly nextSpatialState: SpatialState;
  readonly sharedStateGroups: SharedStateGroupRegistry;
  readonly lookupAsset: (assetId: AssetId) => ImagingAsset | undefined;
}

export interface TraversalResult {
  readonly stagedViews: Map<PreparedViewId, PreparedView>;
  readonly targets: readonly SpatialIntentTargetOutcome[];
}

function findBySourceViewId(views: readonly PreparedView[], viewId: ViewId): PreparedView | undefined {
  return views.find((view) => view.sourceViewId === viewId);
}

/** OD-3 domain evidence: the registered target asset's oriented native-grid geometry. */
function resolveDomainGeometry(
  link: InterStudyLink,
  target: PreparedView,
  lookupAsset: (assetId: AssetId) => ImagingAsset | undefined,
): AssetGeometry {
  const asset = lookupAsset(target.state.dataBinding.assetId);
  const geometry = asset?.geometry;
  if (geometry === undefined || geometry.frameOfReferenceUID !== link.targetFrameOfReferenceUID) {
    throw new LinkError(
      'LINK_TARGET_DOMAIN_UNAVAILABLE',
      `Inter-study target view '${target.sourceViewId}' (asset '${target.state.dataBinding.assetId}') has no registered native-grid geometry correlated with the link target FrameOfReferenceUID '${link.targetFrameOfReferenceUID}'. Remediation: register the target's worker-verified oriented geometry under that Frame of Reference; a missing or mismatched domain is refused closed (ADR-012 OD-3).`,
    );
  }
  return geometry;
}

/** Resolves one edge for one target; throws typed refusals, never publishes. */
function resolveTargetStep(
  link: InterStudyLink,
  currentSpatial: SpatialState,
  target: PreparedView,
  lookupAsset: (assetId: AssetId) => ImagingAsset | undefined,
): TargetStep {
  if (link.mode !== 'transformed') {
    throw new LinkError(
      'LINK_RELATIVE_MODE_UNSUPPORTED',
      `Inter-study edge '${link.sourceViewId}' -> '${link.targetViewId}' uses mode '${link.mode}'. Remediation: relative application is deferred (ADR-012 R-2/OD-4); register a 'transformed' link with a Procrustes/landmark SpatialTransform.`,
    );
  }
  if (currentSpatial.frameOfReferenceUID !== link.sourceFrameOfReferenceUID) {
    throw new LinkError(
      'LINK_INTER_STUDY_TRANSFORM_FRAME_MISMATCH',
      `Staged spatial for view '${target.sourceViewId}' has FrameOfReferenceUID '${currentSpatial.frameOfReferenceUID}' while edge '${link.sourceViewId}' -> '${link.targetViewId}' declares source frame '${link.sourceFrameOfReferenceUID}'. Remediation: the propagated source spatial must be expressed in the edge's source Frame of Reference.`,
    );
  }
  const geometry = resolveDomainGeometry(link, target, lookupAsset);
  const transform = link.spatialTransform;
  if (transform === undefined) {
    throw new LinkError(
      'LINK_TRANSFORM_INVALID',
      `Inter-study edge '${link.sourceViewId}' -> '${link.targetViewId}' is mode 'transformed' but carries no spatialTransform. Remediation: register the link with a validated transform; propagation never treats a missing transform as co-referenced.`,
    );
  }
  let mapped: SpatialState;
  try {
    mapped = applySpatialTransform(transform.matrix4x4, currentSpatial);
  } catch (error) {
    if (error instanceof SpatialTransformError) {
      throw new LinkError(
        'LINK_TRANSFORM_INVALID',
        `Inter-study edge '${link.sourceViewId}' -> '${link.targetViewId}' carries transform '${transform.id}' whose matrix could not be applied (${error.message}). Remediation: register a worker-validated proper rigid transform; an affine/reflection matrix is never approximated.`,
        { cause: error },
      );
    }
    throw error;
  }
  // Contract composition, not math: the target frame comes from the link.
  const targetSpatial: SpatialState = { ...mapped, frameOfReferenceUID: link.targetFrameOfReferenceUID };
  let inDomain: boolean;
  try {
    inDomain = isPointInNativeGridDomain(geometry, targetSpatial.referenceLocation);
  } catch (error) {
    if (error instanceof NativeGridDomainError) {
      throw new LinkError(
        'LINK_TARGET_DOMAIN_UNAVAILABLE',
        `Inter-study target view '${target.sourceViewId}' has malformed native-grid geometry evidence (${error.message}). Remediation: register worker-verified geometry; malformed evidence is refused closed (ADR-012 OD-3).`,
        { cause: error },
      );
    }
    throw error;
  }
  if (inDomain) {
    return { advance: true, kind: 'updated', spatial: targetSpatial };
  }
  const outOfDomainCode = 'LINK_TARGET_OUT_OF_DOMAIN' as const;
  if (link.outOfDomainBehavior === 'clamp') {
    const clamped = clampPointToNativeGridDomain(geometry, targetSpatial.referenceLocation);
    return {
      advance: true,
      kind: 'clamped',
      spatial: { ...targetSpatial, referenceLocation: clamped },
      outOfDomainCode,
    };
  }
  return {
    advance: false,
    kind: link.outOfDomainBehavior === 'hide' ? 'hidden' : 'warned',
    outOfDomainCode,
  };
}

function stageProjection(view: PreparedView, spatial: SpatialState): PreparedView {
  return assemblePreparedView({
    preparedViewId: view.id,
    state: { ...view.state, spatial },
    provenance: view.provenance,
    links: view.links,
    locks: view.locks,
    ...(view.cachedPreviewReference === undefined
      ? {}
      : { cachedPreviewReference: view.cachedPreviewReference }),
  });
}

function outcomeFor(
  target: PreparedView,
  step: TargetStep,
): SpatialIntentTargetOutcome {
  if (step.advance) {
    return {
      preparedViewId: target.id,
      sourceViewId: target.sourceViewId,
      outcome: step.kind,
      ...(step.outOfDomainCode === undefined ? {} : { outOfDomainCode: step.outOfDomainCode }),
      spatial: step.spatial,
    };
  }
  return {
    preparedViewId: target.id,
    sourceViewId: target.sourceViewId,
    outcome: step.kind,
    outOfDomainCode: step.outOfDomainCode,
  };
}

/**
 * Deterministic BFS staging from the origin. A convergent second arrival is a
 * `LINK_PROPAGATION_CONFLICT` (R-3/OD-5), even when the first arrival produced a
 * non-mutating hide/warn. Nothing is published here.
 */
export function traverseSpatialIntent(input: TraversalInput): TraversalResult {
  const { origin, registered, nextSpatialState, sharedStateGroups, lookupAsset } = input;
  const stagedViews = new Map<PreparedViewId, PreparedView>();
  const outcomes = new Map<PreparedViewId, SpatialIntentTargetOutcome>();
  const stagedOrigin = stageProjection(origin, nextSpatialState);
  stagedViews.set(origin.id, stagedOrigin);

  const visited = new Set<PreparedViewId>([origin.id]);
  const queue: PreparedView[] = [stagedOrigin];
  while (queue.length > 0) {
    const current = queue.shift() as PreparedView;
    const currentSpatial = current.state.spatial;
    for (const link of current.links) {
      // Outgoing edges only: a link is recorded on both endpoints, so the
      // incoming link must not be re-traversed from its target.
      if (link.kind !== 'inter-study' || link.sourceViewId !== current.sourceViewId) continue;
      // `synchronizedState` declares what a link may affect; an edge that does
      // not declare 'spatial' is not a spatial-propagation edge and is skipped.
      if (!link.synchronizedState.includes('spatial')) continue;
      const target = findBySourceViewId(registered, link.targetViewId);
      if (target === undefined) {
        throw new LinkError(
          'LINK_VIEW_MISMATCH',
          `Inter-study edge '${link.sourceViewId}' -> '${link.targetViewId}' has no registered prepared view for target '${link.targetViewId}'. Remediation: register the target prepared view before applying a spatial intent.`,
        );
      }
      if (visited.has(target.id)) {
        throw new LinkError(
          'LINK_PROPAGATION_CONFLICT',
          `One spatial intent would reach prepared view '${target.id}' (source view '${target.sourceViewId}') more than once. Remediation: a propagation must be a single path; remove the convergent inter-study edges or apply the intents separately.`,
        );
      }
      visited.add(target.id);
      if (sharedStateGroups.groupOf(target.id) !== undefined) {
        throw new LinkError(
          'LINK_SHARED_STATE_CONFLICT',
          `Inter-study target prepared view '${target.id}' (source view '${target.sourceViewId}') is attached to a shared-state group; inter-study targets never share absolute state. Remediation: detach the target before propagating a spatial intent into it.`,
        );
      }
      if (lockedStates(target).has('spatial')) {
        throw new LinkError(
          'LINK_TARGET_SPATIAL_LOCKED',
          `Inter-study target prepared view '${target.id}' (source view '${target.sourceViewId}') holds a StateLock on state 'spatial'. Remediation: release the 'spatial' lock before propagating; locks win and the whole intent is refused (ADR-012 §7).`,
        );
      }
      const step = resolveTargetStep(link, currentSpatial, target, lookupAsset);
      if (step.advance) {
        const staged = stageProjection(target, step.spatial);
        stagedViews.set(target.id, staged);
        queue.push(staged);
      }
      outcomes.set(target.id, outcomeFor(target, step));
    }
  }

  const targets: SpatialIntentTargetOutcome[] = [];
  for (const view of registered) {
    const outcome = outcomes.get(view.id);
    if (outcome !== undefined) targets.push(outcome);
  }
  return { stagedViews, targets };
}
