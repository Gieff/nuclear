/**
 * @nuclear/view-engine — register an admissible inter-study link (P4.4b,
 * ADR-012 R-1/R-3, §1/§5; ratified 2026-09-23).
 *
 * Registration is the admission boundary: eligibility runs first (P4.4,
 * unchanged), then the one-shot admission gate compares the transform's
 * measured `errorMarginMm` with the caller's `toleranceMm`, then the mandatory
 * DAG is checked for a cycle-closing edge. Only after every check passes are
 * both frozen projections regenerated with the link recorded and published
 * through the internal `replaceRegisteredPreparedView` primitive.
 *
 * Inter-study links **never** attach a view to a `SharedStateGroup` (ADR-012
 * §2); a view already in a group is refused. Registration changes no spatial
 * state, so both views keep their own `state`/`camera`/`locks`/`provenance`.
 * Fail-closed: a refusal leaves every registered view unchanged.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type {
  AssetId,
  ImagingAsset,
  InterStudyLink,
  PreparedView,
  PreparedViewId,
  ViewLink,
} from '@nuclear/shared-types';
import { LinkError } from './errors.js';
import { assertViewLinkEligible } from './eligibility.js';
import { isViewLink } from './guards.js';
import { assertInterStudyLinkAdmissible } from './admission.js';
import { assemblePreparedView } from '../prepared-view/index.js';
import type { PreparedViewRegistry } from '../prepared-view/index.js';
import { replaceRegisteredPreparedView } from '../prepared-view/registry.js';
import type { SharedStateGroupRegistry } from '../shared-state/index.js';
import { structurallyEqual } from '../internal/json-equality.js';
import { deepFreeze } from '../internal/deep-freeze.js';

export interface RegisterInterStudyLinkInput {
  readonly link: ViewLink;
  readonly sourcePreparedViewId: PreparedViewId;
  readonly targetPreparedViewId: PreparedViewId;
  readonly preparedViews: PreparedViewRegistry;
  readonly sharedStateGroups: SharedStateGroupRegistry;
  readonly lookupAsset: (assetId: AssetId) => ImagingAsset | undefined;
}

export interface RegisteredInterStudyLink {
  readonly link: InterStudyLink;
  readonly source: PreparedView;
  readonly target: PreparedView;
}

function describeViews(sourcePreparedViewId: PreparedViewId, targetPreparedViewId: PreparedViewId): string {
  return `prepared views '${sourcePreparedViewId}' and '${targetPreparedViewId}'`;
}

/** Directed inter-study edges `sourceViewId -> targetViewId`, deduped by pair. */
function collectInterStudyEdges(views: readonly PreparedView[]): ReadonlyArray<readonly [string, string]> {
  const edges: Array<readonly [string, string]> = [];
  const seen = new Set<string>();
  for (const view of views) {
    for (const link of view.links) {
      if (link.kind !== 'inter-study') continue;
      const key = `${link.sourceViewId}\u0000${link.targetViewId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([link.sourceViewId, link.targetViewId]);
    }
  }
  return edges;
}

/**
 * True when adding `candidate` (`source -> target`) would make `source`
 * reachable from `target`, i.e. close a directed cycle (ADR-012 §1/R-3).
 * Bounded DFS over the deduped edge set; multiple incoming edges at rest are
 * legal and only a directed cycle is refused.
 */
function closesCycle(
  edges: ReadonlyArray<readonly [string, string]>,
  candidate: readonly [string, string],
): boolean {
  const adjacency = new Map<string, string[]>();
  for (const [from, to] of [...edges, candidate]) {
    const list = adjacency.get(from);
    if (list === undefined) adjacency.set(from, [to]);
    else list.push(to);
  }
  const source = candidate[0];
  const stack: string[] = [candidate[1]];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop() as string;
    if (node === source) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const next of adjacency.get(node) ?? []) stack.push(next);
  }
  return false;
}

/**
 * Regenerates a view's frozen projection with `link` appended when it is not
 * already present; a structurally identical link is an idempotent no-op. The
 * view's own `state`/`camera`/`locks`/`provenance` are preserved by reference:
 * inter-study registration shares no absolute state.
 */
function recordLink(view: PreparedView, link: InterStudyLink): PreparedView {
  if (view.links.some((existing) => structurallyEqual(existing, link))) {
    return view;
  }
  // Intra-package composition, NOT a validation bypass: `link` already passed
  // `assertViewLinkEligible` + `assertInterStudyLinkAdmissible`, and
  // `assemblePreparedView` re-validates, re-correlates and re-freezes the
  // regenerated view. `replaceRegisteredPreparedView` is the deliberately
  // internal P4.3 projection swap (ADR-011 §3), used so the registry remains
  // the single mutation path that cannot skip the C5 provenance gate.
  return assemblePreparedView({
    preparedViewId: view.id,
    state: view.state,
    provenance: view.provenance,
    links: [...view.links, link],
    locks: view.locks,
    ...(view.cachedPreviewReference === undefined
      ? {}
      : { cachedPreviewReference: view.cachedPreviewReference }),
  });
}

/**
 * Registers `input.link` between two registered prepared views.
 *
 * @throws LinkError `LINK_MALFORMED` (not a ViewLink / not inter-study),
 * `LINK_RELATIVE_MODE_UNSUPPORTED`, `LINK_TRANSFORM_INVALID`,
 * `LINK_TRANSFORM_ERROR_MARGIN_MISSING`,
 * `LINK_REGISTRATION_ERROR_EXCEEDS_TOLERANCE`, `LINK_SELF_REFERENCE`,
 * `LINK_VIEW_MISMATCH`, `LINK_SHARED_STATE_CONFLICT`,
 * `LINK_INTER_STUDY_TRANSFORM_FRAME_MISMATCH` or `LINK_PROPAGATION_CYCLE`.
 * @throws CoReferenceError propagated from eligibility for a co-referenced link.
 * @throws PreparedViewError for an unknown prepared view id.
 */
export function registerInterStudyLink(input: RegisterInterStudyLinkInput): RegisteredInterStudyLink {
  const { link, sourcePreparedViewId, targetPreparedViewId, preparedViews, sharedStateGroups, lookupAsset } = input;

  // Fail closed on a malformed runtime payload before reading any field (this
  // API is reachable from untyped / IPC callers in Fase 6-7).
  if (!isViewLink(link)) {
    throw new LinkError(
      'LINK_MALFORMED',
      `Cannot register a malformed ViewLink between ${describeViews(sourcePreparedViewId, targetPreparedViewId)}. Remediation: pass a structurally valid inter-study ViewLink (kind 'inter-study' with mode 'transformed' and a Procrustes/landmark SpatialTransform).`,
    );
  }
  if (link.kind !== 'inter-study') {
    throw new LinkError(
      'LINK_MALFORMED',
      `This API registers inter-study links only, but received kind '${link.kind}' for ${describeViews(sourcePreparedViewId, targetPreparedViewId)}. Remediation: use registerInterStudyLink only for kind 'inter-study'; apply co-referenced intra-study links through applyCoReferencedLink.`,
    );
  }

  // P4.4 eligibility (unchanged) runs before admission, then the one-shot
  // admission gate. Both are read-only, so a refusal touches no registry.
  assertViewLinkEligible({ link, lookupAsset });
  assertInterStudyLinkAdmissible(link);

  const source = preparedViews.get(sourcePreparedViewId);
  const target = preparedViews.get(targetPreparedViewId);

  if (
    sourcePreparedViewId === targetPreparedViewId ||
    link.sourceViewId === link.targetViewId ||
    source.sourceViewId === target.sourceViewId
  ) {
    throw new LinkError(
      'LINK_SELF_REFERENCE',
      `${describeViews(sourcePreparedViewId, targetPreparedViewId)} resolve to the same view '${source.sourceViewId}'. Remediation: register an inter-study link between two distinct prepared views whose source view ids differ.`,
    );
  }
  if (source.sourceViewId !== link.sourceViewId || target.sourceViewId !== link.targetViewId) {
    throw new LinkError(
      'LINK_VIEW_MISMATCH',
      `${describeViews(sourcePreparedViewId, targetPreparedViewId)} resolve to source view '${source.sourceViewId}' and target view '${target.sourceViewId}', but the link declares '${link.sourceViewId}' -> '${link.targetViewId}'. Remediation: pass the prepared views whose sourceViewId matches the link endpoints, in the same order.`,
    );
  }

  const sourceGroup = sharedStateGroups.groupOf(source.id);
  const targetGroup = sharedStateGroups.groupOf(target.id);
  if (sourceGroup !== undefined || targetGroup !== undefined) {
    const offenders = [sourceGroup, targetGroup].filter((group) => group !== undefined).map((group) => group.id);
    throw new LinkError(
      'LINK_SHARED_STATE_CONFLICT',
      `${describeViews(sourcePreparedViewId, targetPreparedViewId)} are attached to shared-state group(s) [${offenders.join(', ')}], but inter-study views never share absolute state. Remediation: detach both endpoints before registering the inter-study link.`,
    );
  }

  if (
    source.state.spatial.frameOfReferenceUID !== link.sourceFrameOfReferenceUID ||
    target.state.spatial.frameOfReferenceUID !== link.targetFrameOfReferenceUID
  ) {
    throw new LinkError(
      'LINK_INTER_STUDY_TRANSFORM_FRAME_MISMATCH',
      `${describe(source, target)} declare FrameOfReferenceUID '${source.state.spatial.frameOfReferenceUID}' -> '${target.state.spatial.frameOfReferenceUID}' while the link declares '${link.sourceFrameOfReferenceUID}' -> '${link.targetFrameOfReferenceUID}'. Remediation: register the link against views whose spatial FrameOfReferenceUID matches the link endpoints exactly.`,
    );
  }

  if (closesCycle(collectInterStudyEdges(preparedViews.list()), [link.sourceViewId, link.targetViewId])) {
    throw new LinkError(
      'LINK_PROPAGATION_CYCLE',
      `Registering edge '${link.sourceViewId}' -> '${link.targetViewId}' would close a directed cycle in the inter-study graph. Remediation: inter-study propagation is a mandatory DAG (ADR-012 R-3); remove the edge that closes the cycle or model the views without a bidirectional path.`,
    );
  }

  // Both projections are staged before either is published, so a staging
  // failure leaves the registry untouched; the two swaps are then infallible.
  const nextSource = recordLink(source, link);
  const nextTarget = recordLink(target, link);
  const publishedSource = replaceRegisteredPreparedView(preparedViews, nextSource);
  const publishedTarget = replaceRegisteredPreparedView(preparedViews, nextTarget);

  // Return the canonical frozen link instance (idempotent re-registration of a
  // structurally equal but distinct link must not freeze the caller's object).
  const canonicalLink =
    publishedSource.links.find(
      (candidate): candidate is InterStudyLink =>
        candidate.kind === 'inter-study' && structurallyEqual(candidate, link),
    ) ?? link;
  return deepFreeze({ link: canonicalLink, source: publishedSource, target: publishedTarget });
}

function describe(source: PreparedView, target: PreparedView): string {
  return `Prepared views '${source.id}' ('${source.sourceViewId}') and '${target.id}' ('${target.sourceViewId}')`;
}
