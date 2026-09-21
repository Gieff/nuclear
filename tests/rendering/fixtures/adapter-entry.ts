/**
 * NuClear P3.1 — browser-side adapter lifecycle probe (test infrastructure).
 *
 * Bundled by esbuild into `tests/rendering/.harness/` and driven by the
 * Playwright harness. It exercises the real `CornerstoneRendererAdapter`
 * against a real browser DOM/WebGL 2 host and exposes plain, serializable
 * results on `globalThis.__nuclearAdapterProbe` (custom `Error` fields do not
 * survive `page.evaluate`, so every method catches and returns a value object).
 *
 * Direct `@cornerstonejs/core` imports are confined to the adapter and this
 * bundle entry, per ADR-003. This file is NOT product UI.
 */

import { getRenderingEngine, isCornerstoneInitialized } from '@cornerstonejs/core';

import {
  CornerstoneRendererAdapter,
  RendererError,
  RendererLifecycleError,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import type {
  RendererCapabilities,
  RendererRuntimeHost,
  WebGL2Availability,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import {
  breakEngineDestroy,
  breakEngineDestroyOnce,
  createBrowserHost,
  probeWebGL2,
} from './adapter-host.ts';

interface AdapterErrorResult {
  readonly ok: false;
  readonly name: string;
  readonly code: string;
  readonly message: string;
}

interface StartSuccess {
  readonly ok: true;
  readonly engineId: string;
  readonly state: string;
  readonly registered: boolean;
  readonly initialized: boolean;
  readonly capabilities: RendererCapabilities;
}

type StartOutcome = StartSuccess | AdapterErrorResult;

interface StopSuccess {
  readonly ok: true;
  readonly state: string;
  readonly registeredAfter: boolean;
}

interface StopFailure extends AdapterErrorResult {
  readonly state?: string;
  readonly registeredAfter?: boolean;
  readonly failures?: readonly string[];
}

type StopOutcome = StopSuccess | StopFailure;

interface CodeOutcome {
  readonly ok: boolean;
  readonly name?: string;
  readonly code?: string;
  readonly message?: string;
}

interface FailingContainerOutcome extends CodeOutcome {
  readonly registeredAfter?: boolean;
}

interface NuclearAdapterProbe {
  start(engineId: string): StartOutcome;
  stop(): StopOutcome;
  startTwiceSameId(engineId: string): CodeOutcome;
  stopTwice(engineId: string): CodeOutcome;
  startWithFailingContainer(engineId: string): FailingContainerOutcome;
  initializeWithRealHost(engineId: string): CodeOutcome;
  startWithThrowingRemoval(engineId: string): StartOutcome;
  breakEngineDestroy(engineId: string): CodeOutcome;
  breakEngineDestroyOnce(engineId: string): CodeOutcome;
}

/** Minimal shape the shared harness reads for its `requireWebGL2` gate. */
interface NuclearRendererProbe {
  webgl2(): WebGL2Availability;
}

declare global {
  var __nuclearAdapterProbe: NuclearAdapterProbe | undefined;
  var __nuclearRendererProbe: NuclearRendererProbe | undefined;
  var __nuclearRendererProbeReady: boolean | undefined;
}

let activeAdapter: CornerstoneRendererAdapter | undefined;

function describeError(error: unknown): AdapterErrorResult {
  if (error instanceof RendererError) {
    return { ok: false, name: error.name, code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { ok: false, name: error.name, code: 'UNKNOWN', message: error.message };
  }
  return { ok: false, name: 'Error', code: 'UNKNOWN', message: String(error) };
}

function toCodeOutcome(error: unknown): CodeOutcome {
  const described = describeError(error);
  return { ok: false, name: described.name, code: described.code, message: described.message };
}

function startWithHost(host: RendererRuntimeHost, engineId: string): StartOutcome {
  try {
    const adapter = CornerstoneRendererAdapter.start(host, { engineId });
    activeAdapter = adapter;
    return {
      ok: true,
      engineId: adapter.id,
      state: adapter.state,
      registered: getRenderingEngine(engineId) !== undefined,
      initialized: isCornerstoneInitialized(),
      capabilities: adapter.capabilities,
    };
  } catch (error) {
    activeAdapter = undefined;
    return describeError(error);
  }
}

function start(engineId: string): StartOutcome {
  return startWithHost(createBrowserHost(), engineId);
}

function startWithThrowingRemoval(engineId: string): StartOutcome {
  return startWithHost(createBrowserHost({ removalThrows: true }), engineId);
}

function stop(): StopOutcome {
  const adapter = activeAdapter;
  if (!adapter) {
    return { ok: false, name: 'Error', code: 'UNKNOWN', message: 'no active adapter to stop' };
  }
  const engineId = adapter.id;
  try {
    adapter.stop();
    activeAdapter = undefined;
    return {
      ok: true,
      state: adapter.state,
      registeredAfter: getRenderingEngine(engineId) !== undefined,
    };
  } catch (error) {
    // A failed teardown keeps the active adapter so a retry can self-heal.
    const described = describeError(error);
    const failures =
      error instanceof RendererLifecycleError
        ? error.failures?.map((failure) => failure.operation)
        : undefined;
    return {
      ...described,
      state: adapter.state,
      registeredAfter: getRenderingEngine(engineId) !== undefined,
      failures,
    };
  }
}

function injectDestroyFailure(engineId: string, once: boolean): CodeOutcome {
  try {
    if (once) {
      breakEngineDestroyOnce(engineId);
    } else {
      breakEngineDestroy(engineId);
    }
    return { ok: true };
  } catch (error) {
    return toCodeOutcome(error);
  }
}

function startTwiceSameId(engineId: string): CodeOutcome {
  const first = start(engineId);
  if (!first.ok) {
    return first;
  }
  try {
    CornerstoneRendererAdapter.start(createBrowserHost(), { engineId });
    return { ok: true };
  } catch (error) {
    return toCodeOutcome(error);
  }
}

function stopTwice(engineId: string): CodeOutcome {
  const first = start(engineId);
  if (!first.ok) {
    return first;
  }
  const adapter = activeAdapter;
  if (!adapter) {
    return { ok: false, name: 'Error', code: 'UNKNOWN', message: 'adapter was not tracked' };
  }
  try {
    adapter.stop();
  } catch (error) {
    return toCodeOutcome(error);
  }
  activeAdapter = undefined;
  try {
    adapter.stop();
    return { ok: true };
  } catch (error) {
    return toCodeOutcome(error);
  }
}

function startWithFailingContainer(engineId: string): FailingContainerOutcome {
  const host: RendererRuntimeHost = {
    createEngineContainer(): HTMLDivElement {
      throw new Error('failing host refused to create an engine container');
    },
    removeEngineContainer(): void {
      // This host never creates a container, so there is nothing to remove.
    },
    probeWebGL2(): WebGL2Availability {
      return { ok: true };
    },
  };
  try {
    CornerstoneRendererAdapter.start(host, { engineId });
    return { ok: true };
  } catch (error) {
    const described = describeError(error);
    return {
      ok: false,
      name: described.name,
      code: described.code,
      message: described.message,
      registeredAfter: getRenderingEngine(engineId) !== undefined,
    };
  }
}

function initializeWithRealHost(engineId: string): CodeOutcome {
  try {
    activeAdapter = CornerstoneRendererAdapter.start(createBrowserHost(), { engineId });
    return { ok: true };
  } catch (error) {
    const described = describeError(error);
    return { ok: false, name: described.name, code: described.code, message: described.message };
  }
}

const probe: NuclearAdapterProbe = {
  start,
  stop,
  startTwiceSameId,
  stopTwice,
  startWithFailingContainer,
  initializeWithRealHost,
  startWithThrowingRemoval,
  breakEngineDestroy: (engineId: string) => injectDestroyFailure(engineId, false),
  breakEngineDestroyOnce: (engineId: string) => injectDestroyFailure(engineId, true),
};

globalThis.__nuclearRendererProbe = { webgl2: probeWebGL2 };
globalThis.__nuclearAdapterProbe = probe;
globalThis.__nuclearRendererProbeReady = true;
