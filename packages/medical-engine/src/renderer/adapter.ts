/**
 * @nuclear/medical-engine — narrow Cornerstone adapter lifecycle (P3.1).
 *
 * Owns the UI-agnostic start/stop lifecycle of one Cornerstone `RenderingEngine`
 * against an injected runtime host. Volume loading (P3.2), residency (P3.3),
 * state application (P3.4) and temporary RenderTargets (P3.5) are out of scope.
 *
 * Direct `@cornerstonejs/core` imports are confined to this adapter and the
 * browser bundle entry, per ADR-003. This module is intentionally NOT reachable
 * from `src/index.ts`, so Node tests that import the package barrel never load
 * a browser-only renderer.
 */

import {
  detectRenderingCapabilities,
  Enums,
  getRenderingEngine,
  init,
  isCornerstoneInitialized,
  RenderingEngine,
} from '@cornerstonejs/core';

import {
  RendererInitializationError,
  RendererLifecycleError,
  RendererUnavailableError,
} from './errors.js';
import type { RendererTeardownFailure } from './errors.js';
import type {
  RendererAdapterState,
  RendererCapabilities,
  RendererRuntimeHost,
} from './host.js';

/** Default engine id when the caller does not supply one. */
export const DEFAULT_RENDERER_ENGINE_ID = 'nuclear-renderer-engine';
/** Default viewport id when the caller does not supply one. */
export const DEFAULT_RENDERER_VIEWPORT_ID = 'nuclear-renderer-viewport';

/** Optional identity overrides for a single adapter start. */
export interface CornerstoneAdapterStartOptions {
  readonly engineId?: string;
  readonly viewportId?: string;
}

/** Maps a detected capability payload onto the NuClear-owned contract explicitly. */
function mapDetectedCapabilities(): RendererCapabilities {
  const detected = detectRenderingCapabilities();
  return {
    webgl: detected.webgl,
    webgl2: detected.webgl2,
    maxTextureSize: detected.maxTextureSize,
    renderer: detected.renderer,
    norm16: detected.norm16,
    float: detected.float,
    floatLinear: detected.floatLinear,
    halfFloat: detected.halfFloat,
    halfFloatLinear: detected.halfFloatLinear,
    softwareRasterizer: detected.softwareRasterizer,
  };
}

/**
 * Best-effort release of a partially created engine. Never throws: it must not
 * mask the original initialization failure being reported to the caller.
 */
function bestEffortRelease(host: RendererRuntimeHost, engineId: string): void {
  try {
    getRenderingEngine(engineId)?.destroy();
  } catch {
    // Documented benign fallback: destroy() can throw when Cornerstone never
    // finished registering the engine. Releasing the container below is still
    // meaningful, and the caller receives the original error regardless.
  }
  try {
    host.removeEngineContainer(engineId);
  } catch {
    // Documented benign fallback: container removal is host-owned. A failure
    // here must not replace the actionable initialization error.
  }
}

/**
 * Owns one Cornerstone `RenderingEngine` for one injected host.
 *
 * Lifecycle: `idle` -> `started` (via `start`) -> `idle` (via `stop`).
 * A teardown that does not fully release physical state enters the retryable
 * `teardown-failed` state and throws; a clean `stop()` from `idle` is a
 * lifecycle violation, not a no-op.
 */
export class CornerstoneRendererAdapter {
  readonly #host: RendererRuntimeHost;
  readonly #engineId: string;
  readonly #viewportId: string;
  #state: RendererAdapterState = 'idle';
  #capabilities: RendererCapabilities | undefined;

  private constructor(host: RendererRuntimeHost, engineId: string, viewportId: string) {
    this.#host = host;
    this.#engineId = engineId;
    this.#viewportId = viewportId;
  }

  /**
   * Starts a renderer adapter against `host`.
   *
   * Fail-closed order: probe WebGL 2, reject a taken engine id, initialize
   * Cornerstone, create the host container, then create and enable the engine.
   * Any failure throws a typed error and leaves no registered engine behind.
   */
  static start(
    host: RendererRuntimeHost,
    options: CornerstoneAdapterStartOptions = {},
  ): CornerstoneRendererAdapter {
    const engineId = options.engineId ?? DEFAULT_RENDERER_ENGINE_ID;
    const viewportId = options.viewportId ?? DEFAULT_RENDERER_VIEWPORT_ID;

    const availability = host.probeWebGL2();
    if (!availability.ok) {
      const reason = availability.reason ? ` (${availability.reason})` : '';
      throw new RendererUnavailableError(
        `Renderer adapter '${engineId}' cannot start: the runtime host reports no WebGL 2 context${reason}. ` +
          'Ensure the runtime host provides a WebGL 2-capable context (Electron GPU or the controlled browser harness).',
      );
    }

    if (getRenderingEngine(engineId) !== undefined) {
      throw new RendererLifecycleError(
        `Renderer adapter '${engineId}' cannot start: engine id '${engineId}' is already in use. ` +
          'Stop the existing adapter first.',
      );
    }

    try {
      init();
    } catch (error) {
      throw new RendererInitializationError(
        `Renderer adapter '${engineId}' failed to initialize Cornerstone; see cause. ` +
          'Verify the pinned @cornerstonejs/core version and the WebGL 2 host.',
        { cause: error },
      );
    }
    if (!isCornerstoneInitialized()) {
      throw new RendererInitializationError(
        `Renderer adapter '${engineId}' called Cornerstone init but it did not report an initialized state. ` +
          'The runtime host must permit Cornerstone to create its rendering backends.',
      );
    }

    let container: HTMLDivElement;
    try {
      container = host.createEngineContainer(engineId);
    } catch (error) {
      throw new RendererInitializationError(
        `Renderer adapter '${engineId}' could not obtain a DOM container from the runtime host; see cause. ` +
          'The host must return an attachable HTMLDivElement.',
        { cause: error },
      );
    }

    try {
      const engine = new RenderingEngine(engineId);
      engine.enableElement({
        viewportId,
        type: Enums.ViewportType.STACK,
        element: container,
      });
    } catch (error) {
      bestEffortRelease(host, engineId);
      throw new RendererInitializationError(
        `Renderer adapter '${engineId}' failed to create or enable its rendering engine; see cause. ` +
          'The host container must be an attached, non-zero-sized HTMLDivElement.',
        { cause: error },
      );
    }

    const adapter = new CornerstoneRendererAdapter(host, engineId, viewportId);
    adapter.#state = 'started';
    return adapter;
  }

  /** The engine id this adapter owns in Cornerstone's registry. */
  get id(): string {
    return this.#engineId;
  }

  /** The viewport id enabled inside this adapter's engine. */
  get viewportId(): string {
    return this.#viewportId;
  }

  /** Current lifecycle state. */
  get state(): RendererAdapterState {
    return this.#state;
  }

  /** Detected renderer capabilities, mirrored into a NuClear-owned value. */
  get capabilities(): RendererCapabilities {
    this.#capabilities ??= mapDetectedCapabilities();
    return this.#capabilities;
  }

  /**
   * Tears the adapter down and unregisters its engine.
   *
   * Engine destruction and container removal are attempted independently: a
   * failure in one never prevents attempting the other, and container removal
   * always runs (via `finally`) even when `destroy()` throws. Teardown is only
   * reported as `idle` when no operation failed AND the engine is confirmed
   * unregistered; otherwise the adapter enters the retryable `teardown-failed`
   * state and throws a `RendererLifecycleError` carrying the failed
   * operations, so a transient host/renderer failure can self-heal on a retry.
   *
   * `resetInitialization()` is deliberately NOT called here: Cornerstone
   * initialization is process-global and multiple engines may coexist (Phase 4
   * surfaces), so resetting it on one engine's teardown would be incorrect.
   * `destroy()` releases this engine's physical resources; the harness proves
   * the registry is clean afterwards.
   */
  stop(): void {
    if (this.#state === 'idle') {
      throw new RendererLifecycleError(
        `Renderer adapter '${this.#engineId}' cannot stop from state 'idle'. ` +
          "Only an adapter in state 'started' or 'teardown-failed' can be stopped; a clean stop is not repeatable.",
      );
    }

    const failures: RendererTeardownFailure[] = [];
    try {
      try {
        getRenderingEngine(this.#engineId)?.destroy();
      } catch (error) {
        failures.push({ operation: 'engine-destroy', cause: error });
      }
    } finally {
      try {
        this.#host.removeEngineContainer(this.#engineId);
      } catch (error) {
        failures.push({ operation: 'container-removal', cause: error });
      }
    }

    const registeredAfter = getRenderingEngine(this.#engineId) !== undefined;
    if (failures.length === 0 && !registeredAfter) {
      this.#state = 'idle';
      return;
    }

    this.#state = 'teardown-failed';
    const operations = failures.map((failure) => failure.operation);
    const failedDetail =
      operations.length > 0
        ? `failed operation(s): ${operations.join(', ')}.`
        : 'engine-destroy completed without unregistering the engine.';
    const registeredDetail = registeredAfter
      ? ` The engine '${this.#engineId}' is still registered in Cornerstone.`
      : '';
    throw new RendererLifecycleError(
      `Renderer adapter '${this.#engineId}' teardown did not complete: ${failedDetail}${registeredDetail} ` +
        "The adapter is in state 'teardown-failed'; resolve the renderer/host failure and call stop() again to retry.",
      { cause: failures[0]?.cause, failures },
    );
  }
}
