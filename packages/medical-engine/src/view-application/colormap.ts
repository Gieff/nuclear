/**
 * @nuclear/medical-engine — fail-closed `colormapId` resolution for view
 * application (P3.4-B.2.1).
 *
 * A persisted `dicom-*` id is a NuClear catalog id and resolves to the
 * Cornerstone registration name; a declared NuClear built-in id resolves to the
 * Cornerstone/vtk preset name it denotes. The persisted `colormapId` remains
 * the NuClear id — this map is the only place the renderer-facing preset name
 * is chosen, with no alias registration or resampling. Anything else —
 * including a missing id — is refused: no default palette is ever substituted.
 */

import { resolveDicomPaletteById } from '../palette/index.js';
import { VIEW_APPLICATION_ERROR_CODES, errorMessage, refuse } from './errors.js';

/** Declared NuClear built-in ids mapped to the Cornerstone/vtk preset they denote. */
const BUILTIN_VIEW_COLORMAPS: Readonly<Record<string, string>> = { gray: 'Grayscale' };

export function resolveViewColormapName(colormapId: string | undefined): string {
  if (colormapId === undefined || colormapId.length === 0) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.colormapUnknown,
      'colormapId is required; no default palette is substituted',
    );
  }
  if (colormapId.startsWith('dicom-')) {
    try {
      return resolveDicomPaletteById(colormapId).cornerstoneColormapName;
    } catch (error) {
      refuse(
        VIEW_APPLICATION_ERROR_CODES.colormapUnknown,
        `colormapId '${colormapId}' is not a declared DICOM catalog id: ${errorMessage(error)}`,
        error,
      );
    }
  }
  const mapped = Object.prototype.hasOwnProperty.call(BUILTIN_VIEW_COLORMAPS, colormapId)
    ? BUILTIN_VIEW_COLORMAPS[colormapId]
    : undefined;
  if (mapped !== undefined) {
    return mapped;
  }
  refuse(
    VIEW_APPLICATION_ERROR_CODES.colormapUnknown,
    `colormapId '${colormapId}' is neither a declared DICOM catalog id nor a declared built-in id (${Object.keys(BUILTIN_VIEW_COLORMAPS).join(', ')}); no default palette is substituted`,
  );
}
