/**
 * @nuclear/figure-engine — internal structural guards for publication input
 * validation (P5.2). Not part of the public barrel.
 *
 * Every rejection is a typed `FigurePublicationError`, never a bare
 * `TypeError`. `refuse` carries the caller's code; the `as*` guards use
 * `FIGURE_PUBLICATION_REQUEST_INVALID`. Nothing is coerced or inferred (the only
 * sanctioned default is the documented `alpha: 'opaque'`).
 *
 * Pure and Node-safe: no DOM, no WebGL, no Cornerstone.
 */

import {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  type FigurePublicationErrorCode,
} from './errors.js';

export function refuse(code: FigurePublicationErrorCode, message: string): never {
  throw new FigurePublicationError(code, message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    refuse(FIGURE_PUBLICATION_ERROR_CODES.requestInvalid, `${path} must be a plain object`);
  }
  return value;
}

export function asNonEmptyString(value: unknown, path: string): string {
  if (!isNonEmptyString(value)) {
    refuse(FIGURE_PUBLICATION_ERROR_CODES.requestInvalid, `${path} must be a non-blank string`);
  }
  return value;
}

export function asArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    refuse(FIGURE_PUBLICATION_ERROR_CODES.requestInvalid, `${path} must be an array`);
  }
  return value;
}

export function asPositiveFinite(value: unknown, path: string): number {
  if (!isPositiveFinite(value)) {
    refuse(FIGURE_PUBLICATION_ERROR_CODES.requestInvalid, `${path} must be a finite positive number`);
  }
  return value;
}

export function asPositivePair(value: unknown, path: string): readonly [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !isPositiveFinite(value[0]) ||
    !isPositiveFinite(value[1])
  ) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.requestInvalid,
      `${path} must be a pair of finite positive numbers`,
    );
  }
  return [value[0] as number, value[1] as number];
}
