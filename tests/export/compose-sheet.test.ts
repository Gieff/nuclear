/**
 * NuClear P5.6 — pure flattened sheet compositor (ADR-015).
 *
 * Pure Node: no DOM, no WebGL, no encoder. Uses a millimetre-friendly DPI
 * (25.4) so physical millimetres map 1:1 to pixels.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type {
  FigurePanelId,
  FigureSheetId,
} from '../../packages/shared-types/src/index.js';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  composeSheetRgba,
} = await import('../../packages/figure-engine/src/publication/index.ts');

const DPI = 25.4;

function rgbaAt(rgba: Uint8Array, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4;
  return [rgba[offset], rgba[offset + 1], rgba[offset + 2], rgba[offset + 3]];
}

function planWith(overrides: Record<string, unknown> = {}) {
  return {
    sheetId: 'sheet' as FigureSheetId,
    sheetSizeMm: [4, 3],
    dpi: DPI,
    pixelDimensions: [4, 3],
    backgroundColor: '#ffffff',
    layers: [],
    ...overrides,
  } as never;
}

describe('NuClear P5.6 — flattened sheet compositor', () => {
  it('1. fills the background and places an opaque layer without blending', () => {
    const layer = {
      panelId: 'panel-a' as FigurePanelId,
      rectMm: { xMm: 1, yMm: 1, widthMm: 2, heightMm: 2 },
      pixelDimensions: [2, 2],
      rgba: Uint8Array.from([
        255, 0, 0, 255, 0, 255, 0, 255,
        0, 0, 255, 255, 0, 0, 0, 0,
      ]),
    };
    const result = composeSheetRgba(planWith({ layers: [layer] }));
    assert.deepEqual(result.pixelDimensions, [4, 3]);
    assert.deepEqual(rgbaAt(result.rgba, 4, 0, 0), [255, 255, 255, 255]);
    assert.deepEqual(rgbaAt(result.rgba, 4, 1, 1), [255, 0, 0, 255]);
    assert.deepEqual(rgbaAt(result.rgba, 4, 2, 1), [0, 255, 0, 255]);
    assert.deepEqual(rgbaAt(result.rgba, 4, 1, 2), [0, 0, 255, 255]);
    // The transparent layer pixel leaves the white background untouched.
    assert.deepEqual(rgbaAt(result.rgba, 4, 2, 2), [255, 255, 255, 255]);
    assert.deepEqual(rgbaAt(result.rgba, 4, 3, 2), [255, 255, 255, 255]);
  });

  it('2. composites a translucent layer over the background deterministically', () => {
    const layer = {
      panelId: 'panel-a' as FigurePanelId,
      rectMm: { xMm: 0, yMm: 0, widthMm: 1, heightMm: 1 },
      pixelDimensions: [1, 1],
      rgba: Uint8Array.from([0, 0, 0, 128]),
    };
    const result = composeSheetRgba(planWith({ layers: [layer] }));
    assert.deepEqual(rgbaAt(result.rgba, 4, 0, 0), [127, 127, 127, 255]);
  });

  it('3. refuses a plan or layer that would require resampling or overflow', () => {
    const base = {
      panelId: 'panel-a' as FigurePanelId,
      rectMm: { xMm: 0, yMm: 0, widthMm: 2, heightMm: 2 },
      pixelDimensions: [2, 2],
      rgba: new Uint8Array(2 * 2 * 4),
    };
    const cases: readonly unknown[] = [
      // raster size does not match the physical destination at the DPI
      planWith({ layers: [{ ...base, pixelDimensions: [3, 2], rgba: new Uint8Array(3 * 2 * 4) }] }),
      // layer overflows the sheet
      planWith({ layers: [{ ...base, rectMm: { xMm: 3, yMm: 0, widthMm: 2, heightMm: 2 } }] }),
      // invalid background
      planWith({ backgroundColor: '#fff' }),
      // sheet raster does not equal the physical sheet
      planWith({ pixelDimensions: [3, 3] }),
      // wrong RGBA byte length
      planWith({ layers: [{ ...base, rgba: new Uint8Array(3) }] }),
      // absurd-but-finite origin must be refused, never silently dropped
      planWith({ layers: [{ ...base, rectMm: { xMm: 1e308, yMm: 0, widthMm: 2, heightMm: 2 } }] }),
      // negative origin
      planWith({ layers: [{ ...base, rectMm: { xMm: -1, yMm: 0, widthMm: 2, heightMm: 2 } }] }),
      // malformed shapes must be typed refusals, never a bare TypeError
      planWith({ sheetSizeMm: undefined }),
      planWith({ layers: [{ panelId: 'panel-a', pixelDimensions: [2, 2], rgba: new Uint8Array(16) }] }),
    ];
    for (const plan of cases) {
      assert.throws(
        () => composeSheetRgba(plan as never),
        (error: unknown) => {
          assert.ok(error instanceof FigurePublicationError, `expected FigurePublicationError, got ${String(error)}`);
          assert.ok(!(error instanceof TypeError), 'a malformed plan must not surface as a bare TypeError');
          assert.equal(error.code, FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid);
          return true;
        },
      );
    }
  });

  it('4. accepts a layer that fits the sheet exactly on its boundary', () => {
    const layer = {
      panelId: 'panel-a' as FigurePanelId,
      rectMm: { xMm: 3, yMm: 0, widthMm: 1, heightMm: 1 },
      pixelDimensions: [1, 1],
      rgba: Uint8Array.from([1, 2, 3, 255]),
    };
    const result = composeSheetRgba(planWith({ layers: [layer] }));
    assert.deepEqual(rgbaAt(result.rgba, 4, 3, 0), [1, 2, 3, 255]);
  });
});
