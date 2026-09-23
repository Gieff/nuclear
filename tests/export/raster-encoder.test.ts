/**
 * NuClear P5.6 — reference PNG/TIFF encoders (ADR-015 Track 1).
 *
 * Pure Node: the reference writers use `node:zlib`; the test-only decoders prove
 * a decoder round-trip. Determinism is asserted by encoding twice and comparing
 * bytes.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const { composeSheetRgba, mmToPixels } = await import(
  '../../packages/figure-engine/src/publication/index.ts'
);
const { createReferenceEncoder, decodePng, decodeTiff } = await import(
  './fixtures/reference-encoder.ts'
);

const REQUEST = {
  pixelDimensions: [3, 2] as const,
  rgba: Uint8Array.from([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
    255, 255, 0, 255, 0, 255, 255, 255, 255, 0, 255, 255,
  ]),
  colorProfile: 'srgb',
};

describe('NuClear P5.6 — reference raster encoders', () => {
  it('1. encodes PNG deterministically and round-trips the pixels', () => {
    const first = createReferenceEncoder();
    const request = { pixelDimensions: [...REQUEST.pixelDimensions] as [number, number], rgba: REQUEST.rgba, colorProfile: REQUEST.colorProfile };
    return Promise.all([first.encodePng(request), first.encodePng(request)]).then(([encoded, again]) => {
      assert.equal(encoded.format, 'png');
      assert.deepEqual(encoded.pixelDimensions, [3, 2]);
      assert.equal(encoded.colorProfile, 'srgb');
      assert.equal(encoded.encoder.encoderName, 'nuclear-reference-png');
      assert.deepEqual(encoded.bytes, again.bytes, 'identical inputs must produce identical bytes');

      const decoded = decodePng(encoded.bytes);
      assert.equal(decoded.width, 3);
      assert.equal(decoded.height, 2);
      assert.deepEqual(decoded.rgba, REQUEST.rgba);
    });
  });

  it('2. encodes TIFF deterministically and round-trips the RGB pixels', () => {
    const encoder = createReferenceEncoder();
    const request = { pixelDimensions: [...REQUEST.pixelDimensions] as [number, number], rgba: REQUEST.rgba, colorProfile: REQUEST.colorProfile };
    return Promise.all([encoder.encodeTiff(request), encoder.encodeTiff(request)]).then(([encoded, again]) => {
      assert.equal(encoded.format, 'tiff');
      assert.equal(encoded.encoder.encoderName, 'nuclear-reference-tiff');
      assert.deepEqual(encoded.bytes, again.bytes, 'identical inputs must produce identical bytes');

      const decoded = decodeTiff(encoded.bytes);
      assert.equal(decoded.width, 3);
      assert.equal(decoded.height, 2);
      // TIFF writes 8-bit RGB; alpha is 255 after the opaque flatten.
      for (let pixel = 0; pixel < 6; pixel += 1) {
        assert.deepEqual(
          [...decoded.rgba.subarray(pixel * 4, pixel * 4 + 4)],
          [REQUEST.rgba[pixel * 4], REQUEST.rgba[pixel * 4 + 1], REQUEST.rgba[pixel * 4 + 2], 255],
        );
      }
    });
  });

  it('3. composes a plan and encodes the flattened sheet end to end', () => {
    const plan = {
      sheetId: 'sheet' as never,
      sheetSizeMm: [4, 3] as const,
      dpi: 25.4,
      pixelDimensions: mmToPixels([4, 3], 25.4),
      backgroundColor: '#ffffff',
      layers: [
        {
          panelId: 'panel-a' as never,
          rectMm: { xMm: 1, yMm: 1, widthMm: 1, heightMm: 1 },
          pixelDimensions: mmToPixels([1, 1], 25.4),
          rgba: Uint8Array.from([10, 20, 30, 255]),
        },
      ],
    };
    const sheet = composeSheetRgba(plan as never);
    return createReferenceEncoder()
      .encodePng({ pixelDimensions: sheet.pixelDimensions, rgba: sheet.rgba, colorProfile: 'srgb' })
      .then((encoded) => {
        const decoded = decodePng(encoded.bytes);
        assert.deepEqual([decoded.width, decoded.height], [4, 3]);
        const offset = (1 * 4 + 1) * 4;
        assert.deepEqual([...decoded.rgba.subarray(offset, offset + 4)], [10, 20, 30, 255]);
      });
  });

  it('4. refuses a non-sRGB colour profile in both formats', async () => {
    const encoder = createReferenceEncoder();
    await assert.rejects(
      () => encoder.encodePng({ ...REQUEST, colorProfile: 'adobe-rgb' }),
      /sRGB/,
    );
    await assert.rejects(
      () => encoder.encodeTiff({ ...REQUEST, colorProfile: 'adobe-rgb' }),
      /sRGB/,
    );
  });
});
