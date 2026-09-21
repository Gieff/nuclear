/**
 * NuClear P3.4-B.2.2 — browser-side `ViewApplicationPlan` application probe.
 *
 * Bundled by esbuild into `tests/rendering/.harness/` and driven by the
 * controlled WebGL 2 Playwright harness: it starts the real
 * `CornerstoneRendererAdapter` with `{ viewportType: 'orthographic' }` on a
 * 512×512 host, loads the committed CT/PT fixtures through the real Node-safe
 * planner, compiles a real fusion/CT plan and applies it through the real
 * `applyViewApplication`. Every result is plain and serializable because custom
 * `Error` fields do not survive `page.evaluate`. Test-only; never product UI.
 */

import { getUseGenericViewport } from '@cornerstonejs/core';

import {
  CornerstoneRendererAdapter,
  RendererError,
  VolumeIngestionError,
  applyViewApplication,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import { ViewApplicationError } from '../../../packages/medical-engine/src/view-application/index.ts';
import type { ApplicationAck, NegativeScenario } from './application-probe-types.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';
import { probeWebGL2 } from './adapter-host.ts';
import {
  CT_COLORMAP_ID,
  PET_ASSET_ID,
  VIEWPORT_SIZE_PX,
  compileCt,
  createSizedHost,
  ctEvidence,
  planFromInput,
} from './application-fixture.ts';
import {
  compileCoregFusion,
  compileFusion,
  coregFusionEvidence,
  fusionEvidence,
  nonLocalFusionPlan,
  petToCtTransform,
} from './application-fusion-fixture.ts';

const ENGINE_ID = 'nuclear-application-probe';

let adapter: CornerstoneRendererAdapter | undefined;

function ensureAdapter(): CornerstoneRendererAdapter {
  adapter ??= CornerstoneRendererAdapter.start(createSizedHost(...VIEWPORT_SIZE_PX), {
    engineId: ENGINE_ID,
    viewportType: 'orthographic',
  });
  return adapter;
}

function actorCount(): number { return (ensureAdapter().getViewport() as unknown as { getActors(): unknown[] }).getActors().length; }

function describeError(error: unknown): ApplicationAck {
  const stack = error instanceof Error ? error.stack : undefined;
  if (
    error instanceof ViewApplicationError ||
    error instanceof VolumeIngestionError ||
    error instanceof RendererError
  ) {
    return { ok: false, name: error.name, code: error.code, message: error.message, stack };
  }
  if (error instanceof Error) {
    return { ok: false, name: error.name, code: 'UNKNOWN', message: error.message, stack };
  }
  return { ok: false, name: 'Error', code: 'UNKNOWN', message: String(error) };
}

/** Reports the empirically created viewport type and its method surface. */
function inspectViewport(): ApplicationAck {
  try {
    const viewport = ensureAdapter().getViewport() as unknown as {
      constructor: { name: string };
      type?: unknown;
      element: HTMLDivElement;
      setVolumes?: unknown;
      setProperties?: unknown;
      setBlendMode?: unknown;
      setOrientation?: unknown;
      getCamera?: unknown;
      getActors?: unknown;
    };
    return {
      ok: true,
      constructorName: viewport.constructor.name,
      type: String(viewport.type),
      useGenericViewport: getUseGenericViewport(),
      elementSizePx: [viewport.element.clientWidth, viewport.element.clientHeight],
      methodSurface: {
        setVolumes: typeof viewport.setVolumes === 'function',
        setProperties: typeof viewport.setProperties === 'function',
        setBlendMode: typeof viewport.setBlendMode === 'function',
        setOrientation: typeof viewport.setOrientation === 'function',
        getCamera: typeof viewport.getCamera === 'function',
        getActors: typeof viewport.getActors === 'function',
      },
    };
  } catch (error) {
    return describeError(error);
  }
}

async function applyCt(input: VolumeProbeInput, colormapId?: string, slabThicknessMm?: number): Promise<ApplicationAck> {
  try {
    const renderer = ensureAdapter();
    const ct = planFromInput(input);
    renderer.loadVolume(ct);
    const plan = compileCt(ct, colormapId, slabThicknessMm);
    const applied = await applyViewApplication(renderer, {
      plan,
      evidence: ctEvidence(ct),
    });
    return { ok: true, applied };
  } catch (error) {
    return describeError(error);
  }
}

async function applyFusion(inputs: {
  ct: VolumeProbeInput;
  pet: VolumeProbeInput;
}): Promise<ApplicationAck> {
  try {
    const renderer = ensureAdapter();
    const ct = planFromInput(inputs.ct);
    const pet = planFromInput(inputs.pet);
    renderer.loadVolume(ct);
    renderer.loadVolume(pet);
    const plan = compileFusion(pet, ct);
    const applied = await applyViewApplication(renderer, {
      plan,
      evidence: fusionEvidence(pet, ct),
    });
    return { ok: true, applied };
  } catch (error) {
    const ack = describeError(error);
    ack.actorCount = actorCount();
    return ack;
  }
}

/** Applies the positive same-Frame-of-Reference CT+PET fusion (`pt-axial-coreg`). */
async function applyCoregFusion(inputs: {
  ct: VolumeProbeInput;
  pet: VolumeProbeInput;
  suvFactor: number;
}): Promise<ApplicationAck> {
  try {
    const renderer = ensureAdapter();
    const ct = planFromInput(inputs.ct);
    const pet = planFromInput(inputs.pet);
    renderer.loadVolume(ct);
    renderer.loadVolume(pet);
    const plan = compileCoregFusion(pet, ct, inputs.suvFactor);
    const applied = await applyViewApplication(renderer, {
      plan,
      evidence: coregFusionEvidence(ct, pet),
    });
    return { ok: true, applied, actorCount: actorCount() };
  } catch (error) {
    const ack = describeError(error);
    ack.actorCount = actorCount();
    return ack;
  }
}

/** Runs one fail-closed negative and reports the typed code and actor count. */
async function runNegative(
  renderer: CornerstoneRendererAdapter,
  input: Parameters<typeof applyViewApplication>[1],
): Promise<ApplicationAck> {
  try {
    const applied = await applyViewApplication(renderer, input);
    return { ok: true, applied, actorCount: actorCount() };
  } catch (error) {
    const ack = describeError(error);
    ack.actorCount = actorCount();
    return ack;
  }
}

async function negative(
  inputs: { ct: VolumeProbeInput; pet: VolumeProbeInput },
  scenario: NegativeScenario,
): Promise<ApplicationAck> {
  try {
    const renderer = ensureAdapter();
    const ct = planFromInput(inputs.ct);
    const pet = planFromInput(inputs.pet);
    if (scenario === 'evidence-not-cached') {
      // Evidence claims the CT volume is resident, but it is deliberately never
      // materialized in Cornerstone's cache: only the real cache check can refuse.
      return await runNegative(renderer, {
        plan: compileCt(ct),
        evidence: ctEvidence(ct),
      });
    }

    if (scenario === 'zero-size-viewport') {
      // Materialize a volume, then collapse the live viewport element to zero
      // pixels so `mountedViewportSize` must refuse before any actor is set.
      renderer.loadVolume(ct);
      const viewport = renderer.getViewport() as unknown as { element: HTMLDivElement };
      viewport.element.style.width = '0px';
      viewport.element.style.height = '0px';
      return await runNegative(renderer, {
        plan: compileCt(ct),
        evidence: ctEvidence(ct),
      });
    }

    renderer.loadVolume(ct);
    renderer.loadVolume(pet);

    if (scenario === 'missing-resident') {
      return await runNegative(renderer, {
        plan: compileFusion(pet, ct),
        evidence: { volumes: new Map() },
      });
    }
    if (scenario === 'for-mismatch') {
      return await runNegative(renderer, {
        plan: compileFusion(pet, ct),
        evidence: fusionEvidence(pet, ct, { includeTransform: false }),
      });
    }
    if (scenario === 'invalid-transform') {
      const transforms = new Map([
        [
          PET_ASSET_ID,
          {
            ...petToCtTransform(pet, ct),
            validity: { isValid: false, errorMarginMm: 99, outOfDomainBehavior: 'warn' },
          },
        ],
      ]);
      return await runNegative(renderer, {
        plan: compileFusion(pet, ct),
        evidence: { volumes: fusionEvidence(pet, ct).volumes, spatialTransforms: transforms },
      });
    }
    if (scenario === 'viewport-size-mismatch') {
      // A compiled state whose declared viewportSizePx (500x500) differs from
      // the 512x512 element the probe host actually mounted.
      return await runNegative(renderer, {
        plan: compileCt(ct, CT_COLORMAP_ID, undefined, [500, 500]),
        evidence: ctEvidence(ct),
      });
    }
    if (scenario === 'unresolved-palette') {
      return await runNegative(renderer, {
        plan: compileCt(ct, 'not-a-palette'),
        evidence: ctEvidence(ct),
      });
    }
    if (scenario === 'slice-position') {
      const plan = compileCt(ct);
      return await runNegative(renderer, {
        plan: { ...plan, spatial: { ...plan.spatial, sliceOffsetMm: 5 } },
        evidence: ctEvidence(ct),
      });
    }
    if (scenario === 'unsupported-scheme') {
      return await runNegative(renderer, {
        plan: nonLocalFusionPlan(pet, ct),
        evidence: fusionEvidence(pet, ct),
      });
    }
    return { ok: false, code: 'UNKNOWN_SCENARIO', message: `unknown scenario '${String(scenario)}'` };
  } catch (error) {
    const ack = describeError(error);
    ack.actorCount = actorCount();
    return ack;
  }
}

function teardown(): ApplicationAck {
  try {
    adapter?.stop();
    adapter = undefined;
    return { ok: true };
  } catch (error) {
    return describeError(error);
  }
}

globalThis.__nuclearRendererProbe = { webgl2: probeWebGL2 };
globalThis.__nuclearApplicationProbe = {
  viewport: inspectViewport,
  applyCt,
  applyFusion,
  applyCoregFusion,
  negative,
  teardown,
};
globalThis.__nuclearRendererProbeReady = true;
