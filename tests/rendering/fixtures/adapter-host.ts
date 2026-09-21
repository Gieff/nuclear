/**
 * NuClear P3.1.1 — browser runtime host and failure-injection helpers
 * (test infrastructure).
 *
 * Extracted from `adapter-entry.ts` so the probe bundle entry stays well under
 * the 300-line limit. This module is bundled into the controlled WebGL 2
 * harness and is never reachable from product code. Failure injection narrows
 * the registered Cornerstone engine with a structural interface rather than
 * `any`, so the injected `destroy` remains type-checked.
 */

import { getRenderingEngine } from '@cornerstonejs/core';

import type {
  RendererRuntimeHost,
  WebGL2Availability,
} from '../../../packages/medical-engine/src/renderer/index.ts';

/** Construction options for the controlled browser host. */
export interface BrowserHostOptions {
  /** When `true`, `removeEngineContainer` throws to exercise teardown failure. */
  readonly removalThrows?: boolean;
}

/** Minimal structural view of a registered engine, used only for injection. */
interface EngineDestructible {
  destroy(): void;
}

/** Probes for a real WebGL 2 context. Mirrors the host port contract. */
export function probeWebGL2(): WebGL2Availability {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    return { ok: false, reason: 'getContext("webgl2") returned null' };
  }
  return { ok: true };
}

/** Creates a real DOM host that attaches and detaches engine containers. */
export function createBrowserHost(options: BrowserHostOptions = {}): RendererRuntimeHost {
  const containers = new Map<string, HTMLDivElement>();
  return {
    createEngineContainer(engineId: string): HTMLDivElement {
      const element = document.createElement('div');
      element.id = engineId;
      element.style.width = '64px';
      element.style.height = '64px';
      document.body.appendChild(element);
      containers.set(engineId, element);
      return element;
    },
    removeEngineContainer(engineId: string): void {
      if (options.removalThrows) {
        throw new Error(`injected failure: host refused to remove container '${engineId}'`);
      }
      const tracked = containers.get(engineId);
      const element = tracked ?? document.getElementById(engineId);
      if (element) {
        element.remove();
      }
      containers.delete(engineId);
    },
    probeWebGL2,
  };
}

/** Resolves a registered engine or fails loudly when injection is impossible. */
function requireEngine(engineId: string): EngineDestructible {
  const engine = getRenderingEngine(engineId) as unknown as EngineDestructible | undefined;
  if (!engine) {
    throw new Error(`no registered engine '${engineId}' to inject a destroy failure into`);
  }
  return engine;
}

/** Replaces the engine `destroy` with a permanently throwing implementation. */
export function breakEngineDestroy(engineId: string): void {
  const engine = requireEngine(engineId);
  engine.destroy = () => {
    throw new Error(`injected failure: engine.destroy() failed for '${engineId}'`);
  };
}

/** Replaces `destroy` with a one-shot throwing implementation, then restores it. */
export function breakEngineDestroyOnce(engineId: string): void {
  const engine = requireEngine(engineId);
  const original = engine.destroy.bind(engine);
  engine.destroy = () => {
    engine.destroy = original;
    throw new Error(`injected failure: engine.destroy() failed once for '${engineId}'`);
  };
}
