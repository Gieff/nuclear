/**
 * NuClear P3.5-B — serializable probe shapes for the temporary high-resolution
 * RenderTarget evidence (test infrastructure).
 *
 * Every shape is plain and serializable because custom `Error` fields do not
 * survive `page.evaluate`. The live snapshots carry the full interactive
 * viewport state (element, canvas, aspect ratio, camera, blend mode, actor
 * count and per-layer Cornerstone properties) so the export invariance can be
 * asserted value-by-value. No product code, no DOM access and nothing reachable
 * from product code.
 */

import type { MedicalCaptureDescriptor } from '../../../packages/medical-engine/src/view-application/index.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';

/** One temporary-target capture request at a physical size and DPI. */
export interface TargetCaptureInput {
  readonly ct: VolumeProbeInput;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly dpi: number;
}

/** One applied Cornerstone layer read back from the live viewport. */
export interface LiveLayerProperties {
  readonly volumeId: string;
  readonly voiRange: { readonly lower: number; readonly upper: number };
  readonly colormapName: string;
  readonly colormapOpacity: number;
  readonly invert: boolean;
  readonly interpolationType: number;
}

/** Full value snapshot of the live interactive viewport. */
export interface LiveSnapshot {
  readonly elementSizePx: number[];
  readonly canvasSizePx: number[];
  /** Raw `viewport.getAspectRatio()` value (Cornerstone returns a Point2). */
  readonly aspectRatio: number[];
  /** Every enumerable `getCamera()` field; arrays are copied, typed arrays flattened. */
  readonly camera: Record<string, unknown>;
  readonly blendMode: string;
  readonly actorCount: number;
  readonly layers: LiveLayerProperties[];
}

/** Result of one target capture, with the live before/after snapshots. */
export interface TargetCaptureAck {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  stack?: string;
  descriptor?: MedicalCaptureDescriptor;
  pixelDimensions?: number[];
  dpi?: number;
  elapsedMs?: number;
  /** Whether the temporary engine id is still registered after the capture. */
  targetEngineRegisteredAfter?: boolean;
  liveBefore?: LiveSnapshot;
  liveAfter?: LiveSnapshot;
  /** Immutable JSON snapshots of the live plan/state inputs. */
  livePlanBefore?: unknown;
  livePlanAfter?: unknown;
  liveStateBefore?: unknown;
  liveStateAfter?: unknown;
  // Flat fields retained for the P3.5-A smoke assertion shape.
  liveElementBefore?: number[];
  liveElementAfter?: number[];
  liveCanvasBefore?: number[];
  liveCanvasAfter?: number[];
  liveCameraBefore?: Record<string, unknown>;
  liveCameraAfter?: Record<string, unknown>;
  liveActorCountBefore?: number;
  liveActorCountAfter?: number;
}

/** Ordinary-capture and temporary-target descriptors from the same state. */
export interface TargetEquivalenceAck {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  stack?: string;
  ordinary?: MedicalCaptureDescriptor;
  target?: MedicalCaptureDescriptor;
}

/** The two temporary-target failure injections. */
export type TargetFailureScenario = 'allocation' | 'apply-refused';

export interface TargetFailureInput {
  readonly ct: VolumeProbeInput;
  readonly scenario: TargetFailureScenario;
}

/** Typed refusal plus the post-failure engine/container registry evidence. */
export interface TargetFailureAck {
  ok: boolean;
  name: string;
  code: string;
  message: string;
  stack?: string;
  /** Whether the temporary engine id is still registered after the refusal. */
  engineRegisteredAfter: boolean;
  /** Number of DOM containers still carrying the temporary engine id. */
  containerCountAfter: number;
  /** A refused target must never return a raster descriptor. */
  descriptor?: undefined;
}

/** A standalone live snapshot request. */
export interface TargetSnapshotAck {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  stack?: string;
  snapshot?: LiveSnapshot;
}

declare global {
  var __nuclearTargetProbe:
    | {
        captureTarget(input: TargetCaptureInput): Promise<TargetCaptureAck>;
        captureTargetAtDpi(input: TargetCaptureInput): Promise<TargetCaptureAck>;
        captureEquivalence(input: { ct: VolumeProbeInput }): Promise<TargetEquivalenceAck>;
        targetFailure(input: TargetFailureInput): Promise<TargetFailureAck>;
        snapshotLive(): TargetSnapshotAck;
        teardown(): {
          ok: boolean;
          name?: string;
          code?: string;
          message?: string;
          stack?: string;
        };
      }
    | undefined;
}
