/**
 * NuClear P3.4-B.1 — browser-side DICOM palette registration probe
 * (test infrastructure).
 *
 * Bundled by esbuild into `tests/rendering/.harness/` and driven by the
 * controlled WebGL 2 Playwright harness. It registers the real
 * `@nuclear/rendering-presets` catalog through the real
 * `registerDicomPalettes()` adapter, twice, and reports the Cornerstone
 * colormap registry state. Results are plain and serializable because custom
 * `Error` fields do not survive `page.evaluate`.
 *
 * This file is NOT product UI and is never reachable from product code.
 */

import { utilities } from '@cornerstonejs/core';

import { registerDicomPalettes } from '../../../packages/medical-engine/src/renderer/index.ts';
import { probeWebGL2 } from './adapter-host.ts';

/**
 * The seven unique names the registration contract must place in Cornerstone's
 * registry (each palette's `name` and `contentLabel`, deduped for `PET`).
 */
const REQUIRED_NAMES = [
  'PET',
  'HOT_IRON',
  'Hot Iron',
  'Hot Metal Blue',
  'HOT_METAL_BLUE',
  'PET 20 Step',
  'PET_20_STEP',
] as const;

interface PaletteAck {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  names?: string[];
  secondCallNames?: string[];
  petRgbPointCount?: number;
  hotIronRgbPointCount?: number;
  namesInclude?: Record<string, boolean>;
}

interface NuclearPaletteProbe {
  registerTwice(): PaletteAck;
}

declare global {
  var __nuclearPaletteProbe: NuclearPaletteProbe | undefined;
}

function describeError(error: unknown): PaletteAck {
  if (error instanceof Error) {
    return { ok: false, name: error.name, code: 'UNKNOWN', message: error.message };
  }
  return { ok: false, name: 'Error', code: 'UNKNOWN', message: String(error) };
}

function rgbPointCount(name: string): number {
  const colormap = utilities.colormap.getColormap(name) as
    | { RGBPoints?: unknown }
    | undefined;
  return Array.isArray(colormap?.RGBPoints) ? colormap.RGBPoints.length : -1;
}

/** Registers the catalog twice and reports registry names and RGB point counts. */
function registerTwice(): PaletteAck {
  try {
    const names = [...registerDicomPalettes()];
    const secondCallNames = [...registerDicomPalettes()];
    const registryNames = utilities.colormap.getColormapNames();
    const namesInclude: Record<string, boolean> = {};
    for (const required of REQUIRED_NAMES) {
      namesInclude[required] = registryNames.includes(required);
    }
    return {
      ok: true,
      names,
      secondCallNames,
      petRgbPointCount: rgbPointCount('PET'),
      hotIronRgbPointCount: rgbPointCount('Hot Iron'),
      namesInclude,
    };
  } catch (error) {
    return describeError(error);
  }
}

globalThis.__nuclearRendererProbe = { webgl2: probeWebGL2 };
globalThis.__nuclearPaletteProbe = { registerTwice };
globalThis.__nuclearRendererProbeReady = true;
