/**
 * @nuclear/figure-engine — shared structural primitives for hybrid-PDF
 * validation (P5.7). Internal module: not re-exported from the package barrel.
 *
 * Every rejection is a typed `FIGURE_PDF_DOCUMENT_INVALID`, never a bare
 * `TypeError`. Pure and Node-safe.
 */

import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import { refuse } from './guards.js';
import type { SheetRectMm } from './layout.js';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function fail(message: string): never {
  refuse(FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid, message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(`${path} must be a plain object`);
  }
  return value;
}

export function asText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${path} must be a non-blank string`);
  }
  return value;
}

/**
 * A declared publication timestamp. The payload owns the value (never
 * `Date.now()`), but it must be a real date `Date.parse` accepts so the writer
 * cannot emit a `NaN` PDF date; unparseable values are refused fail-closed.
 * Declaring ISO 8601 (UTC) keeps the emitted PDF date stable across machines.
 */
export function asIsoDate(value: unknown, path: string): string {
  const text = asText(value, path);
  if (Number.isNaN(Date.parse(text))) {
    fail(
      `${path} '${text}' must be a date string parseable by Date; declare ISO 8601 (UTC) so the emitted PDF date is deterministic`,
    );
  }
  return text;
}

export function asFinitePair(value: unknown, path: string): readonly [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number' ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1])
  ) {
    fail(`${path} must be a pair of finite numbers`);
  }
  return [value[0] as number, value[1] as number];
}

export function asPositiveFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail(`${path} must be a finite, strictly positive number`);
  }
  return value;
}

export function asColor(value: unknown, path: string): string {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
    fail(`${path} '${String(value)}' must be a #rrggbb hex colour`);
  }
  return value;
}

/** Optional layer opacity in `[0, 1]`; `0` means the layer is omitted entirely. */
export function asOpacity(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(`${path} must be a finite number in [0, 1]`);
  }
  return value;
}

export function asSheetRect(value: unknown, path: string): SheetRectMm {
  const record = asRecord(value, path);
  const fields = [record.xMm, record.yMm, record.widthMm, record.heightMm];
  if (!fields.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    fail(`${path} must carry finite millimetre fields (xMm, yMm, widthMm, heightMm)`);
  }
  const [xMm, yMm, widthMm, heightMm] = fields as number[];
  if (widthMm <= 0 || heightMm <= 0) {
    fail(`${path} size must be strictly positive millimetres`);
  }
  return { xMm, yMm, widthMm, heightMm };
}

export function requirePointWithin(
  xMm: number,
  yMm: number,
  sheetWidthMm: number,
  sheetHeightMm: number,
  path: string,
): void {
  if (xMm < 0 || yMm < 0 || xMm > sheetWidthMm || yMm > sheetHeightMm) {
    fail(
      `${path} (${String(xMm)}, ${String(yMm)}) mm falls outside the ${String(sheetWidthMm)}x${String(sheetHeightMm)} mm sheet; the editorial overflow policy is not yet ratified, so it is refused fail-closed`,
    );
  }
}

export function requireRectWithin(
  rect: SheetRectMm,
  sheetWidthMm: number,
  sheetHeightMm: number,
  path: string,
): void {
  if (
    rect.xMm < 0 ||
    rect.yMm < 0 ||
    rect.xMm + rect.widthMm > sheetWidthMm ||
    rect.yMm + rect.heightMm > sheetHeightMm
  ) {
    fail(
      `${path} [${rect.xMm}, ${rect.yMm}, ${rect.widthMm}, ${rect.heightMm}] mm falls outside the ${sheetWidthMm}x${sheetHeightMm} mm sheet; the editorial overflow policy is not yet ratified, so it is refused fail-closed`,
    );
  }
}
