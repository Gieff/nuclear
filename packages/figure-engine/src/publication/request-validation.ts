/**
 * @nuclear/figure-engine — publication request field validation (P5.2).
 *
 * Validates every field the assembler consumes, with typed refusals and no
 * coercion. Internal module: not re-exported from the package barrel.
 *
 * Pure and Node-safe: no DOM, no WebGL, no Cornerstone.
 */

import type {
  AssetAvailabilityStatus,
  CachedPreviewReference,
  ComposerViewInstanceId,
  FigurePanelId,
  PreparedView,
  PreparedViewId,
  SourceFingerprint,
} from '@nuclear/shared-types';

import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import { readFingerprint } from './fingerprint-validation.js';
import {
  asArray,
  asNonEmptyString,
  asPositivePair,
  asRecord,
  refuse,
} from './guards.js';
import {
  AVAILABILITY_STATES,
  type MatchedPanel,
  type PanelShape,
  type PreparedViewShape,
  type PublicationAvailabilityPolicy,
  type PublicationRendererIdentity,
} from './request-types.js';
import type { PublicationOutputFormat } from './targets.js';

export function readAvailability(value: unknown, path: string): AssetAvailabilityStatus {
  const record = asRecord(value, path);
  if (!AVAILABILITY_STATES.includes(record.state as AssetAvailabilityStatus['state'])) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.requestInvalid,
      `${path}.state '${String(record.state)}' is not a known availability state (${AVAILABILITY_STATES.join(', ')})`,
    );
  }
  return value as AssetAvailabilityStatus;
}

export function readCachedPreview(value: unknown, path: string): CachedPreviewReference {
  const record = asRecord(value, path);
  asNonEmptyString(record.previewId, `${path}.previewId`);
  asNonEmptyString(record.renderStateHash, `${path}.renderStateHash`);
  asNonEmptyString(record.colorProfile, `${path}.colorProfile`);
  asNonEmptyString(record.generatedAt, `${path}.generatedAt`);
  asPositivePair(record.pixelDimensions, `${path}.pixelDimensions`);
  const fingerprints = asArray(record.sourceFingerprintSet, `${path}.sourceFingerprintSet`);
  for (const [index, fingerprint] of fingerprints.entries()) {
    readFingerprint(fingerprint, `${path}.sourceFingerprintSet[${index}]`);
  }
  const renderer = asRecord(record.rendererMetadata, `${path}.rendererMetadata`);
  asNonEmptyString(renderer.rendererName, `${path}.rendererMetadata.rendererName`);
  asNonEmptyString(renderer.rendererVersion, `${path}.rendererMetadata.rendererVersion`);
  return value as CachedPreviewReference;
}

export function readPanel(value: unknown, index: number): PanelShape {
  const path = `figureSheet.panels[${index}]`;
  const panel = asRecord(value, path);
  const id = asNonEmptyString(panel.id, `${path}.id`) as FigurePanelId;
  const viewInstance = asRecord(panel.viewInstance, `${path}.viewInstance`);
  const viewInstanceId = asNonEmptyString(
    viewInstance.id,
    `${path}.viewInstance.id`,
  ) as ComposerViewInstanceId;
  const preparedViewId = asNonEmptyString(
    viewInstance.preparedViewId,
    `${path}.viewInstance.preparedViewId`,
  ) as PreparedViewId;
  const binding = asRecord(
    viewInstance.medicalViewBinding,
    `${path}.viewInstance.medicalViewBinding`,
  );
  const bindingPreparedViewId = asNonEmptyString(
    binding.preparedViewId,
    `${path}.viewInstance.medicalViewBinding.preparedViewId`,
  );
  if (bindingPreparedViewId !== preparedViewId) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.panelSourceInvalid,
      `panel '${id}' medical view binding references prepared view '${bindingPreparedViewId}' but its view instance references '${preparedViewId}'`,
    );
  }
  const availability = readAvailability(
    binding.availability,
    `${path}.viewInstance.medicalViewBinding.availability`,
  );
  const cachedPreviewReference =
    binding.cachedPreviewReference === undefined
      ? undefined
      : readCachedPreview(
          binding.cachedPreviewReference,
          `${path}.viewInstance.medicalViewBinding.cachedPreviewReference`,
        );
  return { id, viewInstanceId, preparedViewId, availability, cachedPreviewReference };
}

export function readPreparedView(value: unknown, index: number): PreparedViewShape {
  const path = `preparedViews[${index}]`;
  const record = asRecord(value, path);
  const id = asNonEmptyString(record.id, `${path}.id`) as PreparedViewId;
  asNonEmptyString(record.sourceViewId, `${path}.sourceViewId`);
  asRecord(record.state, `${path}.state`);
  const provenance = asRecord(record.provenance, `${path}.provenance`);
  const fingerprints = asArray(
    provenance.sourceFingerprints,
    `${path}.provenance.sourceFingerprints`,
  );
  for (const [fingerprintIndex, fingerprint] of fingerprints.entries()) {
    readFingerprint(fingerprint, `${path}.provenance.sourceFingerprints[${fingerprintIndex}]`);
  }
  if (fingerprints.length === 0) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.requestInvalid,
      `${path}.provenance.sourceFingerprints must contain at least one fingerprint`,
    );
  }
  const cachedPreviewReference =
    record.cachedPreviewReference === undefined
      ? undefined
      : readCachedPreview(record.cachedPreviewReference, `${path}.cachedPreviewReference`);
  return {
    id,
    preparedView: value as PreparedView,
    sourceFingerprints: fingerprints as readonly SourceFingerprint[],
    cachedPreviewReference,
  };
}

export function readFormat(value: unknown): PublicationOutputFormat {
  if (value !== 'tiff' && value !== 'png' && value !== 'pdf') {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.requestInvalid,
      `format '${String(value)}' must be 'tiff', 'png' or 'pdf'`,
    );
  }
  return value;
}

/**
 * Reads the publication alpha. `undefined` is the single sanctioned default
 * (`'opaque'`, required by the live `TemporaryRenderTargetSpec` contract); any
 * other value must be exactly `'opaque'` or `'preserve'`. A cached-preview
 * target carries no alpha field, so a caller-supplied alpha is intentionally
 * not propagated for offline requests.
 */
export function readAlpha(value: unknown): 'opaque' | 'preserve' {
  if (value === undefined) {
    return 'opaque';
  }
  if (value !== 'opaque' && value !== 'preserve') {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.requestInvalid,
      `alpha '${String(value)}' must be 'opaque' or 'preserve'`,
    );
  }
  return value;
}

export function readPolicy(value: unknown): PublicationAvailabilityPolicy {
  if (value !== 'require-online' && value !== 'allow-offline-preview') {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.requestInvalid,
      `availabilityPolicy '${String(value)}' must be 'require-online' or 'allow-offline-preview'`,
    );
  }
  return value;
}

export function readRenderer(value: unknown): PublicationRendererIdentity {
  const record = asRecord(value, 'renderer');
  return {
    rendererName: asNonEmptyString(record.rendererName, 'renderer.rendererName'),
    rendererVersion: asNonEmptyString(record.rendererVersion, 'renderer.rendererVersion'),
  };
}

export function indexPreparedViews(
  views: readonly PreparedViewShape[],
): Map<PreparedViewId, PreparedViewShape> {
  const index = new Map<PreparedViewId, PreparedViewShape>();
  for (const view of views) {
    if (index.has(view.id)) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.panelSourceInvalid,
        `duplicate prepared view id '${view.id}'; every panel needs exactly one distinct prepared view`,
      );
    }
    index.set(view.id, view);
  }
  return index;
}

export function matchPanels(
  panels: readonly PanelShape[],
  index: Map<PreparedViewId, PreparedViewShape>,
): readonly MatchedPanel[] {
  const matched: MatchedPanel[] = [];
  const used = new Set<PreparedViewId>();
  for (const panel of panels) {
    const view = index.get(panel.preparedViewId);
    if (view === undefined) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.panelSourceInvalid,
        `panel '${panel.id}' references prepared view '${panel.preparedViewId}', which was not supplied`,
      );
    }
    if (used.has(view.id)) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.panelSourceInvalid,
        `prepared view '${view.id}' is matched by more than one panel`,
      );
    }
    used.add(view.id);
    matched.push({ panel, view });
  }
  if (used.size !== index.size) {
    const unused = [...index.keys()].filter((id) => !used.has(id));
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.panelSourceInvalid,
      `unused prepared view(s) ${unused.join(', ')}; supply exactly one prepared view per panel`,
    );
  }
  return matched;
}

/**
 * Structural checks on the sheet itself that the assembled request depends on:
 * `annotations` is an array, and panel / composer-view-instance ids are unique
 * (both required by the Fase-1 `isFigureSheet` oracle). Deeper `FigureSheet`
 * validity (framing, layout, decoration, annotation detail) and deep
 * `PreparedView` clinical validity remain upstream (figure-engine composition /
 * project-model / view-engine ADR-011; see the trust boundary in `request.ts`).
 */
export function assertSheetStructure(
  figureSheet: Record<string, unknown>,
  panels: readonly PanelShape[],
): void {
  asArray(figureSheet.annotations, 'figureSheet.annotations');
  const panelIds = new Set<string>();
  const instanceIds = new Set<string>();
  for (const panel of panels) {
    if (panelIds.has(panel.id)) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.requestInvalid,
        `figureSheet.panels contains duplicate panel id '${panel.id}'`,
      );
    }
    panelIds.add(panel.id);
    if (instanceIds.has(panel.viewInstanceId)) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.requestInvalid,
        `figureSheet.panels contains duplicate composer view instance id '${panel.viewInstanceId}'`,
      );
    }
    instanceIds.add(panel.viewInstanceId);
  }
}
