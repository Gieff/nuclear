/**
 * NuClear P3.0 — browser-side Cornerstone3D renderer probe.
 *
 * This module is test infrastructure only. It is bundled by esbuild into an
 * IIFE (`tests/rendering/.harness/harness-bundle.js`) and loaded by the
 * Playwright-controlled headless Chromium page. It exposes a small, plain,
 * JSON-serializable probe on `globalThis` so the Node test can drive real
 * Cornerstone initialization, engine lifecycle and capability detection.
 *
 * It deliberately does NOT implement any product adapter: `@nuclear/medical-engine`
 * owns that from P3.1. Direct `@cornerstonejs/core` imports are confined here
 * and (later) to the adapter, per ADR-003.
 */

import {
  detectRenderingCapabilities,
  Enums,
  getRenderingEngine,
  init,
  isCornerstoneInitialized,
  RenderingEngine,
  resetInitialization,
  version as cornerstoneVersion,
} from '@cornerstonejs/core';

interface WebGL2ProbeResult {
  ok: boolean;
  reason?: string;
  version?: string;
  renderer?: string;
  vendor?: string;
  max3DTexture?: number;
  colorBufferFloat?: boolean;
  floatLinear?: boolean;
}

interface InitProbeResult {
  initReturn: boolean;
  initialized: boolean;
  version: string;
}

interface StartEngineResult {
  engineId: string;
  registered: boolean;
  viewportEnabled: boolean;
  viewportError?: string;
}

interface DestroyEngineResult {
  registeredAfter: boolean;
}

interface ResetProbeResult {
  initialized: boolean;
}

type RenderingCapabilities = ReturnType<typeof detectRenderingCapabilities>;

interface NuclearRendererProbe {
  webgl2(): WebGL2ProbeResult;
  init(): InitProbeResult;
  capabilities(): RenderingCapabilities;
  startEngine(id: string): StartEngineResult;
  destroyEngine(id: string): DestroyEngineResult;
  isRegistered(id: string): boolean;
  reset(): ResetProbeResult;
}

declare global {
  var __nuclearRendererProbe: NuclearRendererProbe | undefined;
  var __nuclearRendererProbeReady: boolean | undefined;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function probeWebGL2(): WebGL2ProbeResult {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    return { ok: false, reason: 'getContext("webgl2") returned null' };
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  const vendor = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL))
    : String(gl.getParameter(gl.VENDOR));

  return {
    ok: true,
    version: String(gl.getParameter(gl.VERSION)),
    renderer,
    vendor,
    max3DTexture: Number(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)),
    colorBufferFloat: gl.getExtension('EXT_color_buffer_float') !== null,
    floatLinear: gl.getExtension('OES_texture_float_linear') !== null,
  };
}

function probeInit(): InitProbeResult {
  const initReturn = init();
  return {
    initReturn,
    initialized: isCornerstoneInitialized(),
    version: cornerstoneVersion,
  };
}

function probeStartEngine(id: string): StartEngineResult {
  const element = document.createElement('div');
  element.id = id;
  element.style.width = '64px';
  element.style.height = '64px';
  document.body.appendChild(element);

  // Registers the engine (its backend implementation) in Cornerstone's
  // registry, retrievable by id via `getRenderingEngine`.
  const engine = new RenderingEngine(id);
  let viewportEnabled = false;
  let viewportError: string | undefined;
  try {
    engine.enableElement({
      viewportId: `${id}-viewport`,
      type: Enums.ViewportType.STACK,
      element,
    });
    viewportEnabled = true;
  } catch (error) {
    viewportError = describeError(error);
  }

  return {
    engineId: id,
    registered: getRenderingEngine(id) !== undefined,
    viewportEnabled,
    ...(viewportError === undefined ? {} : { viewportError }),
  };
}

function probeDestroyEngine(id: string): DestroyEngineResult {
  const engine = getRenderingEngine(id);
  if (engine) {
    engine.destroy();
  }
  const element = document.getElementById(id);
  if (element) {
    element.remove();
  }
  return { registeredAfter: getRenderingEngine(id) !== undefined };
}

const probe: NuclearRendererProbe = {
  webgl2: probeWebGL2,
  init: probeInit,
  capabilities: () => detectRenderingCapabilities(),
  startEngine: probeStartEngine,
  destroyEngine: probeDestroyEngine,
  isRegistered: (id: string) => getRenderingEngine(id) !== undefined,
  reset: () => {
    resetInitialization();
    return { initialized: isCornerstoneInitialized() };
  },
};

globalThis.__nuclearRendererProbe = probe;
globalThis.__nuclearRendererProbeReady = true;
