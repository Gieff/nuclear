/**
 * NuClear P5.7 — vendored embedded-font access (test infrastructure, ADR-015
 * OD-6e). `figure-engine` never imports this module.
 */

import { readFileSync } from 'node:fs';

import fontkit from '@pdf-lib/fontkit';

let cachedFontBytes: Uint8Array | undefined;

/** Loads the vendored Inter Regular TTF (SIL OFL 1.1) on first use. */
export function vendoredInterBytes(): Uint8Array {
  if (cachedFontBytes === undefined) {
    cachedFontBytes = new Uint8Array(
      readFileSync(new URL('./fonts/Inter-Regular.ttf', import.meta.url)),
    );
  }
  return cachedFontBytes;
}

/**
 * The embedded font's real metrics (family + ascent/em), for the pure mapping.
 * The family is declared (not parsed from the TTF name table) because the
 * adapter is the single configured v1 font; a caller supplying `fontBytes` must
 * keep the mapping's declared family consistent with it.
 */
export function vendoredInterFontMetrics(): { family: string; ascentRatio: number } {
  const font = fontkit.create(vendoredInterBytes()) as unknown as {
    ascent: number;
    unitsPerEm: number;
  };
  return { family: 'Inter', ascentRatio: font.ascent / font.unitsPerEm };
}
