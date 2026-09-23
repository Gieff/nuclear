/**
 * NuClear P5.5b — Node-side helpers for the publication renderer port harness
 * test (test infrastructure). No product code and no DOM here.
 */

import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import type { PublicationProbeAck } from './publication-probe-types.ts';

export const PUBLICATION_ENTRY_PATH = fileURLToPath(
  new URL('./publication-entry.ts', import.meta.url),
);

/** Invokes the publication probe method and returns its serializable ack. */
export function callPublicationProbe(
  page: Page,
  name: string,
  args: unknown[],
): Promise<PublicationProbeAck> {
  return page.evaluate(
    ({ probeName, probeArgs }: { probeName: string; probeArgs: unknown[] }) => {
      const scope = globalThis as unknown as {
        __nuclearPublicationProbe?: Record<string, (...a: unknown[]) => unknown>;
      };
      const probe = scope.__nuclearPublicationProbe;
      if (!probe) {
        throw new Error('__nuclearPublicationProbe is not installed');
      }
      return probe[probeName](...probeArgs);
    },
    { probeName: name, probeArgs: args },
  ) as Promise<PublicationProbeAck>;
}

export function describePublicationAck(ack: PublicationProbeAck): string {
  return `${ack.name ?? ''} ${ack.code ?? ''} ${ack.message ?? ''}`.trim();
}
