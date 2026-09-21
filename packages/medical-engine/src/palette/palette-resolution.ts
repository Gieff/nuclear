/**
 * @nuclear/medical-engine — typed DICOM palette id resolution (P3.4-B.1.1).
 *
 * The persisted `colormapId` canonical form is the stable NuClear catalog id
 * (e.g. `dicom-pet`), never the DICOM content label or the Cornerstone
 * registration name. Before P3.4-B.2 applies a palette with `setProperties`,
 * it resolves that id here to the Cornerstone registry name.
 *
 * This module is Node-safe and fail-closed: it imports only
 * `@nuclear/rendering-presets` (no `@cornerstonejs/core`) and never falls back
 * to a default palette. An unknown or empty id raises a typed
 * `PaletteResolutionError` so a typo cannot silently render a different
 * transfer function.
 */

import {
  findDicomPaletteById,
  type DicomPaletteDefinition,
} from '@nuclear/rendering-presets';

export const PALETTE_RESOLUTION_ERROR_CODES = {
  paletteNotFound: 'PALETTE_NOT_FOUND',
} as const;

export type PaletteResolutionErrorCode =
  (typeof PALETTE_RESOLUTION_ERROR_CODES)[keyof typeof PALETTE_RESOLUTION_ERROR_CODES];

export class PaletteResolutionError extends Error {
  readonly code: PaletteResolutionErrorCode;

  constructor(code: PaletteResolutionErrorCode, message: string) {
    super(message);
    this.name = 'PaletteResolutionError';
    this.code = code;
  }
}

/** A catalog palette reduced to what a `setProperties` caller needs. */
export interface ResolvedPalette {
  /** Stable NuClear id, e.g. `dicom-pet` (the persisted `colormapId`). */
  readonly id: string;
  /** Cornerstone registration name for `colormap`, e.g. `PET`. */
  readonly cornerstoneColormapName: string;
  /** DICOM content label, e.g. `PET_20_STEP`. */
  readonly contentLabel: string;
  /** DICOM SOP Instance UID, e.g. `1.2.840.10008.1.5.2`. */
  readonly sopUid: string;
}

function toResolvedPalette(palette: DicomPaletteDefinition): ResolvedPalette {
  return {
    id: palette.id,
    cornerstoneColormapName: palette.name,
    contentLabel: palette.contentLabel,
    sopUid: palette.sopUid,
  };
}

/**
 * Resolves a persisted `colormapId` to its Cornerstone registration name.
 *
 * @throws {PaletteResolutionError} with code `PALETTE_NOT_FOUND` when the id
 * does not name a declared catalog palette (unknown or empty). No default
 * palette is substituted.
 */
export function resolveDicomPaletteById(colormapId: string): ResolvedPalette {
  const palette = findDicomPaletteById(colormapId);
  if (!palette) {
    throw new PaletteResolutionError(
      PALETTE_RESOLUTION_ERROR_CODES.paletteNotFound,
      `DICOM palette '${colormapId}' is not a declared catalog id; colormapId must be a declared NuClear DICOM palette id (e.g. 'dicom-pet'). No default palette is applied.`,
    );
  }
  return toResolvedPalette(palette);
}
