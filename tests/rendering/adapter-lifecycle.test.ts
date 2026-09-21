/**
 * NuClear P3.1 — narrow Cornerstone adapter lifecycle.
 *
 * Real WebGL 2 evidence: the controlled headless Chromium harness bundles
 * `fixtures/adapter-entry.ts` (which imports the actual
 * `CornerstoneRendererAdapter`) and drives its injected runtime host. The test
 * does NOT statically import the adapter source, so the Node process never
 * loads `@cornerstonejs/core`.
 *
 * Positive: start/stop/restart/stop with no leaked engine registry entry.
 * Fail-closed negatives: missing WebGL 2, failing container creation, and the
 * two lifecycle violations.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';

import { createRendererHarness } from './fixtures/renderer-harness.mjs';

const ADAPTER_ENTRY_PATH = fileURLToPath(new URL('./fixtures/adapter-entry.ts', import.meta.url));
const WEBGL_DISABLED_ARGS = ['--disable-webgl', '--disable-webgl2'];

interface AdapterCapabilities {
  webgl: boolean;
  webgl2: boolean;
  maxTextureSize: number;
  renderer: string;
  norm16: boolean;
  float: boolean;
  floatLinear: boolean;
  halfFloat: boolean;
  halfFloatLinear: boolean;
  softwareRasterizer: boolean;
}

interface ProbeResult {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  engineId?: string;
  state?: string;
  registered?: boolean;
  registeredAfter?: boolean;
  initialized?: boolean;
  capabilities?: AdapterCapabilities;
}

async function callAdapterProbe<T>(
  page: Page,
  method: string,
  argument?: string,
): Promise<T> {
  const result: unknown = await page.evaluate(
    ({ name, value }) => {
      const scope = globalThis as unknown as {
        __nuclearAdapterProbe?: Record<string, (arg?: string) => unknown>;
      };
      const probe = scope.__nuclearAdapterProbe;
      if (!probe) {
        throw new Error('__nuclearAdapterProbe is not installed');
      }
      const fn = probe[name];
      if (typeof fn !== 'function') {
        throw new Error(`__nuclearAdapterProbe.${name} is not a function`);
      }
      return fn(value);
    },
    { name: method, value: argument },
  );
  return result as T;
}

describe('NuClear P3.1 — Cornerstone adapter lifecycle', () => {
  it('starts, stops, restarts and stops again with no leaked engine state', async () => {
    const harness = await createRendererHarness({ entryPath: ADAPTER_ENTRY_PATH });
    try {
      const first = await callAdapterProbe<ProbeResult>(harness.page, 'start', 'engine-a');
      assert.equal(first.ok, true, `adapter start failed: ${first.name ?? 'unknown'} ${first.code ?? ''}`);
      assert.equal(first.engineId, 'engine-a');
      assert.equal(first.state, 'started');
      assert.equal(first.registered, true, 'engine-a must be registered after start');
      assert.equal(first.initialized, true, 'Cornerstone must be initialized after start');
      assert.ok(first.capabilities, 'start must report capabilities');
      assert.equal(first.capabilities?.webgl2, true, 'host must expose WebGL 2');
      assert.ok((first.capabilities?.maxTextureSize ?? 0) > 0, 'expected a positive maxTextureSize');
      assert.equal(typeof first.capabilities?.renderer, 'string');
      console.log(
        `[adapter] renderer=${first.capabilities?.renderer ?? 'unknown'} ` +
          `webgl2=${String(first.capabilities?.webgl2)} maxTextureSize=${String(first.capabilities?.maxTextureSize)} ` +
          `softwareRasterizer=${String(first.capabilities?.softwareRasterizer)}`,
      );

      const firstStop = await callAdapterProbe<ProbeResult>(harness.page, 'stop');
      assert.equal(firstStop.ok, true, `adapter stop failed: ${firstStop.name ?? 'unknown'}`);
      assert.equal(firstStop.state, 'idle');
      assert.equal(firstStop.registeredAfter, false, 'engine-a must be unregistered after stop');

      const second = await callAdapterProbe<ProbeResult>(harness.page, 'start', 'engine-a');
      assert.equal(second.ok, true, `adapter restart failed: ${second.name ?? 'unknown'}`);
      assert.equal(second.registered, true, 'engine-a must register again on restart');
      assert.equal(second.initialized, true);

      const secondStop = await callAdapterProbe<ProbeResult>(harness.page, 'stop');
      assert.equal(secondStop.ok, true);
      assert.equal(secondStop.state, 'idle');
      assert.equal(secondStop.registeredAfter, false, 'engine-a must be unregistered after restart');

      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('fails closed with RendererUnavailableError when the host has no WebGL 2', async () => {
    const harness = await createRendererHarness({
      launchArgs: WEBGL_DISABLED_ARGS,
      requireWebGL2: false,
      entryPath: ADAPTER_ENTRY_PATH,
    });
    try {
      const result = await callAdapterProbe<ProbeResult>(
        harness.page,
        'initializeWithRealHost',
        'engine-unavailable',
      );
      assert.equal(result.ok, false);
      assert.equal(result.name, 'RendererUnavailableError');
      assert.equal(result.code, 'RENDERER_UNAVAILABLE');
      assert.ok(
        typeof result.message === 'string' && result.message.length > 0,
        'expected an actionable message',
      );
      assert.deepEqual(harness.pageErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('fails closed with RendererInitializationError and leaks no engine when the container is refused', async () => {
    const harness = await createRendererHarness({ entryPath: ADAPTER_ENTRY_PATH });
    try {
      const result = await callAdapterProbe<ProbeResult>(
        harness.page,
        'startWithFailingContainer',
        'engine-container',
      );
      assert.equal(result.ok, false);
      assert.equal(result.name, 'RendererInitializationError');
      assert.equal(result.code, 'RENDERER_INITIALIZATION_FAILED');
      assert.equal(result.registeredAfter, false, 'no engine may remain registered');
      assert.deepEqual(harness.pageErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('rejects a second start on an in-use engine id as a lifecycle violation', async () => {
    const harness = await createRendererHarness({ entryPath: ADAPTER_ENTRY_PATH });
    try {
      const result = await callAdapterProbe<ProbeResult>(
        harness.page,
        'startTwiceSameId',
        'engine-lifecycle',
      );
      assert.equal(result.ok, false);
      assert.equal(result.name, 'RendererLifecycleError');
      assert.equal(result.code, 'RENDERER_LIFECYCLE_VIOLATION');
      assert.deepEqual(harness.pageErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('rejects a second stop as a lifecycle violation', async () => {
    const harness = await createRendererHarness({ entryPath: ADAPTER_ENTRY_PATH });
    try {
      const result = await callAdapterProbe<ProbeResult>(
        harness.page,
        'stopTwice',
        'engine-stop-twice',
      );
      assert.equal(result.ok, false);
      assert.equal(result.name, 'RendererLifecycleError');
      assert.equal(result.code, 'RENDERER_LIFECYCLE_VIOLATION');
      assert.deepEqual(harness.pageErrors, []);
    } finally {
      await harness.close();
    }
  });
});
