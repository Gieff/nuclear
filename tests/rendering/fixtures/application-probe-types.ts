/**
 * NuClear P3.4-B.2.2.4 — shared browser-probe types for the application harness.
 *
 * Split out of `application-entry.ts` so that file stays within the 300-line
 * gate. Type-only plus the global probe declarations; no runtime code.
 */

import type { AppliedViewState } from '../../../packages/medical-engine/src/renderer/index.ts';
import type { probeWebGL2 } from './adapter-host.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';

export type NegativeScenario =
  | 'missing-resident'
  | 'evidence-not-cached'
  | 'for-mismatch'
  | 'invalid-transform'
  | 'viewport-size-mismatch'
  | 'zero-size-viewport'
  | 'unresolved-palette'
  | 'slice-position'
  | 'unsupported-scheme';

export interface ApplicationAck {
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

export interface NuclearApplicationProbe {
  viewport(): ApplicationAck;
  applyCt(input: VolumeProbeInput, colormapId?: string, slabThicknessMm?: number): Promise<ApplicationAck>;
  applyFusion(inputs: { ct: VolumeProbeInput; pet: VolumeProbeInput }): Promise<ApplicationAck>;
  applyCoregFusion(inputs: {
    ct: VolumeProbeInput;
    pet: VolumeProbeInput;
    suvFactor: number;
  }): Promise<ApplicationAck>;
  negative(
    inputs: { ct: VolumeProbeInput; pet: VolumeProbeInput },
    scenario: NegativeScenario,
  ): Promise<ApplicationAck>;
  teardown(): ApplicationAck;
}

export interface NuclearRendererProbe {
  webgl2(): ReturnType<typeof probeWebGL2>;
}

declare global {
  var __nuclearApplicationProbe: NuclearApplicationProbe | undefined;
}
