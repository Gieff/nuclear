/**
 * @nuclear/figure-engine — structural validation for the composition plan
 * builder (P5.6). Internal module: not re-exported from the package barrel.
 *
 * Every rejection is a typed `FIGURE_COMPOSITION_INVALID`; malformed panels or
 * rasters must never surface as a bare `TypeError`. Pure and Node-safe.
 */

import type {
  FigurePanelId,
  FigureSheetId,
  PanelFramingState,
  PanelLayoutState,
} from '@nuclear/shared-types';

import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import { refuse } from './guards.js';
import type { PublicationPanelRaster } from './render-port.js';

export interface CompositionPanelShape {
  readonly id: FigurePanelId;
  readonly framing: PanelFramingState;
  readonly layout: PanelLayoutState;
}

export interface CompositionSheetShape {
  readonly id: FigureSheetId;
  readonly sizeMm: readonly [number, number];
  readonly panels: readonly CompositionPanelShape[];
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_DECODE = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

function fail(message: string): never {
  refuse(FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(`${path} must be a plain object`);
  }
  return value;
}

function asText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${path} must be a non-blank string`);
  }
  return value;
}

function asFinitePair(value: unknown, path: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'number' || typeof value[1] !== 'number' || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) {
    fail(`${path} must be a pair of finite numbers`);
  }
  return [value[0] as number, value[1] as number];
}

function asPositivePair(value: unknown, path: string): readonly [number, number] {
  const pair = asFinitePair(value, path);
  if (pair[0] <= 0 || pair[1] <= 0) {
    fail(`${path} must be strictly positive`);
  }
  return pair;
}

function asPositiveIntegerPair(value: unknown, path: string): readonly [number, number] {
  const pair = asFinitePair(value, path);
  if (!Number.isSafeInteger(pair[0]) || !Number.isSafeInteger(pair[1]) || pair[0] <= 0 || pair[1] <= 0) {
    fail(`${path} must be a pair of positive integers`);
  }
  return pair;
}

export function asFinitePositive(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail(`${path} must be a finite strictly-positive number`);
  }
  return value;
}

export function parseBackground(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    fail(`backgroundColor '${String(value)}' must be an opaque #rrggbb hex colour`);
  }
  return value;
}

/** Minimal pure base64 (RFC 4648) decoder; refuses invalid characters. */
export function decodeBase64(value: unknown, path: string): Uint8Array {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${path} must be a non-empty base64 string`);
  }
  const end = value.endsWith('==') ? value.length - 2 : value.endsWith('=') ? value.length - 1 : value.length;
  const bytes = new Uint8Array(Math.floor((end * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (let index = 0; index < end; index += 1) {
    const code = value.charCodeAt(index);
    const six = code < 128 ? BASE64_DECODE[code] : -1;
    if (six < 0) {
      fail(`${path} is not valid base64`);
    }
    buffer = (buffer << 6) | six;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset] = (buffer >> bits) & 0xff;
      offset += 1;
    }
  }
  return bytes;
}

function readPanel(value: unknown, index: number): CompositionPanelShape {
  const path = `figureSheet.panels[${index}]`;
  const panel = asRecord(value, path);
  const id = asText(panel.id, `${path}.id`) as FigurePanelId;
  const framing = asRecord(panel.framing, `${path}.framing`);
  asPositivePair(framing.contentSizeMm, `${path}.framing.contentSizeMm`);
  const layout = asRecord(panel.layout, `${path}.layout`);
  asFinitePair(layout.positionMm, `${path}.layout.positionMm`);
  asPositivePair(layout.sizeMm, `${path}.layout.sizeMm`);
  if (typeof layout.rotationDeg !== 'number' || !Number.isFinite(layout.rotationDeg)) {
    fail(`${path}.layout.rotationDeg must be finite`);
  }
  if (typeof layout.zIndex !== 'number' || !Number.isInteger(layout.zIndex)) {
    fail(`${path}.layout.zIndex must be an integer`);
  }
  return {
    id,
    framing: framing as unknown as PanelFramingState,
    layout: layout as unknown as PanelLayoutState,
  };
}

export function readCompositionSheet(value: unknown): CompositionSheetShape {
  const sheet = asRecord(value, 'figureSheet');
  const id = asText(sheet.id, 'figureSheet.id') as FigureSheetId;
  const sizeMm = asPositivePair(sheet.sizeMm, 'figureSheet.sizeMm');
  if (!Array.isArray(sheet.panels) || sheet.panels.length === 0) {
    fail('figureSheet.panels must be a non-empty array');
  }
  const panels = sheet.panels.map((panel, index) => readPanel(panel, index));
  const ids = new Set<string>();
  for (const panel of panels) {
    if (ids.has(panel.id)) {
      fail(`figureSheet.panels contains duplicate panel id '${panel.id}'`);
    }
    ids.add(panel.id);
  }
  return { id, sizeMm, panels };
}

export function readPanelRasters(value: unknown): Map<string, PublicationPanelRaster> {
  if (!Array.isArray(value)) {
    fail('panelRasters must be an array');
  }
  const rasters = new Map<string, PublicationPanelRaster>();
  for (const [index, rasterValue] of value.entries()) {
    const path = `panelRasters[${index}]`;
    const raster = asRecord(rasterValue, path);
    const panelId = asText(raster.panelId, `${path}.panelId`);
    asPositiveIntegerPair(raster.pixelDimensions, `${path}.pixelDimensions`);
    asText(raster.rgbaBase64, `${path}.rgbaBase64`);
    if (typeof raster.byteLength !== 'number' || !Number.isSafeInteger(raster.byteLength) || raster.byteLength <= 0) {
      fail(`${path}.byteLength must be a positive integer`);
    }
    if (rasters.has(panelId)) {
      fail(`duplicate panel raster for '${panelId}'`);
    }
    rasters.set(panelId, rasterValue as PublicationPanelRaster);
  }
  return rasters;
}
