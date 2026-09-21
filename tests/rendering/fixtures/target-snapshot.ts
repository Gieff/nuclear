/**
 * NuClear P3.5-B — live viewport snapshot helpers for the temporary
 * RenderTarget probe (test infrastructure).
 *
 * Reads the real live adapter's element, canvas, aspect ratio, full camera,
 * blend mode, actor count and per-layer Cornerstone properties so the export
 * invariance can be asserted value-by-value. It creates no DOM and no engine of
 * its own. Test-only; never reachable from product code.
 */

import { Enums } from '@cornerstonejs/core';

import type { CornerstoneRendererAdapter } from '../../../packages/medical-engine/src/renderer/index.ts';
import type { LiveLayerProperties, LiveSnapshot } from './target-probe-types.ts';

/** Structural view of the live volume viewport read by the snapshot. */
interface SnapshotViewport {
  readonly element: HTMLDivElement;
  getCanvas(): HTMLCanvasElement;
  getAspectRatio(): number[];
  getCamera(): Record<string, unknown>;
  getBlendMode(): number;
  getActors(): { referencedId?: unknown }[];
  getProperties(volumeId: string): {
    voiRange?: { lower?: unknown; upper?: unknown };
    colormap?: { name?: unknown; opacity?: unknown };
    invert?: unknown;
    interpolationType?: unknown;
  };
}

/** Returns the value as a number, or NaN when it is missing/non-numeric. */
function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

/**
 * Copies every enumerable camera field. Numeric/string/boolean primitives are
 * carried verbatim; arrays and typed arrays are flattened to plain number
 * arrays. Functions and nested objects are omitted rather than stringified.
 */
function serializeCamera(camera: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(camera)) {
    if (value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      snapshot[key] = value;
    } else if (Array.isArray(value)) {
      snapshot[key] = Array.from(value as unknown[]);
    } else if (ArrayBuffer.isView(value)) {
      snapshot[key] = Array.from(value as unknown as ArrayLike<number>);
    }
  }
  return snapshot;
}

/**
 * Snapshots the live interactive viewport. The per-layer properties are read
 * with the caller-supplied applied volume ids via the real
 * `viewport.getProperties(volumeId)` and are never inferred from the plan.
 */
export function captureLiveSnapshot(
  adapter: CornerstoneRendererAdapter,
  volumeIds: readonly string[],
): LiveSnapshot {
  const viewport = adapter.getViewport() as unknown as SnapshotViewport;
  const canvas = viewport.getCanvas();
  const actors = viewport.getActors();

  const layers: LiveLayerProperties[] = [];
  for (const volumeId of volumeIds) {
    const properties = viewport.getProperties(volumeId);
    const voiRange = properties.voiRange ?? {};
    const colormap = properties.colormap ?? {};
    layers.push({
      volumeId,
      voiRange: { lower: asNumber(voiRange.lower), upper: asNumber(voiRange.upper) },
      colormapName: typeof colormap.name === 'string' ? colormap.name : '',
      colormapOpacity: asNumber(colormap.opacity),
      invert: properties.invert === true,
      interpolationType: asNumber(properties.interpolationType),
    });
  }

  return {
    elementSizePx: [viewport.element.clientWidth, viewport.element.clientHeight],
    canvasSizePx: [canvas.width, canvas.height],
    aspectRatio: viewport.getAspectRatio(),
    camera: serializeCamera(viewport.getCamera()),
    blendMode: String(Enums.BlendModes[viewport.getBlendMode()]),
    actorCount: actors.length,
    layers,
  };
}

/** Deep JSON clone used to prove the live plan/state inputs are not mutated. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
