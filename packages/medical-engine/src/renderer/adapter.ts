/**
 * @nuclear/medical-engine — narrow Cornerstone adapter: P3.1 lifecycle, P3.2
 * local volume loading and P3.4-B viewport resolution (stack or orthographic).
 * Direct `@cornerstonejs/core` imports stay confined to this adapter and the
 * browser bundle entry (ADR-003); `src/index.ts` never re-exports it.
 */

import {
  detectRenderingCapabilities,
  Enums,
  getRenderingEngine,
  init,
  isCornerstoneInitialized,
  RenderingEngine,
  type Types,
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
import {
  bindVolume,
  releaseBoundVolume,
  releaseBoundVolumeIfPresent,
} from './volume-binding.js';
import type { LoadedVolume, VolumeIngestionPlan } from './volume.js';

/** Default engine id when the caller does not supply one. */
export const DEFAULT_RENDERER_ENGINE_ID = 'nuclear-renderer-engine';
/** Default viewport id when the caller does not supply one. */
export const DEFAULT_RENDERER_VIEWPORT_ID = 'nuclear-renderer-viewport';

/** Optional identity overrides for a single adapter start. */
export interface CornerstoneAdapterStartOptions {
  readonly engineId?: string;
  readonly viewportId?: string;
  /**
   * Cornerstone viewport type for the enabled viewport. Defaults to `'stack'`
   * (preserving P3.1); `'orthographic'` yields a volume viewport for P3.4-B.
   */
  readonly viewportType?: 'stack' | 'orthographic';
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

/** Best-effort release of a partially created engine; never masks the original failure. */
function bestEffortRelease(host: RendererRuntimeHost, engineId: string): void {
  try {
    getRenderingEngine(engineId)?.destroy();
  } catch {
    // Documented benign fallback: destroy() can throw before registration; the
    // caller still receives the original initialization error.
  }
  try {
    host.removeEngineContainer(engineId);
  } catch {
    // Documented benign fallback: container removal is host-owned and must not
    // replace the actionable initialization error.
  }
}

/**
 * Owns one Cornerstone `RenderingEngine` for one injected host. Lifecycle:
 * `idle` -> `started` -> `idle`. A teardown that does not fully release enters
 * the retryable `teardown-failed` state; a clean `stop()` from `idle` is a
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
   * Starts a renderer adapter against `host`. Fail-closed order: probe WebGL 2,
   * reject a taken engine id, initialize Cornerstone, create the host container,
   * then create and enable the engine.
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
        type:
          options.viewportType === 'orthographic'
            ? Enums.ViewportType.ORTHOGRAPHIC
            : Enums.ViewportType.STACK,
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

  /**
   * The live Cornerstone viewport, resolved from the registered engine.
   * Fail-closed: a non-started adapter or a missing/destroyed viewport throws.
   */
  getViewport(): Types.IViewport {
    this.#assertStarted('resolve its viewport');
    const viewport = getRenderingEngine(this.#engineId)?.getViewport(this.#viewportId);
    if (viewport === undefined) {
      throw new RendererLifecycleError(
        `Renderer adapter '${this.#engineId}' has no viewport '${this.#viewportId}' registered in Cornerstone; the engine may have been destroyed.`,
      );
    }
    return viewport;
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
   * Tears the adapter down and unregisters its engine. Destruction and container
   * removal run independently; `idle` is only reported when nothing failed AND
   * the engine is confirmed unregistered, otherwise the retryable
   * `teardown-failed` state throws. `resetInitialization()` is deliberately NOT
   * called: initialization is global and engines may coexist (Phase 4).
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

  /** Loads a validated plan verbatim; fails closed unless started and uncached. */
  loadVolume(plan: VolumeIngestionPlan): LoadedVolume {
    this.#assertStarted(`load volume '${plan.volumeId}'`);
    return bindVolume(plan);
  }

  /** Releases a cached volume; a non-started adapter or unknown id fails closed. */
  releaseVolume(volumeId: string): void {
    this.#assertStarted(`release volume '${volumeId}'`);
    releaseBoundVolume(volumeId);
  }

  /**
   * Releases a cached volume when present, returning `false` for absence. Per
   * volume only (never a global purge); the lifecycle guard still fails closed.
   */
  releaseVolumeIfPresent(volumeId: string): boolean {
    this.#assertStarted(`release volume '${volumeId}' if present`);
    return releaseBoundVolumeIfPresent(volumeId);
  }

  #assertStarted(action: string): void {
    if (this.#state === 'started') {
      return;
    }
    throw new RendererLifecycleError(
      `Renderer adapter '${this.#engineId}' cannot ${action}: state is '${this.#state}', not 'started'. Start the adapter first.`,
    );
  }
}
