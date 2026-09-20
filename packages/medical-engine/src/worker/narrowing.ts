/**
 * @nuclear/medical-engine — strict `unknown` narrowing helpers.
 *
 * Every helper fails closed with a {@link WorkerContractError} instead of
 * coercing. Numeric values are accepted verbatim and only checked for
 * finiteness; no arithmetic is performed here.
 */

import type { BoundingBox3D } from '@nuclear/shared-types';
import { WorkerContractError } from './errors.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (!isRecord(value)) throw new WorkerContractError(`${where} must be an object.`);
  return value;
}

export function asArray(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new WorkerContractError(`${where} must be an array.`);
  return value;
}

export function asString(value: unknown, where: string): string {
  if (typeof value !== 'string') throw new WorkerContractError(`${where} must be a string.`);
  return value;
}

export function asNumber(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new WorkerContractError(`${where} must be a finite number.`);
  }
  return value;
}

export function asBoolean(value: unknown, where: string): boolean {
  if (typeof value !== 'boolean') throw new WorkerContractError(`${where} must be a boolean.`);
  return value;
}

export function asStringOrNull(value: unknown, where: string): string | null {
  if (value === null || value === undefined) return null;
  return asString(value, where);
}

export function asNumberOrNull(value: unknown, where: string): number | null {
  if (value === null || value === undefined) return null;
  return asNumber(value, where);
}

export function stringArray(value: unknown, where: string): readonly string[] {
  return asArray(value, where).map((item, index) => asString(item, `${where}[${index}]`));
}

export function triple(value: unknown, where: string): readonly [number, number, number] {
  const items = asArray(value, where);
  if (items.length !== 3) throw new WorkerContractError(`${where} must have length 3.`);
  return [
    asNumber(items[0], `${where}[0]`),
    asNumber(items[1], `${where}[1]`),
    asNumber(items[2], `${where}[2]`),
  ];
}

export type SixTuple = readonly [number, number, number, number, number, number];

export function six(value: unknown, where: string): SixTuple {
  const items = asArray(value, where);
  if (items.length !== 6) throw new WorkerContractError(`${where} must have length 6.`);
  return [
    asNumber(items[0], `${where}[0]`),
    asNumber(items[1], `${where}[1]`),
    asNumber(items[2], `${where}[2]`),
    asNumber(items[3], `${where}[3]`),
    asNumber(items[4], `${where}[4]`),
    asNumber(items[5], `${where}[5]`),
  ];
}

export function bounds(value: unknown, where: string): BoundingBox3D {
  const record = asRecord(value, where);
  return {
    min: triple(record.min, `${where}.min`),
    max: triple(record.max, `${where}.max`),
  };
}
