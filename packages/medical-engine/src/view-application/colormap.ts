/**
 * @nuclear/medical-engine — fail-closed `colormapId` resolution for view
 * application (P3.4-B.2.1).
 *
 * A persisted `dicom-*` id is a NuClear catalog id and resolves to the
 * Cornerstone registration name; a declared Cornerstone built-in (`gray`) is
 * accepted verbatim. Anything else — including a missing id — is refused: no
 * default palette is ever substituted.
 */

import { resolveDicomPaletteById } from '../palette/index.js';
import { VIEW_APPLICATION_ERROR_CODES, errorMessage, refuse } from './errors.js';

/** Cornerstone built-ins NuClear resolves explicitly. Not catalog ids. */
const BUILTIN_VIEW_COLORMAP_NAMES = ['gray'] as const;

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
  if ((BUILTIN_VIEW_COLORMAP_NAMES as readonly string[]).includes(colormapId)) {
    return colormapId;
  }
  refuse(
    VIEW_APPLICATION_ERROR_CODES.colormapUnknown,
    `colormapId '${colormapId}' is neither a declared DICOM catalog id nor a declared built-in (${BUILTIN_VIEW_COLORMAP_NAMES.join(', ')}); no default palette is substituted`,
  );
}
