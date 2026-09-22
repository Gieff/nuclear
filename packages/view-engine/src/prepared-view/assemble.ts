/**
 * @nuclear/view-engine — PreparedView assembly (P4.2).
 *
 * Assembly is a pure value operation: it consumes an already-defined
 * `MedicalViewState` plus its `ViewProvenance` and produces a serializable
 * `PreparedView`. It issues **no** `ResourceManager` call and never pins RAM or
 * VRAM — only P4.7 declares demand from a prepared view.
 *
 * Identity rule (deliberate): `state` and `provenance` are stored **by
 * reference** — no JSON clone, no spread of their contents. Only `links` and
 * `locks` are copied into new arrays. P4.3 shared-state groups rely on the
 * same `MedicalViewState` object reference surviving across views, so cloning
 * here would silently break observability of identity.
 *
 * Immutability rule (ADR-011 §1/§4): the assembled `PreparedView` and every
 * value reachable from it (`links`, `locks`, `provenance`, the referenced
 * `state` and `cachedPreviewReference`) are deep-frozen **in place** at
 * publication, so a consumer cannot mutate canonical state through the
 * reference. Freezing is applied after all validation, so a refused assembly
 * never freezes the caller's input. P4.3 replaces shared state atomically; it
 * does not mutate these frozen values.
 *
 * `sourceViewId` is derived from `MedicalViewState.id`; there is deliberately
 * no separate input that could disagree with the state it describes.
 */
import type {
  AssetId,
  CachedPreviewReference,
  CompositionState,
  MedicalViewState,
  PreparedView,
  PreparedViewId,
  StateLock,
  ViewLink,
  ViewProvenance,
} from '@nuclear/shared-types';
import { PreparedViewError } from './errors.js';
import { deepFreeze } from '../internal/deep-freeze.js';

export interface AssemblePreparedViewInput {
  readonly preparedViewId: PreparedViewId;
  readonly state: MedicalViewState;
  readonly provenance: ViewProvenance | undefined;
  readonly links?: readonly ViewLink[];
  readonly locks?: readonly StateLock[];
  readonly cachedPreviewReference?: CachedPreviewReference;
}

function compositionBindingAssetIds(composition: CompositionState): readonly AssetId[] {
  // Single-layer states bind each layer directly; fusion/multi-layer states
  // wrap every layer in a `CompositionLayer` with an explicit binding.
  if (composition.mode === 'single') {
    return composition.layers.map((layer) => layer.assetId);
  }
  return composition.layers.map((layer) => layer.binding.assetId);
}

/** All asset ids bound by the state (dataBinding + every composition layer binding). */
export function boundAssetIds(state: MedicalViewState): readonly AssetId[] {
  const bound = [state.dataBinding.assetId, ...compositionBindingAssetIds(state.composition)];
  const unique: AssetId[] = [];
  for (const assetId of bound) {
    if (!unique.includes(assetId)) unique.push(assetId);
  }
  return unique;
}

function quoteAll(ids: readonly AssetId[]): string {
  return ids.map((assetId) => `'${assetId}'`).join(', ');
}

function assertDuplicateLocks(preparedViewId: PreparedViewId, locks: readonly StateLock[]): void {
  const seen = new Set<string>();
  for (const lock of locks) {
    const key = `${lock.state}\u0000${lock.owner}`;
    if (seen.has(key)) {
      throw new PreparedViewError(
        'PREPARED_VIEW_DUPLICATE_LOCK',
        `Prepared view '${preparedViewId}' declares duplicate locks for state '${lock.state}' owned by '${lock.owner}'. Remediation: declare at most one lock per state and owner.`,
      );
    }
    seen.add(key);
  }
}

function resolveProvenance(
  preparedViewId: PreparedViewId,
  state: MedicalViewState,
  provenance: ViewProvenance | undefined,
): ViewProvenance {
  if (provenance === undefined) {
    throw new PreparedViewError(
      'PREPARED_VIEW_MISSING_PROVENANCE',
      `Prepared view '${preparedViewId}' for source view '${state.id}' has no ViewProvenance. Remediation: assemble the view from a bound state whose provenance records its trial sources and fingerprints.`,
    );
  }
  if (provenance.sourceAssetIds.length === 0 || provenance.sourceFingerprints.length === 0) {
    throw new PreparedViewError(
      'PREPARED_VIEW_EMPTY_PROVENANCE',
      `Prepared view '${preparedViewId}' for source view '${state.id}' has an empty provenance (sourceAssetIds: ${provenance.sourceAssetIds.length}, sourceFingerprints: ${provenance.sourceFingerprints.length}). Remediation: provenance must record at least one source asset and its fingerprint before assembly.`,
    );
  }
  return provenance;
}

export function assemblePreparedView(input: AssemblePreparedViewInput): PreparedView {
  const { preparedViewId, state, links, locks } = input;
  const provenance = resolveProvenance(preparedViewId, state, input.provenance);

  // `sourceViewId` is derived, never taken as a separate input that could
  // disagree with `state.id`.
  const sourceViewId = state.id;
  const bound = boundAssetIds(state);
  const declared = new Set<AssetId>(provenance.sourceAssetIds);
  const missing = bound.filter((assetId) => !declared.has(assetId));
  if (missing.length > 0) {
    throw new PreparedViewError(
      'PREPARED_VIEW_BINDING_NOT_IN_PROVENANCE',
      `Prepared view '${preparedViewId}' (source view '${sourceViewId}') binds asset id(s) ${quoteAll(missing)} that are absent from ViewProvenance.sourceAssetIds [${quoteAll(provenance.sourceAssetIds)}]. Remediation: add the missing asset(s) and their fingerprints to the provenance before assembling the prepared view.`,
    );
  }

  const resolvedLocks = locks ?? [];
  assertDuplicateLocks(preparedViewId, resolvedLocks);

  const view: PreparedView = {
    id: preparedViewId,
    sourceViewId,
    state,
    links: links === undefined ? [] : [...links],
    locks: locks === undefined ? [] : [...locks],
    provenance,
    ...(input.cachedPreviewReference === undefined
      ? {}
      : { cachedPreviewReference: input.cachedPreviewReference }),
  };
  return deepFreeze(view);
}
