/**
 * NuClear P3.5-B — shared state and helpers for the temporary RenderTarget
 * probe scenarios (test infrastructure).
 *
 * Owns the one live 512×512 adapter with the committed `ct-axial` applied, the
 * typed error flattening, the ratified target spec builder and the failure
 * host. Test-only; never product UI.
 */

import {
  CornerstoneRendererAdapter,
  RendererError,
  VolumeIngestionError,
  applyViewApplication,
  captureTemporaryRenderTarget,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import type {
  RendererRuntimeHost,
  VolumeIngestionPlan,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import {
  RenderTargetError,
  ViewApplicationError,
  computeRenderTargetPixelDimensions,
  deriveTemporaryRenderTargetPlan,
} from '../../../packages/medical-engine/src/view-application/index.ts';
import type {
  ViewApplicationPlan,
  ViewCaptureLayerEvidence,
  ViewGeometryEvidence,
} from '../../../packages/medical-engine/src/view-application/index.ts';
import type { TemporaryRenderTargetSpec } from '../../../packages/shared-types/src/index.ts';
import { probeWebGL2 } from './adapter-host.ts';
import { CT_ASSET_ID, compileCt, createSizedHost, ctEvidence } from './application-fixture.ts';

export const LIVE_ENGINE_ID = 'nuclear-target-live';
export const TARGET_ENGINE_ID = 'nuclear-target-capture';
export const TARGET_VIEWPORT_ID = 'nuclear-target-viewport';
export const LIVE_VIEWPORT_SIZE_PX = [512, 512] as const;

let liveAdapter: CornerstoneRendererAdapter | undefined;
let liveLoaded = false;
let liveVolumeId: string | undefined;

/** The one live interactive adapter, started lazily on a 512×512 host. */
export function ensureLiveAdapter(): CornerstoneRendererAdapter {
  liveAdapter ??= CornerstoneRendererAdapter.start(createSizedHost(...LIVE_VIEWPORT_SIZE_PX), {
    engineId: LIVE_ENGINE_ID,
    viewportType: 'orthographic',
  });
  return liveAdapter;
}

/** Base refusal shape shared by every probe method. */
export interface ProbeErrorAck {
  ok: false;
  name: string;
  code: string;
  message: string;
  stack?: string;
}

/** Flattens any thrown value into a serializable typed refusal. */
export function describeError(error: unknown): ProbeErrorAck {
  const stack = error instanceof Error ? error.stack : undefined;
  if (
    error instanceof ViewApplicationError ||
    error instanceof VolumeIngestionError ||
    error instanceof RendererError ||
    error instanceof RenderTargetError
  ) {
    return { ok: false, name: error.name, code: error.code, message: error.message, stack };
  }
  if (error instanceof Error) {
    return { ok: false, name: error.name, code: 'UNKNOWN', message: error.message, stack };
  }
  return { ok: false, name: 'Error', code: 'UNKNOWN', message: String(error) };
}

/** The neutral single-CT state's layer evidence. */
export function ctLayers(ct: VolumeIngestionPlan): ViewCaptureLayerEvidence[] {
  return [{ assetId: CT_ASSET_ID, scalarDataDomain: ct.scalarDataDomain }];
}

/** Ratified `TemporaryRenderTargetSpec` for a computed native size. */
export function makeSpec(
  pixelDimensions: readonly [number, number],
  dpi: number,
): TemporaryRenderTargetSpec {
  return {
    kind: 'temporary-high-resolution',
    pixelDimensions,
    dpi,
    colorProfile: 'srgb',
    alpha: 'opaque',
    liveCanvasPolicy: 'never-resize-live-canvas',
  };
}

/** Loads and applies the committed CT exactly once on the live adapter. */
export async function ensureLiveApplied(ct: VolumeIngestionPlan): Promise<{
  plan: ViewApplicationPlan;
  evidence: ViewGeometryEvidence;
}> {
  const renderer = ensureLiveAdapter();
  const plan = compileCt(ct);
  const evidence = ctEvidence(ct);
  if (!liveLoaded) {
    renderer.loadVolume(ct);
    await applyViewApplication(renderer, { plan, evidence });
    liveLoaded = true;
    liveVolumeId = ct.volumeId;
  }
  return { plan, evidence };
}

/** A host that passes the WebGL probe but refuses to allocate its container. */
export function createContainerFailingHost(): RendererRuntimeHost {
  return {
    createEngineContainer(): HTMLDivElement {
      throw new Error(
        'temporary render target test host refused to allocate an engine container',
      );
    },
    removeEngineContainer(): void {
      // The container was never created, so removal is a deliberate no-op.
    },
    probeWebGL2,
  };
}

/** How many DOM containers still carry the temporary engine id. */
export function countTargetContainers(): number {
  return document.querySelectorAll(`#${TARGET_ENGINE_ID}`).length;
}

/** The live CT volume id once applied, or `[]` before the first load. */
export function liveVolumeIds(): string[] {
  return liveVolumeId === undefined ? [] : [liveVolumeId];
}

/** Computes the target dimensions and derives the retargeted plan. */
export function planTarget(
  plan: ViewApplicationPlan,
  sizeMm: readonly [number, number],
  dpi: number,
): {
  pixelDimensions: readonly [number, number];
  targetPlan: ViewApplicationPlan;
  spec: TemporaryRenderTargetSpec;
} {
  const pixelDimensions = computeRenderTargetPixelDimensions(sizeMm, dpi);
  return {
    pixelDimensions,
    targetPlan: deriveTemporaryRenderTargetPlan(plan, pixelDimensions),
    spec: makeSpec(pixelDimensions, dpi),
  };
}

/** The real offscreen host sized to the target's computed native dimensions. */
export function targetHostOptions(): {
  createHost: (dims: readonly [number, number]) => RendererRuntimeHost;
  engineId: string;
  viewportId: string;
} {
  return {
    createHost: (dims) => createSizedHost(dims[0], dims[1]),
    engineId: TARGET_ENGINE_ID,
    viewportId: TARGET_VIEWPORT_ID,
  };
}

/** Re-exported capture primitive so the scenario files import one support module. */
export { captureTemporaryRenderTarget };

/** Stops the shared live adapter and clears all probe state. */
export function teardown(): ProbeErrorAck | { ok: true } {
  try {
    liveAdapter?.stop();
    liveAdapter = undefined;
    liveLoaded = false;
    liveVolumeId = undefined;
    return { ok: true };
  } catch (error) {
    return describeError(error);
  }
}
