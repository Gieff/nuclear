/**
 * NuClear P3.4-B.2.2.2 — browser-side `ViewApplicationPlan` application probe
 * (test infrastructure).
 *
 * Bundled by esbuild into `tests/rendering/.harness/` and driven by the
 * controlled WebGL 2 Playwright harness. It starts the real
 * `CornerstoneRendererAdapter` with `{ viewportType: 'orthographic' }` on a
 * 512×512 host, loads the committed CT/PT fixtures through the real Node-safe
 * planner, compiles a real fusion/CT plan and applies it through the real
 * `applyViewApplication`. Every result is plain and serializable because custom
 * `Error` fields do not survive `page.evaluate`.
 *
 * This file is NOT product UI and is never reachable from product code.
 */

import { getUseGenericViewport } from '@cornerstonejs/core';

import {
  CornerstoneRendererAdapter,
  RendererError,
  VolumeIngestionError,
  applyViewApplication,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import type { AppliedViewState } from '../../../packages/medical-engine/src/renderer/index.ts';
import { ViewApplicationError } from '../../../packages/medical-engine/src/view-application/index.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';
import { probeWebGL2 } from './adapter-host.ts';
import {
  PET_ASSET_ID,
  VIEWPORT_SIZE_PX,
  compileCt,
  compileFusion,
  createSizedHost,
  ctEvidence,
  fusionEvidence,
  nonLocalFusionPlan,
  petToCtTransform,
  planFromInput,
} from './application-fixture.ts';

const ENGINE_ID = 'nuclear-application-probe';

type NegativeScenario =
  | 'missing-resident'
  | 'for-mismatch'
  | 'invalid-transform'
  | 'viewport-size-mismatch'
  | 'unresolved-palette'
  | 'slice-position'
  | 'unsupported-scheme';

interface ApplicationAck {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  stack?: string;
  actorCount?: number;
  applied?: AppliedViewState;
  constructorName?: string;
  type?: string;
  useGenericViewport?: boolean;
  elementSizePx?: number[];
  methodSurface?: Record<string, boolean>;
}

interface NuclearApplicationProbe {
  viewport(): ApplicationAck;
  applyCt(input: VolumeProbeInput, colormapId?: string, slabThicknessMm?: number): Promise<ApplicationAck>;
  applyFusion(inputs: { ct: VolumeProbeInput; pet: VolumeProbeInput }): Promise<ApplicationAck>;
  negative(
    inputs: { ct: VolumeProbeInput; pet: VolumeProbeInput },
    scenario: NegativeScenario,
  ): Promise<ApplicationAck>;
  teardown(): ApplicationAck;
}

interface NuclearRendererProbe {
  webgl2(): ReturnType<typeof probeWebGL2>;
}

declare global {
  var __nuclearApplicationProbe: NuclearApplicationProbe | undefined;
  var __nuclearRendererProbe: NuclearRendererProbe | undefined;
  var __nuclearRendererProbeReady: boolean | undefined;
}

let adapter: CornerstoneRendererAdapter | undefined;

function ensureAdapter(): CornerstoneRendererAdapter {
  adapter ??= CornerstoneRendererAdapter.start(createSizedHost(...VIEWPORT_SIZE_PX), {
    engineId: ENGINE_ID,
    viewportType: 'orthographic',
  });
  return adapter;
}

function viewportElement(): HTMLDivElement { return (ensureAdapter().getViewport() as unknown as { element: HTMLDivElement }).element; }

function viewportSize(): [number, number] { const element = viewportElement(); return [element.clientWidth, element.clientHeight]; }

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
      actualViewportSizePx: viewportSize(),
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
      actualViewportSizePx: viewportSize(),
    });
    return { ok: true, applied };
  } catch (error) {
    return describeError(error);
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
    if (scenario === 'missing-resident') {
      return await runNegative(renderer, {
        plan: compileFusion(pet, ct),
        evidence: { volumes: new Map() },
        actualViewportSizePx: viewportSize(),
      });
    }
    if (scenario === 'for-mismatch') {
      return await runNegative(renderer, {
        plan: compileFusion(pet, ct),
        evidence: fusionEvidence(pet, ct, { includeTransform: false }),
        actualViewportSizePx: viewportSize(),
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
        actualViewportSizePx: viewportSize(),
      });
    }
    if (scenario === 'viewport-size-mismatch') {
      return await runNegative(renderer, {
        plan: compileFusion(pet, ct),
        evidence: fusionEvidence(pet, ct),
        actualViewportSizePx: [500, 500],
      });
    }
    if (scenario === 'unresolved-palette') {
      return await runNegative(renderer, {
        plan: compileFusion(pet, ct, { ctColormapId: 'not-a-palette' }),
        evidence: fusionEvidence(pet, ct),
        actualViewportSizePx: viewportSize(),
      });
    }
    if (scenario === 'slice-position') {
      return await runNegative(renderer, {
        plan: compileFusion(pet, ct, { sliceOffsetMm: 5 }),
        evidence: fusionEvidence(pet, ct),
        actualViewportSizePx: viewportSize(),
      });
    }
    if (scenario === 'unsupported-scheme') {
      return await runNegative(renderer, {
        plan: nonLocalFusionPlan(pet, ct),
        evidence: fusionEvidence(pet, ct),
        actualViewportSizePx: viewportSize(),
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
  negative,
  teardown,
};
globalThis.__nuclearRendererProbeReady = true;
