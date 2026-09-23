/**
 * NuClear P5.5b — serializable probe shapes for the publication renderer port
 * evidence (test infrastructure).
 *
 * Every shape is plain and serializable because custom `Error` fields do not
 * survive `page.evaluate`. Test-only; never reachable from product code.
 */

import type { LiveSnapshot } from './target-probe-types.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';

/** One rendered panel as observed across the browser boundary. */
export interface PublicationPanelProbe {
  readonly panelId: string;
  readonly pixelDimensions: number[];
  readonly byteLength: number;
  readonly colorProfile: string;
}

/** Result of one live publication render through the real port adapter. */
export interface PublicationProbeAck {
  readonly ok: boolean;
  readonly name?: string;
  readonly code?: string;
  readonly message?: string;
  readonly stack?: string;
  readonly renderMode?: string;
  readonly renderStateHash?: string;
  readonly panels?: PublicationPanelProbe[];
  /** Number of temporary-target engine containers left in the DOM after the run. */
  readonly targetContainersAfter?: number;
  readonly before?: LiveSnapshot;
  readonly after?: LiveSnapshot;
}

export interface PublicationProbeInput {
  readonly ct: VolumeProbeInput;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly dpi: number;
  readonly availability?: 'online' | 'missing';
}

declare global {
  var __nuclearPublicationProbe:
    | {
        renderPublicationPanel(input: PublicationProbeInput): Promise<PublicationProbeAck>;
      }
    | undefined;
}
