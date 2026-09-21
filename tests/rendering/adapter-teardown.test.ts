/**
 * NuClear P3.1.1 — adapter teardown hardening.
 *
 * Drives the real `CornerstoneRendererAdapter` through the controlled WebGL 2
 * harness (`fixtures/adapter-entry.ts`) and injects host/engine failures to
 * prove the corrective behaviour:
 *
 *   1. a permanent `destroy()` failure never reports `idle` and keeps the
 *      engine registered while naming the failed operation;
 *   2. a throwing `removeEngineContainer()` still allows engine destruction and
 *      records `'container-removal'`;
 *   3. a transient `destroy()` failure is retryable: the second `stop()`
 *      completes and reaches `idle`.
 *
 * Like the P3.1 lifecycle suite, this file never statically imports the adapter
 * source, so the Node process never loads `@cornerstonejs/core`. Only the
 * harness factory is imported from the shared fixtures.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';

import { createRendererHarness } from './fixtures/renderer-harness.mjs';

const ADAPTER_ENTRY_PATH = fileURLToPath(new URL('./fixtures/adapter-entry.ts', import.meta.url));

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
  capabilities?: Record<string, unknown>;
  failures?: string[];
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

describe('NuClear P3.1.1 — adapter teardown hardening', () => {
  it('never reports idle and keeps the engine registered when destroy() permanently fails', async () => {
    const harness = await createRendererHarness({ entryPath: ADAPTER_ENTRY_PATH });
    try {
      const engineId = 'engine-teardown-destroy';
      const started = await callAdapterProbe<ProbeResult>(harness.page, 'start', engineId);
      assert.equal(started.ok, true, `adapter start failed: ${started.name ?? 'unknown'}`);
      assert.equal(started.registered, true, 'engine must be registered after start');

      const injected = await callAdapterProbe<ProbeResult>(
        harness.page,
        'breakEngineDestroy',
        engineId,
      );
      assert.equal(injected.ok, true, `destroy failure injection failed: ${injected.name ?? ''}`);

      const stopped = await callAdapterProbe<ProbeResult>(harness.page, 'stop');
      assert.equal(stopped.ok, false);
      assert.equal(stopped.name, 'RendererLifecycleError');
      assert.equal(stopped.code, 'RENDERER_LIFECYCLE_VIOLATION');
      assert.equal(stopped.state, 'teardown-failed');
      assert.notEqual(stopped.state, 'idle', 'a failed teardown must never report idle');
      assert.equal(stopped.registeredAfter, true, 'engine must remain registered after failure');
      assert.deepEqual(stopped.failures, ['engine-destroy']);
      assert.ok(stopped.message && stopped.message.length > 0, 'expected an actionable message');

      assert.deepEqual(harness.pageErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('still destroys the engine and records container-removal when removeEngineContainer() throws', async () => {
    const harness = await createRendererHarness({ entryPath: ADAPTER_ENTRY_PATH });
    try {
      const engineId = 'engine-teardown-removal';
      const started = await callAdapterProbe<ProbeResult>(
        harness.page,
        'startWithThrowingRemoval',
        engineId,
      );
      assert.equal(started.ok, true, `adapter start failed: ${started.name ?? 'unknown'}`);
      assert.equal(started.registered, true, 'engine must be registered after start');

      const stopped = await callAdapterProbe<ProbeResult>(harness.page, 'stop');
      assert.equal(stopped.ok, false);
      assert.equal(stopped.name, 'RendererLifecycleError');
      assert.equal(stopped.code, 'RENDERER_LIFECYCLE_VIOLATION');
      assert.equal(stopped.state, 'teardown-failed');
      assert.equal(
        stopped.registeredAfter,
        false,
        'engine destruction must still be attempted independently of container removal',
      );
      assert.ok(
        stopped.failures?.includes('container-removal'),
        `expected container-removal in failures, got ${JSON.stringify(stopped.failures)}`,
      );
      assert.ok(stopped.message && stopped.message.length > 0, 'expected an actionable message');

      assert.deepEqual(harness.pageErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('retries and reaches idle after a transient destroy() failure', async () => {
    const harness = await createRendererHarness({ entryPath: ADAPTER_ENTRY_PATH });
    try {
      const engineId = 'engine-teardown-retry';
      const started = await callAdapterProbe<ProbeResult>(harness.page, 'start', engineId);
      assert.equal(started.ok, true, `adapter start failed: ${started.name ?? 'unknown'}`);

      const injected = await callAdapterProbe<ProbeResult>(
        harness.page,
        'breakEngineDestroyOnce',
        engineId,
      );
      assert.equal(injected.ok, true, `one-shot injection failed: ${injected.name ?? ''}`);

      const firstStop = await callAdapterProbe<ProbeResult>(harness.page, 'stop');
      assert.equal(firstStop.ok, false);
      assert.equal(firstStop.name, 'RendererLifecycleError');
      assert.equal(firstStop.code, 'RENDERER_LIFECYCLE_VIOLATION');
      assert.equal(firstStop.state, 'teardown-failed');
      assert.equal(firstStop.registeredAfter, true, 'engine must remain registered after first failure');
      assert.deepEqual(firstStop.failures, ['engine-destroy']);

      const secondStop = await callAdapterProbe<ProbeResult>(harness.page, 'stop');
      assert.equal(secondStop.ok, true, `retry failed: ${secondStop.name ?? 'unknown'}`);
      assert.equal(secondStop.state, 'idle');
      assert.equal(secondStop.registeredAfter, false, 'engine must be unregistered after retry');

      assert.deepEqual(harness.pageErrors, []);
    } finally {
      await harness.close();
    }
  });
});
