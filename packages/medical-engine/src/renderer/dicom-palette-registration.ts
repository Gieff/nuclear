/**
 * @nuclear/medical-engine — typed DICOM palette registration (P3.4-B.1, browser-only).
 *
 * Maps each declarative `DICOM_PALETTE_CATALOG` entry from
 * `@nuclear/rendering-presets` explicitly onto Cornerstone's
 * `ColormapRegistration` and registers it under both the palette `name`
 * (e.g. `Hot Iron`) and its `contentLabel` (e.g. `HOT_IRON`), deduped when the
 * two are identical (e.g. `PET`). Registration uses
 * `utilities.colormap.registerColormap`, which overwrites a same-named entry,
 * so a repeated call is idempotent; a module-level flag additionally makes the
 * second call a cheap no-op that returns the same names.
 *
 * A registration failure is never swallowed: the caught error is rethrown with
 * the palette identity attached. Because this module imports
 * `@cornerstonejs/core`, it is exported only from `renderer/index.ts` and never
 * from `src/index.ts`.
 */

import { utilities } from '@cornerstonejs/core';

import {
  DICOM_PALETTE_CATALOG,
  type DicomPaletteDefinition,
} from '@nuclear/rendering-presets';

/**
 * The names one palette is registered under: its DICOM `name` and its
 * `contentLabel`, deduped when the two are identical (e.g. `PET`). Order is
 * always `name`, then `contentLabel`.
 */
function registrationNames(palette: DicomPaletteDefinition): readonly string[] {
  return palette.name === palette.contentLabel
    ? [palette.name]
    : [palette.name, palette.contentLabel];
}

/**
 * Every unique Cornerstone registry name this module creates, in catalog order.
 * The four palettes collapse to seven unique names because `PET` serves as both
 * name and content label.
 */
const REGISTERED_NAMES: readonly string[] = DICOM_PALETTE_CATALOG.flatMap(
  registrationNames,
);

let palettesRegistered = false;

/**
 * Builds the explicit Cornerstone registration for one palette under one name.
 * No object spread: every field is named so the mapping stays greppable.
 */
function toColormapRegistration(
  palette: DicomPaletteDefinition,
  name: string,
): { name: string; Name: string; ColorSpace: 'RGB'; RGBPoints: number[] } {
  return {
    name,
    Name: name,
    ColorSpace: palette.colorSpace,
    RGBPoints: [...palette.rgbPoints],
  };
}

function registerOne(palette: DicomPaletteDefinition, name: string): void {
  try {
    utilities.colormap.registerColormap(toColormapRegistration(palette, name));
  } catch (error) {
    throw new Error(
      `DICOM palette '${palette.id}' failed to register under '${name}': ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

/**
 * Registers the DICOM PS3.6 Table B.1-1 nuclear-medicine palettes with
 * Cornerstone under both their DICOM name and content label.
 *
 * @returns the seven unique registered names, in catalog order. The first call
 * performs the real registration; later calls are a cheap no-op guarded by a
 * module-level flag. Even if the registration were repeated, `registerColormap`
 * would overwrite the same-named entries rather than duplicate them.
 */
export function registerDicomPalettes(): readonly string[] {
  if (!palettesRegistered) {
    for (const palette of DICOM_PALETTE_CATALOG) {
      for (const name of registrationNames(palette)) {
        registerOne(palette, name);
      }
    }
    palettesRegistered = true;
  }
  return REGISTERED_NAMES;
}
