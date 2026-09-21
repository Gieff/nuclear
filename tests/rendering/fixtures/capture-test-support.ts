/**
 * NuClear P3.4-C.2 — Node-side helpers for the browser capture harness tests
 * (test infrastructure). No product code and no DOM here.
 */

import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import type { CaptureAck } from './capture-probe-types.ts';

export const CAPTURE_ENTRY_PATH = fileURLToPath(
  new URL('./capture-entry.ts', import.meta.url),
);

/** Invokes one probe method and returns its serializable ack. */
export function callCaptureProbe<T = CaptureAck>(
  page: Page,
  name: string,
  args: unknown[],
): Promise<T> {
  return page.evaluate(
    ({ probeName, probeArgs }: { probeName: string; probeArgs: unknown[] }) => {
      const scope = globalThis as unknown as {
        __nuclearCaptureProbe?: Record<string, (...a: unknown[]) => unknown>;
      };
      const probe = scope.__nuclearCaptureProbe;
      if (!probe) {
        throw new Error('__nuclearCaptureProbe is not installed');
      }
      return probe[probeName](...probeArgs);
    },
    { probeName: name, probeArgs: args },
  ) as Promise<T>;
}

export function describeCaptureAck(ack: CaptureAck): string {
  return `${ack.name ?? ''} ${ack.code ?? ''} ${ack.message ?? ''}`.trim();
}
