/**
 * @nuclear/medical-engine — browser-only fail-closed guards for
 * `applyViewApplication` (P3.4-B.2.2.4).
 *
 * These guards read real renderer state and are deliberately kept out of the
 * pure `view-application` module: they import `@cornerstonejs/core` and are
 * reachable only from browser bundles through `renderer/index.ts`.
 */

import { cache } from '@cornerstonejs/core';

import {
  VIEW_APPLICATION_ERROR_CODES,
  ViewApplicationError,
} from '../view-application/index.js';
import type { ViewApplicationPlan } from '../view-application/index.js';

/** Minimal element shape read to measure a mounted viewport. */
interface MeasurableViewport {
  readonly element?: {
    readonly clientWidth?: unknown;
    readonly clientHeight?: unknown;
  };
}

/**
 * Reads the mounted viewport size from the viewport's own element, never from
 * the caller. Fail-closed: a missing or non-positive/non-integer element size
 * refuses rather than validating the pixel mapping against a caller-declared
 * number.
 */
export function mountedViewportSize(viewport: MeasurableViewport): readonly [number, number] {
  const width = viewport.element?.clientWidth;
  const height = viewport.element?.clientHeight;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new ViewApplicationError(
      VIEW_APPLICATION_ERROR_CODES.viewportReadbackFailed,
      `mounted viewport element has no positive integer pixel size (width=${String(width)}, height=${String(height)}): refusing to validate the patient/view-plane to pixel mapping against an unmeasured viewport`,
    );
  }
  return [width, height];
}

/**
 * Refuses any plan layer whose volume is not resident in Cornerstone's real
 * cache. `ViewGeometryEvidence` is caller-supplied and may claim a volume is
 * resident; this independent check reads the engine's actual state.
 */
export function assertVolumesCached(plan: ViewApplicationPlan): void {
  for (const layer of plan.layers) {
    if (cache.getVolume(layer.volumeId) === undefined) {
      throw new ViewApplicationError(
        VIEW_APPLICATION_ERROR_CODES.volumeNotResident,
        `layer '${layer.assetId}' maps to volume '${layer.volumeId}', which is not resident in Cornerstone's cache: refusing to composite a volume that is not actually available`,
      );
    }
  }
}
