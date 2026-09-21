/**
 * NuClear P3.5 — Node-side helpers for the temporary RenderTarget harness
 * tests (test infrastructure). No product code and no DOM here.
 */

import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import type { MedicalCaptureDescriptor } from '../../packages/medical-engine/src/view-application/index.ts';
import type { LiveSnapshot } from './target-probe-types.ts';

export const TARGET_ENTRY_PATH = fileURLToPath(
  new URL('./target-entry.ts', import.meta.url),
);

/** Broad serializable ack covering every temporary-target probe method. */
export interface TargetProbeAck {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  stack?: string;
  descriptor?: MedicalCaptureDescriptor;
  pixelDimensions?: number[];
  dpi?: number;
  elapsedMs?: number;
  targetEngineRegisteredAfter?: boolean;
  liveBefore?: LiveSnapshot;
  liveAfter?: LiveSnapshot;
  livePlanBefore?: unknown;
  livePlanAfter?: unknown;
  liveStateBefore?: unknown;
  liveStateAfter?: unknown;
  liveElementBefore?: number[];
  liveElementAfter?: number[];
  liveCanvasBefore?: number[];
  liveCanvasAfter?: number[];
  liveCameraBefore?: Record<string, unknown>;
  liveCameraAfter?: Record<string, unknown>;
  liveActorCountBefore?: number;
  liveActorCountAfter?: number;
  ordinary?: MedicalCaptureDescriptor;
  target?: MedicalCaptureDescriptor;
  engineRegisteredAfter?: boolean;
  containerCountAfter?: number;
  snapshot?: LiveSnapshot;
}

/** Invokes one temporary-target probe method and returns its serializable ack. */
export function callTargetProbe(
  page: Page,
  name: string,
  args: unknown[],
): Promise<TargetProbeAck> {
  return page.evaluate(
    ({ probeName, probeArgs }: { probeName: string; probeArgs: unknown[] }) => {
      const scope = globalThis as unknown as {
        __nuclearTargetProbe?: Record<string, (...a: unknown[]) => unknown>;
      };
      const probe = scope.__nuclearTargetProbe;
      if (!probe) {
        throw new Error('__nuclearTargetProbe is not installed');
      }
      return probe[probeName](...probeArgs);
    },
    { probeName: name, probeArgs: args },
  ) as Promise<TargetProbeAck>;
}

export function describeTargetAck(ack: TargetProbeAck): string {
  return `${ack.name ?? ''} ${ack.code ?? ''} ${ack.message ?? ''}`.trim();
}
