/**
 * NuClear P5.6 — minimal, deterministic PNG writer (ADR-015 Track 1).
 *
 * Reference composition-root adapter: RGBA8 baseline PNG with a fixed chunk
 * order (IHDR, sRGB, gAMA, IDAT, IEND) and a fixed Deflate level, so identical
 * inputs produce identical bytes within the same `zlib` build. Test
 * infrastructure; `figure-engine` itself never imports `node:zlib`.
 */

import { deflateSync } from 'node:zlib';

import type {
  EncodedArtifact,
  PublicationRasterRequest,
} from '../../../packages/figure-engine/src/publication/index.ts';

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ENCODER = { encoderName: 'nuclear-reference-png', encoderVersion: '0.1.0' };
/** gAMA for sRGB (0.45455 × 100000). */
const SRGB_GAMMA = 45455;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(value: number): Uint8Array {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  return concat([u32(data.length), body, u32(crc32(body))]);
}

function requireSrgb(colorProfile: string): void {
  if (colorProfile.toLowerCase() !== 'srgb') {
    throw new Error(
      `reference PNG encoder only declares sRGB (ADR-015 OD-6c); received '${colorProfile}'`,
    );
  }
}

export function encodePng(request: PublicationRasterRequest): EncodedArtifact {
  requireSrgb(request.colorProfile);
  const [width, height] = request.pixelDimensions;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`PNG dimensions ${String(width)}x${String(height)} must be positive integers`);
  }
  const expectedBytes = width * height * 4;
  if (!(request.rgba instanceof Uint8Array) || request.rgba.length !== expectedBytes) {
    throw new Error(`PNG raster must be ${expectedBytes} RGBA8 bytes`);
  }

  // Fixed filter 0 (None) per row keeps the byte layout fully deterministic.
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let row = 0; row < height; row += 1) {
    const target = row * (1 + width * 4);
    raw[target] = 0;
    raw.set(request.rgba.subarray(row * width * 4, (row + 1) * width * 4), target + 1);
  }
  const compressed = new Uint8Array(deflateSync(raw, { level: 9 }));

  const ihdr = concat([
    u32(width),
    u32(height),
    Uint8Array.from([8, 6, 0, 0, 0]), // 8-bit, RGBA, deflate, adaptive filter, no interlace
  ]);
  const bytes = concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('sRGB', Uint8Array.from([0])), // perceptual rendering intent
    chunk('gAMA', u32(SRGB_GAMMA)),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array(0)),
  ]);

  return {
    format: 'png',
    pixelDimensions: [width, height],
    colorProfile: 'srgb',
    bytes,
    encoder: ENCODER,
  };
}
