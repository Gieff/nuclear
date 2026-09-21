/**
 * @nuclear/medical-engine — injected renderer runtime host contract.
 *
 * This module is deliberately Node-safe: it references DOM element types only
 * and never imports `@cornerstonejs/core`. The DOM/WebGL runtime (the controlled
 * test harness in Phase 3, the Electron desktop shell in Phase 7) is supplied
 * through this narrow port, so `medical-engine` never assumes a global DOM.
 */

/** Result of probing the host for a real WebGL 2-capable context. */
export interface WebGL2Availability {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * NuClear-owned mirror of the renderer's detected capabilities. It is a
 * serializable, UI-agnostic value: no canvas, context or engine object may
 * cross this boundary.
 */
export interface RendererCapabilities {
  readonly webgl: boolean;
  readonly webgl2: boolean;
  readonly maxTextureSize: number;
  readonly renderer: string;
  readonly norm16: boolean;
  readonly float: boolean;
  readonly floatLinear: boolean;
  readonly halfFloat: boolean;
  readonly halfFloatLinear: boolean;
  readonly softwareRasterizer: boolean;
}

/**
 * Lifecycle state of a single renderer adapter.
 *
 * `teardown-failed` is a retryable terminal-until-repaired state: teardown did
 * not fully release the engine and/or container, so the adapter must never
 * report `idle` until a later `stop()` succeeds completely.
 */
export type RendererAdapterState = 'idle' | 'started' | 'teardown-failed';

/**
 * Host port supplying the DOM container and the WebGL capability probe to the
 * Cornerstone adapter. The host owns container creation, removal and probing;
 * the adapter never reaches for `document` or a browser window itself.
 */
export interface RendererRuntimeHost {
  /** Creates and attaches the element the engine renders into. */
  createEngineContainer(engineId: string): HTMLDivElement;
  /** Detaches and releases the element previously created for `engineId`. */
  removeEngineContainer(engineId: string): void;
  /** Probes the host for a real WebGL 2 context and returns a reason on failure. */
  probeWebGL2(): WebGL2Availability;
}
