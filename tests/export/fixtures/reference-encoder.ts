/**
 * NuClear P5.6 — reference encoder port + minimal test decoders.
 *
 * The reference encoder wires the minimal PNG/TIFF writers behind the
 * `figure-engine` `EncoderPort`; the decoders are test-only and exist to prove
 * decoder round-trips against the writers. Test infrastructure; `figure-engine`
 * never imports this module.
 */

import { inflateSync } from 'node:zlib';

import type {
  EncodedArtifact,
  EncoderPort,
  PublicationPdfRequest,
  PublicationRasterRequest,
} from '../../../packages/figure-engine/src/publication/index.ts';
import { encodePng } from './png-writer.ts';
import { encodePdf } from './pdf-writer.ts';
import { encodeTiff } from './tiff-writer.ts';

/** The reference composition-root encoder: minimal writers behind the port. */
export function createReferenceEncoder(): EncoderPort {
  return {
    async encodePng(request: PublicationRasterRequest): Promise<EncodedArtifact> {
      return encodePng(request);
    },
    async encodeTiff(request: PublicationRasterRequest): Promise<EncodedArtifact> {
      return encodeTiff(request);
    },
    async encodePdf(request: PublicationPdfRequest): Promise<EncodedArtifact> {
      return encodePdf(request);
    },
  };
}

export interface DecodedRaster {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
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

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

/** Little-endian 32-bit read (TIFF is little-endian here; PNG is big-endian). */
function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  );
}

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

/** Minimal PNG decoder for the reference writer (filter 0 rows, RGBA8). */
export function decodePng(bytes: Uint8Array): DecodedRaster {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const [index, expected] of signature.entries()) {
    if (bytes[index] !== expected) {
      throw new Error('not a PNG signature');
    }
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (offset < bytes.length) {
    const length = readU32(bytes, offset);
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const storedCrc = readU32(bytes, offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== storedCrc) {
      throw new Error(`PNG chunk ${type} has an invalid CRC`);
    }
    if (type === 'IHDR') {
      width = readU32(data, 0);
      height = readU32(data, 4);
      if (data[8] !== 8 || data[9] !== 6) {
        throw new Error('unexpected IHDR bit depth/colour type');
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = new Uint8Array(inflateSync(concat(idat)));
  const rgba = new Uint8Array(width * height * 4);
  const stride = 1 + width * 4;
  for (let row = 0; row < height; row += 1) {
    if (raw[row * stride] !== 0) {
      throw new Error('reference PNG decoder only supports filter 0');
    }
    rgba.set(raw.subarray(row * stride + 1, row * stride + 1 + width * 4), row * width * 4);
  }
  return { width, height, rgba };
}

interface TiffTag {
  readonly type: number;
  readonly count: number;
  readonly value: number;
}

/** Minimal TIFF decoder for the reference writer (one Deflate RGB strip). */
export function decodeTiff(bytes: Uint8Array): DecodedRaster {
  if (bytes[0] !== 0x49 || bytes[1] !== 0x49 || bytes[2] !== 0x2a || bytes[3] !== 0x00) {
    throw new Error('not a little-endian TIFF');
  }
  const ifdOffset = readU32LE(bytes, 4);
  const entryCount = bytes[ifdOffset] + (bytes[ifdOffset + 1] << 8);
  const tags = new Map<number, TiffTag>();
  for (let index = 0; index < entryCount; index += 1) {
    const base = ifdOffset + 2 + index * 12;
    const tag = bytes[base] + (bytes[base + 1] << 8);
    const type = bytes[base + 2] + (bytes[base + 3] << 8);
    const count = readU32LE(bytes, base + 4);
    const value =
      type === 3 && count === 1
        ? bytes[base + 8] + (bytes[base + 9] << 8)
        : readU32LE(bytes, base + 8);
    tags.set(tag, { type, count, value });
  }
  const width = tags.get(256)?.value ?? 0;
  const height = tags.get(257)?.value ?? 0;
  const compression = tags.get(259)?.value;
  const stripOffset = tags.get(273)?.value ?? 0;
  const stripByteCount = tags.get(279)?.value ?? 0;
  if (compression !== 8) {
    throw new Error(`unexpected TIFF compression ${String(compression)}`);
  }
  if (tags.get(277)?.value !== 3) {
    throw new Error(`unexpected TIFF SamplesPerPixel ${String(tags.get(277)?.value)}`);
  }
  const rgb = new Uint8Array(inflateSync(bytes.subarray(stripOffset, stripOffset + stripByteCount)));
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4] = rgb[pixel * 3];
    rgba[pixel * 4 + 1] = rgb[pixel * 3 + 1];
    rgba[pixel * 4 + 2] = rgb[pixel * 3 + 2];
    rgba[pixel * 4 + 3] = 255;
  }
  return { width, height, rgba };
}
