/**
 * @nuclear/medical-engine — fail-closed projection mapping for view
 * application (P3.4-B.2.1).
 *
 * `slice` always composites with no slab. MIP/MinIP/Average require a
 * caller-declared finite slab strictly greater than 0; no slab is inferred.
 */

import type { ProjectionState } from '@nuclear/shared-types';
import { VIEW_APPLICATION_ERROR_CODES, refuse } from './errors.js';
import type {
  ViewProjectionApplication,
  ViewProjectionBlendMode,
} from './types.js';

export function resolveProjection(
  projection: ProjectionState,
): ViewProjectionApplication {
  const mode = projection.mode;
  if (mode === 'slice') {
    return { mode, blendMode: 'COMPOSITE', slabThicknessMm: undefined };
  }
  if (mode !== 'MIP' && mode !== 'MinIP' && mode !== 'Average') {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.projectionInvalid,
      `unknown projection mode '${String(mode)}'; expected slice, MIP, MinIP or Average`,
    );
  }
  const slab = projection.slabThicknessMm;
  if (slab === undefined || !Number.isFinite(slab) || !(slab > 0)) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.projectionInvalid,
      `${mode} projection requires a finite slabThicknessMm strictly greater than 0, received ${String(slab)}; no slab is inferred`,
    );
  }
  const blendMode: ViewProjectionBlendMode =
    mode === 'MIP'
      ? 'MAXIMUM_INTENSITY_BLEND'
      : mode === 'MinIP'
        ? 'MINIMUM_INTENSITY_BLEND'
        : 'AVERAGE_INTENSITY_BLEND';
  return { mode, blendMode, slabThicknessMm: slab };
}
