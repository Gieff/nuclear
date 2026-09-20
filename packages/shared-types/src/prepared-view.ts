/** Reproducible prepared view, without raster medical content. */

import type { SourceFingerprint } from './source.js';
import type { PreparedViewId, PreviewId, ViewId } from './identifiers.js';
import type { ViewProvenance } from './provenance.js';
import type { MedicalViewState } from './view-state.js';
import type { StateLock, ViewLink } from './view-links.js';

export interface CachedPreviewReference {
  readonly previewId: PreviewId;
  readonly renderStateHash: string;
  readonly sourceFingerprintSet: readonly SourceFingerprint[];
  readonly pixelDimensions: readonly [number, number];
  readonly colorProfile: string;
  readonly generatedAt: string;
  readonly rendererMetadata: {
    readonly rendererName: string;
    readonly rendererVersion: string;
  };
}

export interface PreparedView {
  readonly id: PreparedViewId;
  readonly sourceViewId: ViewId;
  readonly state: MedicalViewState;
  readonly links: readonly ViewLink[];
  readonly locks: readonly StateLock[];
  readonly provenance: ViewProvenance;
  readonly cachedPreviewReference?: CachedPreviewReference;
}
