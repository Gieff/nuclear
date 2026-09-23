/**
 * @nuclear/figure-engine — publication request input/shape types (P5.2).
 *
 * Exported input contract plus internal shapes used between the validation and
 * assembly modules. Pure and Node-safe.
 */

import type {
  AssetAvailabilityStatus,
  CachedPreviewReference,
  ComposerViewInstanceId,
  FigurePanelId,
  FigureSheet,
  PreparedView,
  PreparedViewId,
  SourceFingerprint,
} from '@nuclear/shared-types';

import type { PublicationOutputFormat } from './targets.js';

export type PublicationAvailabilityPolicy = 'require-online' | 'allow-offline-preview';

export interface PublicationRendererIdentity {
  readonly rendererName: string;
  readonly rendererVersion: string;
}

export interface AssemblePublicationRenderRequestInput {
  readonly figureSheet: FigureSheet;
  /** Exactly one `PreparedView` per sheet panel, matched by `PreparedViewId`. */
  readonly preparedViews: readonly PreparedView[];
  readonly format: PublicationOutputFormat;
  readonly dpi: number;
  readonly colorProfile: string;
  readonly alpha?: 'opaque' | 'preserve';
  /** Required for a live request; for an offline request it must match the cached preview. */
  readonly renderStateHash?: string;
  readonly renderer: PublicationRendererIdentity;
  readonly availabilityPolicy: PublicationAvailabilityPolicy;
}

/** Validated view of one sheet panel's publication-relevant fields. */
export interface PanelShape {
  readonly id: FigurePanelId;
  readonly viewInstanceId: ComposerViewInstanceId;
  readonly preparedViewId: PreparedViewId;
  readonly availability: AssetAvailabilityStatus;
  readonly cachedPreviewReference: CachedPreviewReference | undefined;
}

/** Validated view of one supplied prepared view's publication-relevant fields. */
export interface PreparedViewShape {
  readonly id: PreparedViewId;
  readonly preparedView: PreparedView;
  readonly sourceFingerprints: readonly SourceFingerprint[];
  readonly cachedPreviewReference: CachedPreviewReference | undefined;
}

export interface MatchedPanel {
  readonly panel: PanelShape;
  readonly view: PreparedViewShape;
}

export const AVAILABILITY_STATES: readonly AssetAvailabilityStatus['state'][] = [
  'online',
  'loading',
  'offline-cached',
  'missing',
  'mismatch',
];
