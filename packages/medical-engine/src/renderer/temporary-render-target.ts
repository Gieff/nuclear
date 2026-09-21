/**
 * @nuclear/medical-engine — browser-only temporary high-resolution
 * `RenderTarget` capture primitive (P3.5-A, ADR-009).
 *
 * It starts a *separate, temporary* `CornerstoneRendererAdapter` on a
 * caller-supplied host sized exactly to the computed pixel dimensions, applies
 * the same semantic state through `applyViewApplication`, reads the raster
 * through the ordinary `captureMedicalRaster` path, then stops the adapter and
 * removes its container. The live interactive canvas, camera, aspect ratio and
 * viewport size are never touched: no resize, no crop, no preview upscaling and
 * no Canvas 2D re-rasterization of medical data (ADR-009 decisions 2 and 5).
 *
 * The dimensioning/spec validation is the pure, Node-safe
 * `view-application/render-target.ts`; this module only allocates, applies,
 * captures and disposes. Exported solely from `renderer/index.ts`, never from
 * `src/index.ts`, because it imports `@cornerstonejs/core` transitively.
 */

import type { MedicalViewState, TemporaryRenderTargetSpec } from '@nuclear/shared-types';

import {
  RENDER_TARGET_ERROR_CODES,
  RenderTargetError,
  computeRenderTargetPixelDimensions,
  deriveTemporaryRenderTargetPlan,
  validateTemporaryRenderTargetSpec,
} from '../view-application/index.js';
import type {
  MedicalCaptureDescriptor,
  RenderTargetPixelDimensions,
  RenderTargetSizeMm,
  ViewApplicationPlan,
  ViewCaptureLayerEvidence,
  ViewGeometryEvidence,
} from '../view-application/index.js';
import { CornerstoneRendererAdapter } from './adapter.js';
import type { RendererRuntimeHost } from './host.js';
import { captureMedicalRaster } from './medical-capture.js';
import { applyViewApplication } from './view-application-adapter.js';

/** Default engine id for the temporary target when the caller supplies none. */
export const DEFAULT_TEMPORARY_TARGET_ENGINE_ID = 'nuclear-temporary-render-target';
/** Default viewport id for the temporary target when the caller supplies none. */
export const DEFAULT_TEMPORARY_TARGET_VIEWPORT_ID = 'nuclear-temporary-render-target-viewport';

/** Everything the temporary target needs to render the same semantic state. */
export interface TemporaryRenderTargetInput {
  readonly spec: TemporaryRenderTargetSpec;
  readonly sizeMm: RenderTargetSizeMm;
  readonly state: MedicalViewState;
  readonly plan: ViewApplicationPlan;
  readonly evidence: ViewGeometryEvidence;
  readonly layers: readonly ViewCaptureLayerEvidence[];
}

/** Injected DOM gateway plus optional engine/viewport identity. */
export interface TemporaryRenderTargetOptions {
  readonly createHost: (pixelDimensions: RenderTargetPixelDimensions) => RendererRuntimeHost;
  readonly engineId?: string;
  readonly viewportId?: string;
}

/** The native raster descriptor plus the explicit target dimensions. */
export interface TemporaryRenderTargetResult {
  readonly descriptor: MedicalCaptureDescriptor;
  readonly pixelDimensions: RenderTargetPixelDimensions;
  readonly dpi: number;
  readonly sizeMm: RenderTargetSizeMm;
}

/** Best-effort container removal; never replaces the actionable allocation error. */
function removeContainerQuietly(host: RendererRuntimeHost, engineId: string): void {
  try {
    host.removeEngineContainer(engineId);
  } catch {
    // Documented benign fallback: the host owns container cleanup, and the
    // caller still receives the original allocation failure.
  }
}

/**
 * Preserves the operation failure while surfacing a concurrent disposal
 * failure: attaches it as `cause` when the error has none, otherwise appends it
 * to the message. The original error is always rethrown, never masked.
 */
function withDisposalFailure(error: unknown, disposalError: unknown): unknown {
  if (disposalError === undefined || !(error instanceof Error)) {
    return error;
  }
  const target = error as Error & { cause?: unknown };
  if (target.cause === undefined) {
    target.cause = disposalError;
    return error;
  }
  const disposalMessage =
    disposalError instanceof Error ? disposalError.message : String(disposalError);
  target.message = `${target.message} (temporary render target disposal also failed: ${disposalMessage})`;
  return error;
}

/**
 * Captures the same `MedicalViewState` at publication density on a temporary,
 * native-size target and disposes it. Fail-closed: spec/size validation, a
 * separate engine sized to the computed pixels, the ordinary apply/capture
 * path, and unconditional disposal. No fallback to the live canvas or to
 * upscaling exists.
 */
export async function captureTemporaryRenderTarget(
  input: TemporaryRenderTargetInput,
  options: TemporaryRenderTargetOptions,
): Promise<TemporaryRenderTargetResult> {
  validateTemporaryRenderTargetSpec(input.spec, input.sizeMm);
  const pixelDimensions = computeRenderTargetPixelDimensions(input.sizeMm, input.spec.dpi);
  const targetPlan = deriveTemporaryRenderTargetPlan(input.plan, pixelDimensions);

  const engineId = options.engineId ?? DEFAULT_TEMPORARY_TARGET_ENGINE_ID;
  const viewportId = options.viewportId ?? DEFAULT_TEMPORARY_TARGET_VIEWPORT_ID;

  let host: RendererRuntimeHost;
  try {
    host = options.createHost(pixelDimensions);
  } catch (error) {
    throw new RenderTargetError(
      RENDER_TARGET_ERROR_CODES.allocationFailed,
      `temporary render target could not create a ${pixelDimensions[0]}x${pixelDimensions[1]} px host; see cause`,
      error,
    );
  }

  let adapter: CornerstoneRendererAdapter;
  try {
    adapter = CornerstoneRendererAdapter.start(host, {
      engineId,
      viewportId,
      viewportType: 'orthographic',
    });
  } catch (error) {
    removeContainerQuietly(host, engineId);
    throw new RenderTargetError(
      RENDER_TARGET_ERROR_CODES.allocationFailed,
      `temporary render target could not start its ${pixelDimensions[0]}x${pixelDimensions[1]} px Cornerstone engine '${engineId}'; see cause. There is no fallback to resizing the live canvas or upscaling a preview`,
      error,
    );
  }

  let descriptor: MedicalCaptureDescriptor | undefined;
  let operationError: unknown;
  let disposalError: unknown;
  try {
    await applyViewApplication(adapter, { plan: targetPlan, evidence: input.evidence });
    descriptor = await captureMedicalRaster(adapter, {
      state: input.state,
      plan: targetPlan,
      evidence: input.evidence,
      layers: input.layers,
    });
  } catch (error) {
    operationError = error;
  } finally {
    try {
      adapter.stop();
    } catch (error) {
      disposalError = error;
    }
  }

  if (operationError !== undefined) {
    throw withDisposalFailure(operationError, disposalError);
  }
  if (disposalError !== undefined) {
    throw new RenderTargetError(
      RENDER_TARGET_ERROR_CODES.disposalFailed,
      `temporary render target captured successfully but disposal failed; the temporary engine/container may not have been released. See cause`,
      disposalError,
    );
  }
  if (descriptor === undefined) {
    throw new RenderTargetError(
      RENDER_TARGET_ERROR_CODES.allocationFailed,
      'temporary render target completed without an operation error or a descriptor; refusing to report a successful capture',
    );
  }

  return {
    descriptor,
    pixelDimensions,
    dpi: input.spec.dpi,
    sizeMm: input.sizeMm,
  };
}
