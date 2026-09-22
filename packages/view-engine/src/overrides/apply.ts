/**
 * @nuclear/view-engine — local view override resolution (P4.5, ADR-010 §4).
 *
 * A `LocalViewOverride` diverges a single `ComposerViewInstanceId` from its
 * source `PreparedView` without touching canonical state. Resolution is a pure
 * value operation: it validates the override fail-closed, builds a fresh merged
 * `MedicalViewState`, then publishes one deep-frozen `ResolvedLocalView`. The
 * source view is never mutated or re-registered, and no registry is written.
 *
 * Deliberate semantics (ADR-010 §4): a local override is NOT blocked by a
 * `StateLock`. A lock protects canonical state; an override is a local
 * divergence that does not change it, so `../locks/guard` is intentionally not
 * consulted here. Only canonical mutations (`SharedStateGroupRegistry.replace`
 * / `attach`) enforce locks.
 *
 * Validation order (all before any freeze):
 *   a. structural shape of the override;
 *   b. `sourceViewId` identity;
 *   c. duplicate override states;
 *   d. applicability to the source state (presentation/composition rules).
 *
 * Scope note: this resolver enforces the override envelope shape, JSON safety
 * and the composition applicability/coherence rules. It does NOT deep-validate
 * a substituted value's clinical shape (e.g. a full `SpatialState`); the typed
 * `ViewStateOverride` union is the caller's contract. P4.6 must either validate
 * before consuming a `ResolvedLocalView` or ratify this boundary.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type {
  CompositionState,
  DataBinding,
  LocalViewOverride,
  MedicalViewState,
  PreparedView,
  PreparedViewId,
  ViewId,
  ViewStateOverride,
} from '@nuclear/shared-types';
import type { ComposerViewInstanceId } from '@nuclear/shared-types';
import { OverrideError } from './errors.js';
import { assertSerializableValue } from '../workspace/value-integrity.js';
import { deepFreeze } from '../internal/deep-freeze.js';

/** The frozen local divergence produced by {@link resolveLocalViewOverride}. */
export interface ResolvedLocalView {
  readonly targetComposerViewInstanceId: ComposerViewInstanceId;
  readonly sourceViewId: ViewId;
  readonly sourcePreparedViewId: PreparedViewId;
  readonly state: MedicalViewState;
}

const OVERRIDE_STATES: readonly ViewStateOverride['state'][] = [
  'spatial',
  'camera',
  'presentation',
  'projection',
  'composition',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural `CompositionState` shape: a known mode and a non-empty layer array. */
function isCompositionShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.mode !== 'single' && value.mode !== 'fusion' && value.mode !== 'multi-layer') {
    return false;
  }
  return Array.isArray(value.layers) && value.layers.length > 0;
}

function malformed(detail: string): never {
  throw new OverrideError(
    'OVERRIDE_MALFORMED',
    `A LocalViewOverride is malformed: ${detail}. Remediation: pass a plain object with string 'sourceViewId' and 'targetComposerViewInstanceId' and a non-empty 'overrides' array of { state, value } entries whose 'state' is one of ${OVERRIDE_STATES.map((state) => `'${state}'`).join(', ')}.`,
  );
}

/**
 * Validates the structural shape of `override` (step a) and returns the entries.
 * Only shape is proven here; value applicability is checked separately so the
 * failure code names the exact reason.
 */
function validateShape(override: LocalViewOverride): readonly ViewStateOverride[] {
  if (!isRecord(override)) {
    malformed('the value is not a plain object');
  }
  if (typeof override.sourceViewId !== 'string') {
    malformed("'sourceViewId' must be a string");
  }
  if (typeof override.targetComposerViewInstanceId !== 'string') {
    malformed("'targetComposerViewInstanceId' must be a string");
  }
  const entries: unknown = override.overrides;
  if (!Array.isArray(entries)) {
    malformed("'overrides' must be an array");
  }
  if (entries.length === 0) {
    throw new OverrideError(
      'OVERRIDE_EMPTY',
      `Local view override for composer instance '${override.targetComposerViewInstanceId}' declares no overrides. Remediation: provide at least one { state, value } entry (${OVERRIDE_STATES.map((state) => `'${state}'`).join(', ')}), or omit the override entirely.`,
    );
  }
  for (let index = 0; index < entries.length; index += 1) {
    const entry: unknown = entries[index];
    if (!isRecord(entry)) {
      malformed(`overrides[${index}] is not a plain object`);
    }
    if (!OVERRIDE_STATES.includes(entry.state as ViewStateOverride['state'])) {
      malformed(
        `overrides[${index}].state '${String(entry.state)}' is not a lockable view state`,
      );
    }
    if (!('value' in entry)) {
      malformed(`overrides[${index}] has no 'value'`);
    }
    if (entry.state === 'composition' && !isCompositionShape(entry.value)) {
      malformed(
        `overrides[${index}].value is not a structurally valid CompositionState (expected mode 'single'|'fusion'|'multi-layer' and a non-empty layers array)`,
      );
    }
  }
  return entries as readonly ViewStateOverride[];
}

function describe(override: LocalViewOverride, preparedViewId: PreparedViewId): string {
  return `local view override for composer instance '${override.targetComposerViewInstanceId}' (prepared view '${preparedViewId}')`;
}

/** Refuses an override state that cannot apply to `source`. */
function notApplicable(
  override: LocalViewOverride,
  preparedViewId: PreparedViewId,
  detail: string,
): never {
  throw new OverrideError(
    'OVERRIDE_STATE_NOT_APPLICABLE',
    `${describe(override, preparedViewId)} is not applicable: ${detail}. Remediation: override only state compatible with the source composition; presentation requires a 'single' composition, and a composition override must keep the source composition variant class and stay coherent with dataBinding.`,
  );
}

function isSameCompositionVariant(source: CompositionState, next: unknown): boolean {
  const nextMode = isRecord(next) && typeof next.mode === 'string' ? next.mode : undefined;
  if (nextMode === undefined) {
    return false;
  }
  return (source.mode === 'single') === (nextMode === 'single');
}

function isCoherentWithDataBinding(binding: DataBinding, composition: unknown): boolean {
  if (
    !isRecord(composition) ||
    !Array.isArray(composition.layers) ||
    composition.layers.length === 0
  ) {
    return false;
  }
  const first: unknown = composition.layers[0];
  if (composition.mode === 'single') {
    if (!isRecord(first)) {
      return false;
    }
    return first.assetId === binding.assetId && first.role === binding.role;
  }
  if (!isRecord(first) || !isRecord(first.binding)) {
    return false;
  }
  return first.binding.assetId === binding.assetId && first.binding.role === binding.role;
}

/** Step d: applicability of every override state to the source state. */
function assertApplicable(
  source: PreparedView,
  override: LocalViewOverride,
  entries: readonly ViewStateOverride[],
): void {
  const sourceComposition = source.state.composition;
  for (const entry of entries) {
    if (entry.state === 'presentation' && sourceComposition.mode !== 'single') {
      notApplicable(
        override,
        source.id,
        `'presentation' is a single-layer state but the source composition mode is '${sourceComposition.mode}'`,
      );
    }
    if (entry.state === 'composition') {
      if (!isSameCompositionVariant(sourceComposition, entry.value)) {
        notApplicable(
          override,
          source.id,
          `a composition override must keep the source variant class ('${sourceComposition.mode}' -> '${entry.value.mode}')`,
        );
      }
      if (!isCoherentWithDataBinding(source.state.dataBinding, entry.value)) {
        notApplicable(
          override,
          source.id,
          `the overridden composition's first layer must match dataBinding asset '${source.state.dataBinding.assetId}' / role '${source.state.dataBinding.role}'`,
        );
      }
    }
  }
}

/** Applies one override to a *fresh* state container, never to `state` itself. */
function applyEntry(state: MedicalViewState, entry: ViewStateOverride): MedicalViewState {
  switch (entry.state) {
    case 'spatial':
      return { ...state, spatial: entry.value };
    case 'camera':
      return { ...state, camera: entry.value };
    case 'projection':
      return { ...state, projection: entry.value };
    case 'presentation':
      return { ...state, presentation: entry.value };
    case 'composition':
      // Variant-class preservation (checked in `assertApplicable`) makes this
      // cast a no-op at runtime; the merged container is validated below.
      return { ...state, composition: entry.value } as MedicalViewState;
  }
}

/**
 * Resolves `override` against `source` and returns one deep-frozen
 * `ResolvedLocalView`. `source` and `override` are never mutated; no registry is
 * written. Fail-closed on a malformed, mismatched, empty, duplicated or
 * inapplicable override, in that order, before any value is frozen.
 */
export function resolveLocalViewOverride(
  source: PreparedView,
  override: LocalViewOverride,
): ResolvedLocalView {
  const entries = validateShape(override);

  if (override.sourceViewId !== source.sourceViewId) {
    throw new OverrideError(
      'OVERRIDE_SOURCE_MISMATCH',
      `Local view override for composer instance '${override.targetComposerViewInstanceId}' targets source view '${override.sourceViewId}', but prepared view '${source.id}' is derived from source view '${source.sourceViewId}'. Remediation: set LocalViewOverride.sourceViewId to '${source.sourceViewId}' (the source view of prepared view '${source.id}').`,
    );
  }

  const seen = new Set<ViewStateOverride['state']>();
  for (const entry of entries) {
    if (seen.has(entry.state)) {
      throw new OverrideError(
        'OVERRIDE_DUPLICATE_STATE',
        `${describe(override, source.id)} declares state '${entry.state}' more than once. Remediation: merge the values into a single '${entry.state}' entry; each state may be overridden at most once.`,
      );
    }
    seen.add(entry.state);
  }

  assertApplicable(source, override, entries);

  let merged: MedicalViewState = source.state;
  for (const entry of entries) {
    merged = applyEntry(merged, entry);
  }

  assertSerializableValue(
    merged,
    `local view override for '${override.targetComposerViewInstanceId}'`,
  );
  deepFreeze(merged);

  const resolved: ResolvedLocalView = {
    targetComposerViewInstanceId: override.targetComposerViewInstanceId,
    sourceViewId: source.sourceViewId,
    sourcePreparedViewId: source.id,
    state: merged,
  };
  return deepFreeze(resolved);
}
