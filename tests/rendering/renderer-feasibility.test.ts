/**
 * NuClear P3.0 — real WebGL 2 Cornerstone3D renderer feasibility.
 *
 * Positive case: a controlled headless Chromium page runs the real
 * `@cornerstonejs/core@5.10.7` bundle, detects WebGL 2, initializes
 * Cornerstone, creates/destroys a `RenderingEngine` with a STACK viewport,
 * resets initialization and completes a second init/engine/teardown cycle
 * with zero console/page errors.
 *
 * Fail-closed case: with WebGL disabled the harness must reject with a
 * `RendererUnavailableError`, and the probe must report `ok === false` with a
 * reason when WebGL 2 is not required.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Page } from 'playwright';

import { createRendererHarness, RendererUnavailableError } from './fixtures/renderer-harness.mjs';

type ProbeMethod =
  | 'webgl2'
  | 'init'
  | 'capabilities'
  | 'startEngine'
  | 'destroyEngine'
  | 'isRegistered'
  | 'reset';

interface WebGL2Result {
  ok: boolean;
  reason?: string;
  version?: string;
  renderer?: string;
  vendor?: string;
  max3DTexture?: number;
  colorBufferFloat?: boolean;
  floatLinear?: boolean;
}

interface InitResult {
  initReturn: boolean;
  initialized: boolean;
  version: string;
}

interface CapabilitiesResult {
  webgl: boolean;
  webgl2: boolean;
  maxTextureSize: number;
  renderer: string;
  softwareRasterizer: boolean;
  [key: string]: unknown;
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

interface ResetResult {
  initialized: boolean;
}

async function callProbe<T>(page: Page, method: ProbeMethod, argument?: string): Promise<T> {
  const result: unknown = await page.evaluate(
    ({ name, value }) => {
      const scope = globalThis as unknown as {
        __nuclearRendererProbe?: Record<string, (arg?: string) => unknown>;
      };
      const probe = scope.__nuclearRendererProbe;
      if (!probe) {
        throw new Error('__nuclearRendererProbe is not installed');
      }
      const fn = probe[name];
      if (typeof fn !== 'function') {
        throw new Error(`__nuclearRendererProbe.${name} is not a function`);
      }
      return fn(value);
    },
    { name: method, value: argument },
  );
  return result as T;
}

const WEBGL_DISABLED_ARGS = ['--disable-webgl', '--disable-webgl2'];

describe('NuClear P3.0 — controlled WebGL 2 renderer harness', () => {
  it('initializes real Cornerstone, manages engine lifecycle, resets and recycles', async () => {
    const harness = await createRendererHarness();
    try {
      const webgl2 = await harness.webgl2();
      assert.equal(webgl2.ok, true, `WebGL 2 probe failed: ${webgl2.reason ?? 'no reason'}`);
      assert.ok(
        typeof webgl2.version === 'string' && webgl2.version.startsWith('WebGL 2.0'),
        `unexpected WebGL version: ${String(webgl2.version)}`,
      );
      assert.ok((webgl2.max3DTexture ?? 0) > 0, 'expected a positive MAX_3D_TEXTURE_SIZE');
      assert.equal(webgl2.floatLinear, true, 'expected OES_texture_float_linear');

      const init = await callProbe<InitResult>(harness.page, 'init');
      assert.deepEqual(init, { initReturn: true, initialized: true, version: '5.10.7' });

      const capabilities = await callProbe<CapabilitiesResult>(harness.page, 'capabilities');
      assert.equal(capabilities.webgl2, true, 'expected WebGL 2 in Cornerstone capabilities');
      assert.ok(capabilities.maxTextureSize > 0, 'expected a positive maxTextureSize');
      assert.equal(typeof capabilities.renderer, 'string');
      if (harness.launchArgs.includes('--use-angle=swiftshader')) {
        assert.equal(
          capabilities.softwareRasterizer,
          true,
          'default SwiftShader backend must report softwareRasterizer',
        );
      }
      // Reported honestly for the run log; never treated as a hardware PASS.
      console.log(
        `[renderer] backend=${harness.launchArgs.join(' ') || '(default)'} ` +
          `renderer=${capabilities.renderer} softwareRasterizer=${String(capabilities.softwareRasterizer)} ` +
          `maxTextureSize=${capabilities.maxTextureSize} max3DTexture=${webgl2.max3DTexture} ` +
          `vendor=${String(webgl2.vendor)}`,
      );

      const first = await callProbe<StartEngineResult>(harness.page, 'startEngine', 'engine-a');
      assert.equal(first.registered, true, 'expected engine-a to register');
      assert.equal(
        first.viewportEnabled,
        true,
        `enableElement failed: ${first.viewportError ?? 'no error reported'}`,
      );

      const firstDestroy = await callProbe<DestroyEngineResult>(
        harness.page,
        'destroyEngine',
        'engine-a',
      );
      assert.equal(firstDestroy.registeredAfter, false, 'engine-a must be unregistered after destroy');

      const reset = await callProbe<ResetResult>(harness.page, 'reset');
      assert.equal(reset.initialized, false, 'resetInitialization must clear initialization');

      const secondInit = await callProbe<InitResult>(harness.page, 'init');
      assert.equal(secondInit.initReturn, true);
      assert.equal(secondInit.initialized, true);

      const second = await callProbe<StartEngineResult>(harness.page, 'startEngine', 'engine-b');
      assert.equal(second.registered, true, 'expected engine-b to register on the second cycle');
      assert.equal(
        second.viewportEnabled,
        true,
        `enableElement failed on the second cycle: ${second.viewportError ?? 'no error reported'}`,
      );

      const secondDestroy = await callProbe<DestroyEngineResult>(
        harness.page,
        'destroyEngine',
        'engine-b',
      );
      assert.equal(secondDestroy.registeredAfter, false, 'engine-b must be unregistered after destroy');

      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('fails closed when WebGL 2 is unavailable', async () => {
    await assert.rejects(
      createRendererHarness({ launchArgs: WEBGL_DISABLED_ARGS, requireWebGL2: true }),
      (error: unknown) => {
        assert.ok(
          error instanceof RendererUnavailableError,
          `expected RendererUnavailableError, got ${String(error)}`,
        );
        assert.equal(error.code, 'RENDERER_UNAVAILABLE');
        return true;
      },
    );

    const harness = await createRendererHarness({
      launchArgs: WEBGL_DISABLED_ARGS,
      requireWebGL2: false,
    });
    try {
      const webgl2 = await harness.webgl2();
      assert.equal(webgl2.ok, false, 'expected WebGL 2 to be unavailable');
      assert.ok(
        typeof webgl2.reason === 'string' && webgl2.reason.length > 0,
        'expected a non-empty unavailability reason',
      );
    } finally {
      await harness.close();
    }
  });
});
