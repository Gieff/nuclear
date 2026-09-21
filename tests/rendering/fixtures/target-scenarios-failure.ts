/**
 * NuClear P3.5-B — render-equivalence and failure-injection temporary RenderTarget
 * scenarios (test infrastructure).
 *
 * `captureEquivalence` runs the ordinary `captureMedicalRaster` on the live
 * 512×512 adapter and the temporary target from the same applied state.
 * `targetFailure` injects an allocation refusal or an apply refusal after the
 * temporary engine started, and reports whether the temporary engine/container
 * were released. Test-only; never product UI.
 */

import { getRenderingEngine } from '@cornerstonejs/core';

import { captureMedicalRaster } from '../../../packages/medical-engine/src/renderer/index.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';
import { buildCtState, planFromInput } from './application-fixture.ts';
import {
  TARGET_ENGINE_ID,
  captureTemporaryRenderTarget,
  countTargetContainers,
  createContainerFailingHost,
  ctLayers,
  describeError,
  ensureLiveAdapter,
  ensureLiveApplied,
  planTarget,
  targetHostOptions,
} from './target-scenario-support.ts';
import type {
  TargetEquivalenceAck,
  TargetFailureAck,
  TargetFailureInput,
} from './target-probe-types.ts';

/** Ordinary capture and temporary target from the same applied CT state. */
export async function captureEquivalence(input: {
  ct: VolumeProbeInput;
}): Promise<TargetEquivalenceAck> {
  try {
    const ct = planFromInput(input.ct);
    const { plan, evidence } = await ensureLiveApplied(ct);
    const state = buildCtState(ct);
    const layers = ctLayers(ct);

    const ordinary = await captureMedicalRaster(ensureLiveAdapter(), {
      state,
      plan,
      evidence,
      layers,
    });

    const sizeMm = [80, 80] as const;
    const dpi = 300;
    const { targetPlan, spec } = planTarget(plan, sizeMm, dpi);
    const target = await captureTemporaryRenderTarget(
      { spec, sizeMm, state, plan: targetPlan, evidence, layers },
      targetHostOptions(),
    );

    return { ok: true, ordinary, target: target.descriptor };
  } catch (error) {
    return describeError(error);
  }
}

/**
 * Injects one failure into the temporary target: an unavailable engine
 * container (`allocation`) or evidence that omits the resident volume
 * (`apply-refused`). Reports the typed refusal and whether the temporary engine
 * and its container were released.
 */
export async function targetFailure(input: TargetFailureInput): Promise<TargetFailureAck> {
  try {
    const ct = planFromInput(input.ct);
    const { plan, evidence } = await ensureLiveApplied(ct);
    const state = buildCtState(ct);
    const layers = ctLayers(ct);

    const sizeMm = [80, 80] as const;
    const dpi = 600;
    const { targetPlan, spec } = planTarget(plan, sizeMm, dpi);

    if (input.scenario === 'allocation') {
      await captureTemporaryRenderTarget(
        { spec, sizeMm, state, plan: targetPlan, evidence, layers },
        { ...targetHostOptions(), createHost: () => createContainerFailingHost() },
      );
    } else {
      await captureTemporaryRenderTarget(
        { spec, sizeMm, state, plan: targetPlan, evidence: { volumes: new Map() }, layers },
        targetHostOptions(),
      );
    }

    return {
      ...describeError(new Error('temporary render target unexpectedly succeeded')),
      engineRegisteredAfter: getRenderingEngine(TARGET_ENGINE_ID) !== undefined,
      containerCountAfter: countTargetContainers(),
    };
  } catch (error) {
    return {
      ...describeError(error),
      engineRegisteredAfter: getRenderingEngine(TARGET_ENGINE_ID) !== undefined,
      containerCountAfter: countTargetContainers(),
    };
  }
}
