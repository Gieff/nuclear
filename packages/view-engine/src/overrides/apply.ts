/**
 * @nuclear/view-engine — local view override resolution (P4.5, ADR-010 §4).
 *
 * A `LocalViewOverride` diverges a single `ComposerViewInstanceId` from its
 * source `PreparedView` without touching canonical state. Resolution is a pure
 * value operation: validate fail-closed, deep-validate and clone every
 * substituted value, build a fresh merged `MedicalViewState`, then publish one
 * deep-frozen `ResolvedLocalView`. The source view is never mutated or
 * re-registered; the caller's `override`/value objects are never frozen or
 * mutated (only the clones enter the merged state); no registry is written.
 *
 * Deliberate (ADR-010 §4): a local override is NOT blocked by a `StateLock` —
 * a lock protects canonical state, while an override is a local divergence that
 * does not change it, so `../locks/guard` is intentionally not consulted.
 *
 * Validation order (all before any freeze):
 *   MALFORMED -> SOURCE_MISMATCH -> EMPTY -> DUPLICATE_STATE ->
 *   STATE_MALFORMED (deep clinical shape) -> STATE_NOT_APPLICABLE.
 *
 * C5a: step STATE_MALFORMED uses the product mirror `./validate.ts`; a
 * non-serializable value that slips past the shape check is rethrown typed.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type {
  CameraState,
  CompositionState,
  ComposerViewInstanceId,
  LocalViewOverride,
  MedicalViewState,
  PreparedView,
  PreparedViewId,
  PresentationState,
  ProjectionState,
  SpatialState,
  ViewId,
  ViewStateOverride,
} from '@nuclear/shared-types';
import { OverrideError } from './errors.js';
import { WorkspaceError } from '../workspace/errors.js';
import { assertSerializableValue, cloneSerializableValue } from '../workspace/value-integrity.js';
import { deepFreeze } from '../internal/deep-freeze.js';
import {
  isCoherentWithDataBinding,
  isSameCompositionVariant,
  STATE_EXPECTATIONS,
  STATE_VALIDATORS,
} from './validate.js';

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

function malformed(detail: string): never {
  throw new OverrideError(
    'OVERRIDE_MALFORMED',
    `A LocalViewOverride is malformed: ${detail}. Remediation: pass a plain object with string 'sourceViewId' and 'targetComposerViewInstanceId' and a non-empty 'overrides' array of { state, value } entries whose 'state' is one of ${OVERRIDE_STATES.map((state) => `'${state}'`).join(', ')}.`,
  );
}

/**
 * Step a: validates the structural override envelope and returns its entries.
 * Envelope only — clinical shape/applicability are checked separately so the
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
  for (let index = 0; index < entries.length; index += 1) {
    const entry: unknown = entries[index];
    if (!isRecord(entry)) {
      malformed(`overrides[${index}] is not a plain object`);
    }
    if (!OVERRIDE_STATES.includes(entry.state as ViewStateOverride['state'])) {
      malformed(`overrides[${index}].state '${String(entry.state)}' is not a lockable view state`);
    }
    if (!('value' in entry)) {
      malformed(`overrides[${index}] has no 'value'`);
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

/** Refuses a substituted value that is clinically malformed or non-serializable. */
function stateMalformed(
  override: LocalViewOverride,
  state: ViewStateOverride['state'],
  expectation: string,
  cause?: unknown,
): never {
  const causeText =
    cause === undefined
      ? ''
      : ` (value-integrity failure: ${cause instanceof Error ? cause.message : String(cause)})`;
  throw new OverrideError(
    'OVERRIDE_STATE_MALFORMED',
    `Local view override for composer instance '${override.targetComposerViewInstanceId}' declares a malformed '${state}' value: expected ${expectation}${causeText}. Remediation: provide a '${state}' value that satisfies the clinical contract before resolving the override; the resolver refuses to merge an unvalidated or non-serializable value.`,
    cause === undefined ? {} : { cause },
  );
}

/** Step e: deep-validates one substituted value against its clinical contract. */
function validateEntry(override: LocalViewOverride, entry: ViewStateOverride): void {
  if (!STATE_VALIDATORS[entry.state](entry.value)) {
    stateMalformed(override, entry.state, STATE_EXPECTATIONS[entry.state]);
  }
}

/** Step f: applicability of every override state to the source state. */
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

/** Clones a validated value; a non-serializable value becomes a typed refusal. */
function cloneValue<T>(
  value: T,
  override: LocalViewOverride,
  state: ViewStateOverride['state'],
): T {
  try {
    return cloneSerializableValue(
      value,
      `local view override '${override.targetComposerViewInstanceId}' ${state}`,
    );
  } catch (error) {
    if (error instanceof WorkspaceError) {
      stateMalformed(override, state, STATE_EXPECTATIONS[state], error);
    }
    throw error;
  }
}

/** Applies one cloned override to a *fresh* container, never to `container`. */
function applyEntry(
  container: MedicalViewState,
  entry: ViewStateOverride,
  override: LocalViewOverride,
): MedicalViewState {
  switch (entry.state) {
    case 'spatial':
      return { ...container, spatial: cloneValue<SpatialState>(entry.value, override, 'spatial') };
    case 'camera':
      return { ...container, camera: cloneValue<CameraState>(entry.value, override, 'camera') };
    case 'projection':
      return {
        ...container,
        projection: cloneValue<ProjectionState>(entry.value, override, 'projection'),
      };
    case 'presentation':
      return {
        ...container,
        presentation: cloneValue<PresentationState>(entry.value, override, 'presentation'),
      };
    case 'composition':
      // Variant-class preservation (checked in `assertApplicable`) makes this
      // cast a no-op at runtime; the merged container is validated below.
      return {
        ...container,
        composition: cloneValue<CompositionState>(entry.value, override, 'composition'),
      } as MedicalViewState;
  }
}

/**
 * Resolves `override` against `source` and returns one deep-frozen
 * `ResolvedLocalView`. `source` and `override` are never mutated or frozen; no
 * registry is written. Fail-closed on a malformed, mismatched, empty,
 * duplicated, clinically-malformed or inapplicable override, in that order,
 * before any value is frozen.
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

  if (entries.length === 0) {
    throw new OverrideError(
      'OVERRIDE_EMPTY',
      `Local view override for composer instance '${override.targetComposerViewInstanceId}' declares no overrides. Remediation: provide at least one { state, value } entry (${OVERRIDE_STATES.map((state) => `'${state}'`).join(', ')}), or omit the override entirely.`,
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

  for (const entry of entries) {
    validateEntry(override, entry);
  }

  assertApplicable(source, override, entries);

  let merged: MedicalViewState = source.state;
  for (const entry of entries) {
    merged = applyEntry(merged, entry, override);
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
