/**
 * NuClear P5.7 — test-only hybrid-PDF inspector.
 *
 * A small, dependency-free parser over the raw PDF bytes: it decodes the
 * Flate-compressed content streams, reads the image XObjects and evaluates the
 * `q`/`Q`/`cm`/`Do` matrix stack so a test can assert the exact PDF-point
 * placement of a panel, plus the Info dictionary and the trailer `/ID`.
 *
 * Test infrastructure only; `figure-engine` never imports this module.
 */

import { inflateSync } from 'node:zlib';

function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

const CONTENT_OPERATOR = /\b(BT|ET|Tj|TJ|Tm|Tf|Do|cm|re)\b/;

/**
 * Decodes every `stream ... endstream` object whose payload inflates to text
 * containing a PDF content operator. Undecodable/binary streams (font files,
 * images) are skipped.
 */
export function decodeContentStreams(bytes: Uint8Array): string[] {
  const raw = latin1(bytes);
  const streams: string[] = [];
  let cursor = 0;
  while (cursor < raw.length) {
    const start = raw.indexOf('stream', cursor);
    if (start === -1) {
      break;
    }
    // Skip the `stream` inside `endstream`.
    if (raw[start - 1] === 'd') {
      cursor = start + 6;
      continue;
    }
    let dataStart = start + 6;
    if (raw[dataStart] === '\r' && raw[dataStart + 1] === '\n') {
      dataStart += 2;
    } else if (raw[dataStart] === '\n' || raw[dataStart] === '\r') {
      dataStart += 1;
    }
    const end = raw.indexOf('endstream', dataStart);
    if (end === -1) {
      break;
    }
    const chunk = bytes.subarray(dataStart, end);
    let decoded: string | undefined;
    try {
      decoded = Buffer.from(inflateSync(chunk)).toString('latin1');
    } catch {
      decoded = undefined;
    }
    if (decoded !== undefined && CONTENT_OPERATOR.test(decoded)) {
      streams.push(decoded);
    }
    cursor = end + 'endstream'.length;
  }
  return streams;
}

/** Image XObject dimensions, in declaration order. */
export function readImages(bytes: Uint8Array): { width: number; height: number }[] {
  const raw = latin1(bytes);
  const images: { width: number; height: number }[] = [];
  const dict = /<<[\s\S]*?\/Subtype\s*\/Image[\s\S]*?>>/g;
  let match: RegExpExecArray | null;
  while ((match = dict.exec(raw)) !== null) {
    const width = /\/Width\s+(\d+)/.exec(match[0]);
    const height = /\/Height\s+(\d+)/.exec(match[0]);
    if (width !== null && height !== null) {
      images.push({ width: Number(width[1]), height: Number(height[1]) });
    }
  }
  return images;
}

/** Trailer `/ID` as its two hexadecimal halves, lower-cased. */
export function readPdfId(bytes: Uint8Array): { first: string; second: string } | undefined {
  const match = /\/ID\s*\[\s*<([0-9a-fA-F]*)>\s*<([0-9a-fA-F]*)>\s*\]/.exec(latin1(bytes));
  if (match === null) {
    return undefined;
  }
  return { first: match[1].toLowerCase(), second: match[2].toLowerCase() };
}

function decodeHexString(hex: string): string {
  const bytes: number[] = [];
  for (let index = 0; index + 1 < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      out += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    }
    return out;
  }
  return bytes.map((byte) => String.fromCharCode(byte)).join('');
}

function decodeLiteralString(value: string): string {
  return value.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_whole, escape: string) => {
    switch (escape) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case '(':
        return '(';
      case ')':
        return ')';
      case '\\':
        return '\\';
      default:
        return String.fromCharCode(Number.parseInt(escape, 8));
    }
  });
}

const INFO_KEYS = [
  'Title',
  'Author',
  'Subject',
  'Keywords',
  'Creator',
  'Producer',
  'CreationDate',
  'ModDate',
] as const;

/** Decodes the `/Info` dictionary entries (hex UTF-16BE and literal strings). */
export function readPdfInfo(bytes: Uint8Array): Record<string, string> {
  const raw = latin1(bytes);
  const info: Record<string, string> = {};
  for (const key of INFO_KEYS) {
    const match = new RegExp(`/${key}\\s*(<([0-9a-fA-F]*)>|\\(([^)]*)\\))`).exec(raw);
    if (match === null) {
      continue;
    }
    info[key] =
      match[2] !== undefined ? decodeHexString(match[2]) : decodeLiteralString(match[3] ?? '');
  }
  return info;
}

export interface PdfImagePlacement {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PdfTextOrigin {
  readonly x: number;
  readonly y: number;
}

function multiply(m1: readonly number[], m2: readonly number[]): number[] {
  // CTM' = CTM x M (column-vector convention), so a `cm` appends the operand.
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function isNumberToken(token: string): boolean {
  return /^[-+0-9.]/.test(token) && Number.isFinite(Number(token));
}

/**
 * Evaluates the `q`/`Q`/`cm` graphics-state stack and returns the affine
 * placement of every `Do`-invoked XObject. For a pdf-lib-drawn image the
 * resulting matrix is `[width, 0, 0, height, x, y]`.
 */
export function readImagePlacements(content: string): PdfImagePlacement[] {
  const tokens = content.split(/\s+/).filter((token) => token.length > 0);
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const placements: PdfImagePlacement[] = [];
  let operands: number[] = [];
  let lastName = '';
  for (const token of tokens) {
    if (isNumberToken(token)) {
      operands.push(Number(token));
      continue;
    }
    if (token === 'q') {
      stack.push([...ctm]);
    } else if (token === 'Q') {
      ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    } else if (token === 'cm' && operands.length >= 6) {
      ctm = multiply(ctm, operands.slice(-6));
    } else if (token === 'Do' && lastName.startsWith('/')) {
      placements.push({ name: lastName, x: ctm[4], y: ctm[5], width: ctm[0], height: ctm[3] });
    } else if (token.startsWith('/')) {
      lastName = token;
    }
    operands = [];
  }
  return placements;
}

/** Text matrix x/y of every `Tm` operator (the text origin in PDF points). */
export function readTextOrigins(content: string): PdfTextOrigin[] {
  const origins: PdfTextOrigin[] = [];
  const re = /([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+Tm/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    origins.push({ x: Number(match[5]), y: Number(match[6]) });
  }
  return origins;
}
