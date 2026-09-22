/**
 * @nuclear/medical-engine — strict `unknown` narrowing helpers.
 *
 * Every helper fails closed with a {@link WorkerContractError} instead of
 * coercing. Numeric values are accepted verbatim and only checked for
 * finiteness; no arithmetic is performed here.
 */

import type { BoundingBox3D, Matrix4x4 } from '@nuclear/shared-types';
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

export function matrix4x4(value: unknown, where: string): Matrix4x4 {
  const items = asArray(value, where);
  if (items.length !== 16) throw new WorkerContractError(`${where} must have length 16.`);
  return [
    asNumber(items[0], `${where}[0]`),
    asNumber(items[1], `${where}[1]`),
    asNumber(items[2], `${where}[2]`),
    asNumber(items[3], `${where}[3]`),
    asNumber(items[4], `${where}[4]`),
    asNumber(items[5], `${where}[5]`),
    asNumber(items[6], `${where}[6]`),
    asNumber(items[7], `${where}[7]`),
    asNumber(items[8], `${where}[8]`),
    asNumber(items[9], `${where}[9]`),
    asNumber(items[10], `${where}[10]`),
    asNumber(items[11], `${where}[11]`),
    asNumber(items[12], `${where}[12]`),
    asNumber(items[13], `${where}[13]`),
    asNumber(items[14], `${where}[14]`),
    asNumber(items[15], `${where}[15]`),
  ];
}

export function bounds(value: unknown, where: string): BoundingBox3D {
  const record = asRecord(value, where);
  return {
    min: triple(record.min, `${where}.min`),
    max: triple(record.max, `${where}.max`),
  };
}
