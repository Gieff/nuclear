/**
 * NuClear P5.6 — minimal, deterministic baseline TIFF writer (ADR-015 Track 1).
 *
 * Reference composition-root adapter: little-endian baseline TIFF 6.0, one
 * Deflate strip, 8-bit RGB (alpha is discarded — the compositor already
 * flattened over an opaque background), fixed IFD tag order and a fixed Deflate
 * level, so identical inputs produce identical bytes within the same `zlib`
 * build. Test infrastructure; `figure-engine` itself never imports `node:zlib`.
 */

import { deflateSync } from 'node:zlib';

import type {
  EncodedArtifact,
  PublicationRasterRequest,
} from '../../../packages/figure-engine/src/publication/index.ts';

const ENCODER = { encoderName: 'nuclear-reference-tiff', encoderVersion: '0.1.0' };
const SOFTWARE = 'NuClear reference TIFF 0.1.0\0';

const SHORT = 3;
const LONG = 4;
const ASCII = 2;

function u16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function u32(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

/** One 12-byte IFD entry; SHORT single values are inline, everything else is an offset. */
function entry(tag: number, type: number, count: number, value: number): Uint8Array {
  const out = new Uint8Array(12);
  out.set(u16(tag), 0);
  out.set(u16(type), 2);
  out.set(u32(count), 4);
  if (type === SHORT && count === 1) {
    out.set(u16(value), 8);
  } else {
    out.set(u32(value), 8);
  }
  return out;
}

function requireSrgb(colorProfile: string): void {
  if (colorProfile.toLowerCase() !== 'srgb') {
    throw new Error(
      `reference TIFF encoder only declares sRGB (ADR-015 OD-6c); received '${colorProfile}'`,
    );
  }
}

export function encodeTiff(request: PublicationRasterRequest): EncodedArtifact {
  requireSrgb(request.colorProfile);
  const [width, height] = request.pixelDimensions;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`TIFF dimensions ${String(width)}x${String(height)} must be positive integers`);
  }
  const expectedBytes = width * height * 4;
  if (!(request.rgba instanceof Uint8Array) || request.rgba.length !== expectedBytes) {
    throw new Error(`TIFF raster must be ${expectedBytes} RGBA8 bytes`);
  }

  const rgb = new Uint8Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgb[pixel * 3] = request.rgba[pixel * 4];
    rgb[pixel * 3 + 1] = request.rgba[pixel * 4 + 1];
    rgb[pixel * 3 + 2] = request.rgba[pixel * 4 + 2];
  }
  const strip = new Uint8Array(deflateSync(rgb, { level: 9 }));

  const software = new TextEncoder().encode(SOFTWARE);
  const ENTRY_COUNT = 11;
  const IFD_START = 8;
  const EXTRAS_START = IFD_START + 2 + ENTRY_COUNT * 12 + 4;
  const bitsOffset = EXTRAS_START;
  const softwareOffset = bitsOffset + 6;
  const stripOffset = softwareOffset + software.length;
  const total = stripOffset + strip.length;

  const out = new Uint8Array(total);
  out.set([0x49, 0x49, 0x2a, 0x00], 0); // 'II' + 42
  out.set(u32(IFD_START), 4);
  out.set(u16(ENTRY_COUNT), IFD_START);
  let cursor = IFD_START + 2;
  const entries: readonly Uint8Array[] = [
    entry(256, LONG, 1, width),
    entry(257, LONG, 1, height),
    entry(258, SHORT, 3, bitsOffset),
    entry(259, SHORT, 1, 8), // Deflate
    entry(262, SHORT, 1, 2), // RGB
    entry(273, LONG, 1, stripOffset),
    entry(277, SHORT, 1, 3),
    entry(278, LONG, 1, height),
    entry(279, LONG, 1, strip.length),
    entry(284, SHORT, 1, 1), // chunky
    entry(305, ASCII, software.length, softwareOffset),
  ];
  for (const ifdEntry of entries) {
    out.set(ifdEntry, cursor);
    cursor += 12;
  }
  out.set(u32(0), cursor); // next IFD
  out.set(Uint8Array.from([8, 0, 8, 0, 8, 0]), bitsOffset);
  out.set(software, softwareOffset);
  out.set(strip, stripOffset);

  return {
    format: 'tiff',
    pixelDimensions: [width, height],
    colorProfile: 'srgb',
    bytes: out,
    encoder: ENCODER,
  };
}
