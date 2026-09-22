/**
 * @nuclear/view-engine — apply a co-referenced link (P4.4, ADR-011 §3).
 *
 * Applying a link never mutates a published/frozen `PreparedView` in place. It
 * goes through the P4.3 shared-state projection path: resolve or create the
 * shared-state group, attach both views atomically, then regenerate each
 * frozen projection with the recorded link and swap it through the internal
 * `replaceRegisteredPreparedView` primitive. `PreparedViewId` identity and
 * registry order stay stable; re-applying the same link is idempotent.
 *
 * Fail-closed: full eligibility (including `assertCoReferenceEligibility`) runs
 * before any registry lookup or mutation, so a refused link leaves the
 * registry, every group and every view unchanged. Steps after validation are
 * each atomic (P4.3); a staging failure propagates without partial mutation.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type {
  AssetId,
  ImagingAsset,
  IntraStudyLink,
  PreparedView,
  PreparedViewId,
  ViewLink,
} from '@nuclear/shared-types';
import { LinkError } from './errors.js';
import { assertViewLinkEligible } from './eligibility.js';
import { isViewLink } from './guards.js';
import { assemblePreparedView } from '../prepared-view/index.js';
import type { PreparedViewRegistry } from '../prepared-view/index.js';
import { replaceRegisteredPreparedView } from '../prepared-view/registry.js';
import type { SharedStateGroup, SharedStateGroupId, SharedStateGroupRegistry } from '../shared-state/index.js';
import { structurallyEqual } from '../internal/json-equality.js';
import { deepFreeze } from '../internal/deep-freeze.js';

export interface ApplyCoReferencedLinkInput {
  readonly link: ViewLink;
  readonly sourcePreparedViewId: PreparedViewId;
  readonly targetPreparedViewId: PreparedViewId;
  readonly sharedStateGroupId: SharedStateGroupId;
  readonly preparedViews: PreparedViewRegistry;
  readonly sharedStateGroups: SharedStateGroupRegistry;
  readonly lookupAsset: (assetId: AssetId) => ImagingAsset | undefined;
}

export interface AppliedCoReferencedLink {
  readonly link: IntraStudyLink;
  readonly source: PreparedView;
  readonly target: PreparedView;
  readonly sharedStateGroupId: SharedStateGroupId;
}

function describeViews(sourcePreparedViewId: PreparedViewId, targetPreparedViewId: PreparedViewId): string {
  return `prepared views '${sourcePreparedViewId}' and '${targetPreparedViewId}'`;
}

/**
 * Regenerates a view's frozen projection with `link` appended when it is not
 * already present. The shared spatial/camera come from the resolved group; a
 * structurally identical link is a no-op that returns the same object.
 */
function recordLink(
  registry: PreparedViewRegistry,
  view: PreparedView,
  link: IntraStudyLink,
  group: SharedStateGroup,
): PreparedView {
  if (view.links.some((existing) => structurallyEqual(existing, link))) {
    return view;
  }
  const next = assemblePreparedView({
    preparedViewId: view.id,
    state: { ...view.state, spatial: group.spatial, camera: group.camera },
    provenance: view.provenance,
    links: [...view.links, link],
    locks: view.locks,
    ...(view.cachedPreviewReference === undefined
      ? {}
      : { cachedPreviewReference: view.cachedPreviewReference }),
  });
  // Intra-package composition, NOT a validation bypass: `link` has already
  // passed `assertViewLinkEligible` (which composes `assertCoReferenceEligibility`),
  // and `assemblePreparedView` re-validates and re-freezes the regenerated view.
  // `replaceRegisteredPreparedView` is the deliberately internal P4.3
  // projection swap (ADR-011 §3), used here so the registry remains the single
  // mutation path instead of exposing a public replace that could skip the
  // C5/ADR-010 §7.3 provenance-correlation gate.
  return replaceRegisteredPreparedView(registry, next);
}

/**
 * The P4.3 `SharedStateGroup` models one indivisible `{ spatial, camera }`
 * pair. A co-referenced application may therefore synchronize exactly that set
 * (any order, no duplicates); an empty, partial or presentation-only
 * `synchronizedState` would silently mutate state the link did not declare, so
 * it fails closed before any registry access.
 */
function assertSynchronizablePair(link: IntraStudyLink): void {
  const states = link.synchronizedState;
  const unique = new Set(states);
  const isPair =
    states.length === 2 && unique.size === 2 && unique.has('spatial') && unique.has('camera');
  if (isPair) {
    return;
  }
  throw new LinkError(
    'LINK_APPLICATION_UNSUPPORTED_SYNCHRONIZED_STATE',
    `Cannot apply co-referenced link '${link.sourceViewId}' -> '${link.targetViewId}' with synchronizedState [${states
      .map((state) => String(state))
      .join(', ')}]: a shared-state group models the indivisible {spatial, camera} pair only. Remediation: declare synchronizedState as exactly {spatial, camera} (any order, no duplicates), or do not apply a link that must keep other states view-local.`,
  );
}

/**
 * Applies `input.link` between two registered prepared views and returns the
 * final registered projections plus the resolved shared-state group id.
 *
 * @throws LinkError for a non-co-referenced link, self-reference, a source /
 * target view-id mismatch, a shared-state conflict or any eligibility refusal.
 * @throws CoReferenceError propagated from `assertCoReferenceEligibility`.
 * @throws PreparedViewError for an unknown prepared view id.
 */
export function applyCoReferencedLink(input: ApplyCoReferencedLinkInput): AppliedCoReferencedLink {
  const {
    link,
    sourcePreparedViewId,
    targetPreparedViewId,
    sharedStateGroupId,
    preparedViews,
    sharedStateGroups,
    lookupAsset,
  } = input;

  // Fail closed on a malformed runtime payload BEFORE reading any field, so a
  // null / primitive / unknown-discriminant `link` yields a typed `LinkError`
  // rather than an untyped `TypeError`. The input is typed `ViewLink`, but this
  // API is also reachable from untyped / IPC callers (Fase 6-7).
  if (!isViewLink(link)) {
    throw new LinkError(
      'LINK_MALFORMED',
      `Cannot apply a malformed ViewLink between ${describeViews(sourcePreparedViewId, targetPreparedViewId)}. Remediation: pass a structurally valid ViewLink (kind 'co-referenced' with worker-verified geometry evidence, or kind 'inter-study' with a differential/transform) and all required fields.`,
    );
  }

  if (link.kind !== 'co-referenced') {
    throw new LinkError(
      'LINK_APPLICATION_REQUIRES_CO_REFERENCE',
      `Cannot apply ViewLink kind '${link.kind}' between ${describeViews(sourcePreparedViewId, targetPreparedViewId)}: only a co-referenced intra-study link may share absolute spatial/camera state. Remediation: declare a co-referenced link over worker-verified geometry in one Frame of Reference, or resolve the inter-study relative/transformed link without sharing state.`,
    );
  }

  // Full eligibility (structural + semantic + co-reference) BEFORE any registry
  // read or write, so a refused link leaves the workspace untouched.
  assertViewLinkEligible({ link, lookupAsset });

  // The shared-state group can only carry the indivisible {spatial, camera}
  // pair, so refuse any other synchronizedState before touching the registry.
  assertSynchronizablePair(link);

  const source = preparedViews.get(sourcePreparedViewId);
  const target = preparedViews.get(targetPreparedViewId);
  if (sourcePreparedViewId === targetPreparedViewId) {
    throw new LinkError(
      'LINK_SELF_REFERENCE',
      `${describeViews(sourcePreparedViewId, targetPreparedViewId)} resolve to the same prepared view '${source.id}'. Remediation: co-reference two distinct prepared views (their source view ids must differ).`,
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
  if (sourceGroup !== undefined && targetGroup !== undefined && sourceGroup.id !== targetGroup.id) {
    throw new LinkError(
      'LINK_SHARED_STATE_CONFLICT',
      `${describeViews(sourcePreparedViewId, targetPreparedViewId)} are already attached to different shared-state groups '${sourceGroup.id}' and '${targetGroup.id}'. Remediation: detach both views before co-referencing them into a single shared-state group.`,
    );
  }

  let group = sourceGroup ?? targetGroup;
  if (group === undefined) {
    group = sharedStateGroups.hasGroup(sharedStateGroupId)
      ? sharedStateGroups.getGroup(sharedStateGroupId)
      : sharedStateGroups.createGroup({
          id: sharedStateGroupId,
          spatial: source.state.spatial,
          camera: source.state.camera,
        });
  }

  // Each attach is the P4.3 atomic projection path; a view already in `group`
  // is left untouched. After that, every remaining step is infallible.
  if (sharedStateGroups.groupOf(source.id) === undefined) {
    sharedStateGroups.attach(group.id, source.id);
  }
  if (sharedStateGroups.groupOf(target.id) === undefined) {
    sharedStateGroups.attach(group.id, target.id);
  }

  const finalSource = recordLink(preparedViews, preparedViews.get(source.id), link, group);
  const finalTarget = recordLink(preparedViews, preparedViews.get(target.id), link, group);

  // Resolve the canonical recorded link from the final source projection so
  // the returned `link` is the frozen stored instance even on the idempotent
  // path (where the caller's object was never published/frozen). The wrapper
  // is deep-frozen too; source/target are already frozen plain objects, so
  // this is idempotent.
  const canonicalLink =
    finalSource.links.find(
      (candidate): candidate is IntraStudyLink =>
        candidate.kind === 'co-referenced' && structurallyEqual(candidate, link),
    ) ?? link;
  return deepFreeze({
    link: canonicalLink,
    source: finalSource,
    target: finalTarget,
    sharedStateGroupId: group.id,
  });
}
