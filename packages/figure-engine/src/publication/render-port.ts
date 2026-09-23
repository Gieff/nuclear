/**
 * @nuclear/figure-engine — publication renderer port contract (P5.5a).
 *
 * `figure-engine` orchestrates publication rendering but owns no renderer: the
 * composition root supplies a `PublicationRendererPort` whose implementation
 * consumes the medical `RenderTarget` capability (ADR-009). This module defines
 * only the serializable request/response contract and the renderer identity, so
 * `figure-engine` never imports `@cornerstonejs/*` or `medical-engine` and never
 * owns a WebGL context, canvas or GPU lifecycle.
 *
 * Pure and Node-safe.
 */

import type {
  ComposerViewInstanceId,
  FigurePanelId,
  MedicalViewState,
  PreparedViewId,
  TemporaryRenderTargetSpec,
} from '@nuclear/shared-types';

import type { PublicationRendererIdentity } from './request-types.js';

/** Per-panel request handed to a caller-supplied publication renderer. */
export interface PublicationPanelRenderRequest {
  readonly panelId: FigurePanelId;
  readonly composerViewInstanceId: ComposerViewInstanceId;
  readonly preparedViewId: PreparedViewId;
  /** Resolved medical view state to render (local overrides already applied upstream). */
  readonly medicalViewState: MedicalViewState;
  /** Temporary high-resolution target; never the live interactive canvas. */
  readonly target: TemporaryRenderTargetSpec;
  /**
   * Physical aperture size in millimetres corresponding to the target, so the
   * renderer can validate the target spec against its physical size (ADR-009).
   */
  readonly sizeMm: readonly [number, number];
  /** Approved render-state hash the raster must correspond to. */
  readonly renderStateHash: string;
}

/** Neutral high-resolution medical raster returned by the port. */
export interface PublicationPanelRaster {
  readonly panelId: FigurePanelId;
  readonly pixelDimensions: readonly [number, number];
  readonly colorProfile: string;
  /** Row-major RGBA8 bytes, base64-encoded. */
  readonly rgbaBase64: string;
  /** Must equal `pixelDimensions[0] * pixelDimensions[1] * 4`. */
  readonly byteLength: number;
  readonly renderer: PublicationRendererIdentity;
}

/** Caller-supplied renderer port; implemented outside `figure-engine`. */
export interface PublicationRendererPort {
  renderPanel(request: PublicationPanelRenderRequest): Promise<PublicationPanelRaster>;
}
