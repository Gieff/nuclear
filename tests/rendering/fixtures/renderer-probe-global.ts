/**
 * NuClear renderer harness — single ambient declaration of the probe globals
 * shared by every esbuild browser entry (harness, adapter, volume, palette,
 * capture, application, residency). Test infrastructure only.
 *
 * Each entry previously re-declared `__nuclearRendererProbe` with its own,
 * nominally distinct `NuclearRendererProbe`, which made the duplicated `var`
 * declarations type-incompatible. Declaring the minimal shared shape exactly
 * once keeps every entry type-consistent; each entry keeps its own richer local
 * probe interface for the object it publishes.
 */

import type { WebGL2Availability } from '../../../packages/medical-engine/src/renderer/host.ts';

/** Minimal shape the shared harness reads for its `requireWebGL2` gate. */
export interface RendererProbeGlobal {
  webgl2(): WebGL2Availability;
}

declare global {
  var __nuclearRendererProbe: RendererProbeGlobal | undefined;
  var __nuclearRendererProbeReady: boolean | undefined;
}
