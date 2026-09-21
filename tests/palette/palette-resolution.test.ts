/**
 * NuClear P3.4-B.1.1 — typed persisted colormap id resolution.
 *
 * Pure Node: no DOM, no WebGL, no Cornerstone. Proves the canonical persisted
 * `colormapId` form (the stable `dicom-*` id) resolves to the Cornerstone
 * registry name, and that unknown/empty ids fail closed with a typed error
 * instead of falling back to a default palette.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  PALETTE_RESOLUTION_ERROR_CODES,
  PaletteResolutionError,
  resolveDicomPaletteById,
} = await import('../../packages/medical-engine/src/palette/index.ts');

const { DICOM_PALETTE_CATALOG } = await import(
  '../../packages/rendering-presets/src/index.ts'
);

function expectPaletteNotFound(id: string): void {
  assert.throws(
    () => resolveDicomPaletteById(id),
    (error: unknown) => {
      assert.ok(
        error instanceof PaletteResolutionError,
        `expected PaletteResolutionError for '${id}', got ${String(error)}`,
      );
      assert.equal(error.code, PALETTE_RESOLUTION_ERROR_CODES.paletteNotFound);
      assert.equal(error.code, 'PALETTE_NOT_FOUND');
      assert.ok(error.message.length > 0, 'expected an actionable message');
      return true;
    },
  );
}

describe('NuClear P3.4-B.1.1 — DICOM palette id resolution', () => {
  it("1. 'dicom-pet' resolves to the PET Cornerstone registration name", () => {
    assert.deepEqual(resolveDicomPaletteById('dicom-pet'), {
      id: 'dicom-pet',
      cornerstoneColormapName: 'PET',
      contentLabel: 'PET',
      sopUid: '1.2.840.10008.1.5.2',
    });
  });

  it('2. every catalog stable id resolves to its declared Cornerstone name', () => {
    for (const palette of DICOM_PALETTE_CATALOG) {
      assert.deepEqual(
        resolveDicomPaletteById(palette.id),
        {
          id: palette.id,
          cornerstoneColormapName: palette.name,
          contentLabel: palette.contentLabel,
          sopUid: palette.sopUid,
        },
        `stable id ${palette.id} must resolve`,
      );
    }
  });

  it("3. unknown, empty and content-label ids throw PALETTE_NOT_FOUND", () => {
    for (const id of ['pet', '', 'dicom-nope', 'PET', 'HOT_IRON']) {
      expectPaletteNotFound(id);
    }
  });

  it('4. never substitutes a default palette for an unresolved id', () => {
    let returned: unknown;
    try {
      returned = resolveDicomPaletteById('pet');
    } catch {
      returned = undefined;
    }
    assert.equal(returned, undefined, 'an unknown id must not return any palette');
  });
});
