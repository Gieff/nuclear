/**
 * NuClear P3.5-B — positive temporary high-resolution RenderTarget scenarios
 * (test infrastructure).
 *
 * Captures the live committed `ct-axial` state at publication density through
 * the real `captureTemporaryRenderTarget` and reports the full live before/after
 * snapshots plus the immutable live plan/state inputs. Every method returns a
 * plain serializable ack because custom `Error` fields do not survive
 * `page.evaluate`. Test-only; never product UI.
 */

import { getRenderingEngine } from '@cornerstonejs/core';

import { buildCtState, planFromInput } from './application-fixture.ts';
import { captureLiveSnapshot, cloneJson } from './target-snapshot.ts';
import {
  TARGET_ENGINE_ID,
  captureTemporaryRenderTarget,
  ctLayers,
  describeError,
  ensureLiveAdapter,
  ensureLiveApplied,
  liveVolumeIds,
  planTarget,
  targetHostOptions,
} from './target-scenario-support.ts';
import type {
  TargetCaptureAck,
  TargetCaptureInput,
  TargetSnapshotAck,
} from './target-probe-types.ts';

/** Captures the same live CT state at publication density on a temporary target. */
export async function captureTarget(input: TargetCaptureInput): Promise<TargetCaptureAck> {
  try {
    const ct = planFromInput(input.ct);
    const { plan, evidence } = await ensureLiveApplied(ct);
    const state = buildCtState(ct);
    const layers = ctLayers(ct);

    const liveBefore = captureLiveSnapshot(ensureLiveAdapter(), [ct.volumeId]);
    const livePlanBefore = cloneJson(plan);
    const liveStateBefore = cloneJson(state);

    const sizeMm = [input.widthMm, input.heightMm] as const;
    const { targetPlan, spec } = planTarget(plan, sizeMm, input.dpi);

    const startedAt = Date.now();
    const result = await captureTemporaryRenderTarget(
      { spec, sizeMm, state, plan: targetPlan, evidence, layers },
      targetHostOptions(),
    );
    const elapsedMs = Date.now() - startedAt;
    const liveAfter = captureLiveSnapshot(ensureLiveAdapter(), [ct.volumeId]);

    return {
      ok: true,
      descriptor: result.descriptor,
      pixelDimensions: [...result.pixelDimensions],
      dpi: result.dpi,
      elapsedMs,
      targetEngineRegisteredAfter: getRenderingEngine(TARGET_ENGINE_ID) !== undefined,
      liveBefore,
      liveAfter,
      livePlanBefore,
      livePlanAfter: cloneJson(plan),
      liveStateBefore,
      liveStateAfter: cloneJson(state),
      liveElementBefore: liveBefore.elementSizePx,
      liveElementAfter: liveAfter.elementSizePx,
      liveCanvasBefore: liveBefore.canvasSizePx,
      liveCanvasAfter: liveAfter.canvasSizePx,
      liveCameraBefore: liveBefore.camera,
      liveCameraAfter: liveAfter.camera,
      liveActorCountBefore: liveBefore.actorCount,
      liveActorCountAfter: liveAfter.actorCount,
    };
  } catch (error) {
    return describeError(error);
  }
}

/** Identical to `captureTarget`; kept as a distinct P3.5-B probe method name. */
export const captureTargetAtDpi = captureTarget;

/** Snapshots the live viewport without running any capture. */
export function snapshotLive(): TargetSnapshotAck {
  try {
    return { ok: true, snapshot: captureLiveSnapshot(ensureLiveAdapter(), liveVolumeIds()) };
  } catch (error) {
    return describeError(error);
  }
}
