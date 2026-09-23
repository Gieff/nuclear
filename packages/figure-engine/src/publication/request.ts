/**
 * @nuclear/figure-engine — `PublicationRenderRequest` assembly (P5.2).
 *
 * Pure, Node-safe and fail-closed. The caller supplies the already-composed
 * `FigureSheet` (whose panel `medicalViewBinding` carries availability and the
 * optional cached-preview reference) plus the real `PreparedView`s. This module
 * derives the render mode, target, output spec and panel inputs, validates
 * every field it consumes with typed refusals, and never mutates the sheet or
 * the prepared views. A malformed object is always a `FigurePublicationError`,
 * never a bare `TypeError`.
 *
 * Trust boundary (explicit). This module validates only the fields it consumes
 * and relies on the upstream contract owners for the rest:
 *
 * - validated here: sheet id/size, an `annotations` array, unique panel and
 *   composer-view-instance ids, each panel's `viewInstance`/`medicalViewBinding`
 *   (`preparedViewId` inner/outer agreement, availability state, cached-preview
 *   shape), each `SourceFingerprint`'s structural fields, each prepared view's
 *   id/source view/`state`-as-object/provenance fingerprint array, and the
 *   caller's format/dpi/profile/alpha/renderer/policy scalars;
 * - NOT re-validated here (upstream authority): the deep clinical shape of
 *   `PreparedView.state`/`links`/`locks`, the full `FigureSheet` framing/
 *   layout/decoration/annotation semantics, and non-fingerprint provenance
 *   completeness. `PreparedView` clinical validity is established by
 *   `view-engine` assembly (ADR-011); `FigureSheet` validity by figure-engine
 *   composition / `project-model`.
 *
 * Consequently an accepted input is guaranteed to satisfy the Fase-1 oracle for
 * every field this module reads, but the caller must supply contract-valid
 * `FigureSheet`/`PreparedView` objects — exactly as `view-engine` and
 * `project-model` produce them. The oracle remains the authority for the
 * assembled result.
 *
 * Field validation lives in `request-validation.ts`; types in
 * `request-types.ts`; structural guards in `guards.ts`.
 */

import type {
  FigureSheetId,
  PublicationPanelInput,
  PublicationRenderRequest,
} from '@nuclear/shared-types';

import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import {
  asArray,
  asNonEmptyString,
  asPositiveFinite,
  asPositivePair,
  asRecord,
  refuse,
} from './guards.js';
import { cachedPreviewReferenceEquals, sourceFingerprintSetEquals } from './provenance.js';
import {
  assertSheetStructure,
  indexPreparedViews,
  matchPanels,
  readAlpha,
  readFormat,
  readPanel,
  readPolicy,
  readPreparedView,
  readRenderer,
} from './request-validation.js';
import type {
  AssemblePublicationRenderRequestInput,
  MatchedPanel,
  PanelShape,
  PreparedViewShape,
  PublicationAvailabilityPolicy,
} from './request-types.js';
import {
  buildPublicationOutput,
  buildPublicationTarget,
  type PublicationRenderMode,
} from './targets.js';

function resolveMode(
  matched: readonly MatchedPanel[],
  policy: PublicationAvailabilityPolicy,
): PublicationRenderMode {
  const states = matched.map((entry) => entry.panel.availability.state);
  for (const state of states) {
    if (state === 'loading' || state === 'missing' || state === 'mismatch') {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.availabilityRefused,
        `panel availability '${state}' fails closed for publication; wait for loading or relink the source explicitly`,
      );
    }
  }

  const online = states.filter((state) => state === 'online').length;
  const offline = states.filter((state) => state === 'offline-cached').length;
  if (online === states.length) {
    return 'live-medical';
  }
  if (offline === states.length) {
    if (policy !== 'allow-offline-preview') {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.availabilityRefused,
        `all ${offline} panel(s) are 'offline-cached' but availabilityPolicy is 'require-online'; an offline preview must be explicitly allowed`,
      );
    }
    return 'offline-cached-preview';
  }
  refuse(
    FIGURE_PUBLICATION_ERROR_CODES.mixedAvailability,
    `panel availabilities cannot be mixed for one request (${online} online, ${offline} offline-cached); a request is either fully live or fully offline-cached`,
  );
}

function resolveOfflineRenderStateHash(matched: readonly MatchedPanel[], raw: unknown): string {
  const hashes = new Set<string>();
  for (const { panel, view } of matched) {
    const preview = panel.cachedPreviewReference;
    if (preview === undefined) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.offlineProvenanceInvalid,
        `panel '${panel.id}' is 'offline-cached' but its medical view binding carries no cachedPreviewReference`,
      );
    }
    const preparedPreview = view.cachedPreviewReference;
    if (preparedPreview === undefined) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.offlineProvenanceInvalid,
        `prepared view '${view.id}' carries no cachedPreviewReference, so the offline preview cannot be verified`,
      );
    }
    if (!cachedPreviewReferenceEquals(preview, preparedPreview)) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.offlineProvenanceInvalid,
        `panel '${panel.id}' cached preview does not match prepared view '${view.id}'; the preview is not valid for that view`,
      );
    }
    if (!sourceFingerprintSetEquals(preview.sourceFingerprintSet, view.sourceFingerprints)) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.offlineProvenanceInvalid,
        `panel '${panel.id}' cached preview fingerprint set does not match prepared view '${view.id}' provenance; refusing an unverified offline preview`,
      );
    }
    hashes.add(preview.renderStateHash);
  }

  if (hashes.size !== 1) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.offlineProvenanceInvalid,
      `offline panels carry ${hashes.size} different render-state hashes; one offline request requires a single verified render state`,
    );
  }
  const derived = [...hashes][0] as string;
  if (raw === undefined) {
    return derived;
  }
  const provided = asNonEmptyString(raw, 'renderStateHash');
  if (provided !== derived) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.offlineProvenanceInvalid,
      `renderStateHash '${provided}' does not match the cached preview hash '${derived}'`,
    );
  }
  return provided;
}

function buildPanelInput(
  panel: PanelShape,
  view: PreparedViewShape,
  mode: PublicationRenderMode,
): PublicationPanelInput {
  const renderSource = mode === 'live-medical' ? 'live-medical' : 'cached-preview';
  if (panel.cachedPreviewReference === undefined) {
    return {
      panelId: panel.id,
      composerViewInstanceId: panel.viewInstanceId,
      preparedViewId: view.id,
      preparedView: view.preparedView,
      availability: panel.availability,
      renderSource,
    };
  }
  return {
    panelId: panel.id,
    composerViewInstanceId: panel.viewInstanceId,
    preparedViewId: view.id,
    preparedView: view.preparedView,
    availability: panel.availability,
    renderSource,
    cachedPreviewReference: panel.cachedPreviewReference,
  };
}

/**
 * Assembles a contract-valid `PublicationRenderRequest`. Every refusal is a
 * typed `FigurePublicationError`; the input `FigureSheet` and `PreparedView`s
 * are never mutated, and only newly created containers are frozen.
 */
export function assemblePublicationRenderRequest(
  input: AssemblePublicationRenderRequestInput,
): PublicationRenderRequest {
  const source = asRecord(input, 'publication request input');
  const figureSheet = asRecord(source.figureSheet, 'figureSheet');
  const sheetId = asNonEmptyString(figureSheet.id, 'figureSheet.id') as FigureSheetId;
  const sheetSizeMm = asPositivePair(figureSheet.sizeMm, 'figureSheet.sizeMm');
  const panelValues = asArray(figureSheet.panels, 'figureSheet.panels');
  if (panelValues.length === 0) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.requestInvalid,
      'figureSheet.panels must contain at least one panel',
    );
  }
  const panels = panelValues.map((panel, index) => readPanel(panel, index));
  assertSheetStructure(figureSheet, panels);

  const format = readFormat(source.format);
  const dpi = asPositiveFinite(source.dpi, 'dpi');
  const colorProfile = asNonEmptyString(source.colorProfile, 'colorProfile');
  const alpha = readAlpha(source.alpha);
  const renderer = readRenderer(source.renderer);
  const availabilityPolicy = readPolicy(source.availabilityPolicy);

  const preparedViewValues = asArray(source.preparedViews, 'preparedViews');
  const preparedViews = preparedViewValues.map((view, index) => readPreparedView(view, index));
  const matched = matchPanels(panels, indexPreparedViews(preparedViews));

  const renderMode = resolveMode(matched, availabilityPolicy);
  const renderStateHash =
    renderMode === 'live-medical'
      ? asNonEmptyString(source.renderStateHash, 'renderStateHash (required for live-medical)')
      : resolveOfflineRenderStateHash(matched, source.renderStateHash);

  const target = Object.freeze(
    buildPublicationTarget(renderMode, sheetSizeMm, dpi, colorProfile, alpha),
  );
  const output = Object.freeze(buildPublicationOutput(format, renderMode));
  const panelInputs = Object.freeze(
    matched.map(({ panel, view }) => Object.freeze(buildPanelInput(panel, view, renderMode))),
  );

  const request: PublicationRenderRequest = {
    sheetId,
    sheetSizeMm,
    figureSheet: input.figureSheet,
    panelInputs,
    renderStateHash,
    renderer: Object.freeze(renderer),
    target,
    output,
    renderMode,
    availabilityPolicy,
  };
  return Object.freeze(request);
}
