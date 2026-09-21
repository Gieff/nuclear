/**
 * NuClear P3.4-B.1 — declarative DICOM PS3.6 Table B.1-1 palette catalog.
 *
 * Pure Node: no DOM, no WebGL, no Cornerstone. Asserts the structural
 * invariants of the four nuclear-medicine palettes and both lookup helpers.
 * The real-harness registration is covered by
 * `tests/rendering/dicom-palette-registration.test.ts`.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  DICOM_PALETTE_CATALOG,
  findDicomPaletteByContentLabel,
  findDicomPaletteById,
  findDicomPaletteBySopUid,
} = await import('../../packages/rendering-presets/src/index.ts');

/**
 * Whole-LUT regression digests, in the catalog's stable-id order.
 *
 * Each digest is lowercase hex SHA-256 over exactly 1024 bytes, where
 * `b[i] = clamp(round(rgbPoints[i] * 255), 0, 255)`: the whole
 * `[x, r, g, b] × 256` transfer function quantised to the DICOM 8-bit LUT the
 * palette denotes. The expected values were derived from the DICOM PS3.6
 * Table B.1-1 8-bit tables cross-checked against pydicom's bundled
 * well-known palette SOP instances. Mutating any byte, or changing the table
 * length, changes the digest and fails the test.
 */
const EXPECTED_LUT_DIGESTS: Readonly<Record<string, string>> = {
  'dicom-hot-iron': 'ca6c2927abca13b899a7d88fef1231ac9a0f09cecfc6402f1a544d22a33c791e',
  'dicom-pet': 'd7a1f92cd7b2c2df82f0e6fe5211af10a6136fd348299272674693996f63f039',
  'dicom-hot-metal-blue': 'c3a09a60bd404de71385e4e39a3cf22586a217767c019ce06334cbdead737146',
  'dicom-pet-20-step': 'b3b98b418920617ae7a242e828a869be59b93e5d187d346137ad26c59c868b67',
};

/** The ratified nuclear-medicine set, in DICOM table order. */
const EXPECTED = [
  { id: 'dicom-hot-iron', name: 'Hot Iron', contentLabel: 'HOT_IRON', sopUid: '1.2.840.10008.1.5.1' },
  { id: 'dicom-pet', name: 'PET', contentLabel: 'PET', sopUid: '1.2.840.10008.1.5.2' },
  {
    id: 'dicom-hot-metal-blue',
    name: 'Hot Metal Blue',
    contentLabel: 'HOT_METAL_BLUE',
    sopUid: '1.2.840.10008.1.5.3',
  },
  {
    id: 'dicom-pet-20-step',
    name: 'PET 20 Step',
    contentLabel: 'PET_20_STEP',
    sopUid: '1.2.840.10008.1.5.4',
  },
] as const;

describe('NuClear P3.4-B.1 — DICOM palette catalog', () => {
  it('1. declares exactly the four nuclear-medicine palettes with the exact SOP UIDs', () => {
    assert.equal(DICOM_PALETTE_CATALOG.length, 4);
    assert.deepEqual(
      DICOM_PALETTE_CATALOG.map((palette) => ({
        id: palette.id,
        name: palette.name,
        contentLabel: palette.contentLabel,
        sopUid: palette.sopUid,
      })),
      EXPECTED.map(({ id, name, contentLabel, sopUid }) => ({ id, name, contentLabel, sopUid })),
    );
    for (const palette of DICOM_PALETTE_CATALOG) {
      assert.equal(palette.colorSpace, 'RGB');
    }
  });

  it('2. each palette has 1024 RGB points (256 entries of x, r, g, b)', () => {
    for (const palette of DICOM_PALETTE_CATALOG) {
      assert.equal(palette.rgbPoints.length, 1024, `${palette.contentLabel} RGBPoints length`);
    }
  });

  it('3. every x value (every 4th) is finite and monotonic non-decreasing from 0 to 1', () => {
    for (const palette of DICOM_PALETTE_CATALOG) {
      const points = palette.rgbPoints;
      let previous = -1;
      for (let index = 0; index < points.length; index += 4) {
        const x = points[index];
        assert.ok(Number.isFinite(x), `${palette.contentLabel} x[${index}] is finite`);
        assert.ok(x >= previous, `${palette.contentLabel} x must be non-decreasing at ${index}`);
        previous = x;
      }
      assert.equal(points[0], 0, `${palette.contentLabel} first x`);
      assert.equal(points[points.length - 4], 1, `${palette.contentLabel} last x`);
    }
  });

  it('4. the first entry is black (0,0,0,0) and the last entry is white (1,1,1,1)', () => {
    for (const palette of DICOM_PALETTE_CATALOG) {
      const points = palette.rgbPoints;
      assert.deepEqual(points.slice(0, 4), [0, 0, 0, 0], `${palette.contentLabel} first entry`);
      assert.deepEqual(points.slice(-4), [1, 1, 1, 1], `${palette.contentLabel} last entry`);
    }
  });

  it('5. palette id and contentLabel are unique across the catalog', () => {
    const ids = DICOM_PALETTE_CATALOG.map((palette) => palette.id);
    const labels = DICOM_PALETTE_CATALOG.map((palette) => palette.contentLabel);
    assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
    assert.equal(new Set(labels).size, labels.length, 'contentLabels must be unique');
  });

  it('6. both lookup helpers resolve every palette and return undefined for unknown input', () => {
    for (const expected of EXPECTED) {
      assert.equal(
        findDicomPaletteByContentLabel(expected.contentLabel)?.id,
        expected.id,
        `contentLabel ${expected.contentLabel} must resolve`,
      );
      assert.equal(
        findDicomPaletteBySopUid(expected.sopUid)?.id,
        expected.id,
        `sopUid ${expected.sopUid} must resolve`,
      );
    }
    assert.equal(findDicomPaletteByContentLabel('NOT_A_PALETTE'), undefined);
    assert.equal(findDicomPaletteBySopUid('1.2.840.10008.1.5.99'), undefined);
    assert.equal(findDicomPaletteByContentLabel('hot_iron'), undefined, 'lookup is exact-case');
    assert.equal(findDicomPaletteBySopUid(''), undefined);
  });

  it('7. each palette whole-LUT SHA-256 digest matches its pinned 8-bit value', () => {
    for (const palette of DICOM_PALETTE_CATALOG) {
      const bytes = palette.rgbPoints.map((value) =>
        Math.min(255, Math.max(0, Math.round(value * 255))),
      );
      assert.equal(bytes.length, 1024, `${palette.id} quantised LUT length`);
      const digest = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
      assert.equal(digest, EXPECTED_LUT_DIGESTS[palette.id], `${palette.id} whole-LUT digest`);
    }
  });

  it('8. findDicomPaletteById resolves every stable id and rejects unknown or empty ids', () => {
    for (const expected of EXPECTED) {
      assert.equal(
        findDicomPaletteById(expected.id)?.id,
        expected.id,
        `stable id ${expected.id} must resolve`,
      );
    }
    assert.equal(findDicomPaletteById('dicom-nope'), undefined);
    assert.equal(findDicomPaletteById(''), undefined);
    assert.equal(findDicomPaletteById('pet'), undefined, 'lookup is exact-case and id-only');
    assert.equal(findDicomPaletteById('PET'), undefined, 'a content label is not a stable id');
  });
});
