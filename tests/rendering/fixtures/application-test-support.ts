/**
 * NuClear P3.4-B.2.2.5 — shared Node-side helpers for the browser application
 * harness tests (test infrastructure).
 *
 * Extracted from `view-application.test.ts` so the positive same-Frame-of-
 * Reference fusion suite can reuse the same probe invocation, fixture loading
 * and numeric-assertion helpers without any test file exceeding the 300-line
 * gate. No product code and no DOM here.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';

export const APPLICATION_ENTRY_PATH = fileURLToPath(
  new URL('./application-entry.ts', import.meta.url),
);

export type FixtureName = 'ct-axial' | 'pt-axial' | 'pt-axial-coreg';

/** Orientation read-back tolerance shared by the geometry assertions. */
export const ORIENTATION_TOLERANCE = 1e-6;

export interface FixtureFiles {
  fixture: Record<string, unknown>;
  pixels: Record<string, unknown>;
  expectedGeometry: Record<string, unknown>;
}

export interface QuantitationEvidence {
  method: string;
  status: string;
  seriesInstanceUID: string;
  suvFactor: number;
}

export interface AppliedLayer {
  assetId: string;
  volumeId: string;
  properties: {
    voiRange: { lower: number; upper: number };
    colormap: {
      name: string;
      opacity: number;
      opacityMapping?: { value: number; opacity: number }[];
    };
    invert: boolean;
    interpolationType: number;
  };
}

export interface AppliedState {
  viewId: string;
  volumeIds: string[];
  blendMode: string;
  slabThicknessMm?: number;
  requestedOrientation: { viewPlaneNormal: number[]; viewUp: number[] };
  camera: { viewPlaneNormal: number[]; viewUp: number[] };
  layers: AppliedLayer[];
}

export interface ApplicationAck {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  actorCount?: number;
  applied?: AppliedState;
  constructorName?: string;
  type?: string;
  useGenericViewport?: boolean;
  elementSizePx?: number[];
  methodSurface?: Record<string, boolean>;
}

function readJson(path: URL): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

export function readFixture(name: FixtureName): FixtureFiles {
  const dir = new URL(`./volumes/${name}/`, import.meta.url);
  return {
    fixture: readJson(new URL('fixture.json', dir)),
    pixels: readJson(new URL('pixels.json', dir)),
    expectedGeometry: readJson(new URL('expected-geometry.json', dir)),
  };
}

/** Reads the committed SUVbw quantitation evidence for a PET fixture. */
export function readExpectedQuantitation(name: FixtureName): QuantitationEvidence {
  return readJson(
    new URL(`./volumes/${name}/expected-quantitation.json`, import.meta.url),
  ) as unknown as QuantitationEvidence;
}

export function callProbe(page: Page, name: string, args: unknown[]): Promise<ApplicationAck> {
  return page.evaluate(
    ({ probeName, probeArgs }: { probeName: string; probeArgs: unknown[] }) => {
      const scope = globalThis as unknown as {
        __nuclearApplicationProbe?: Record<string, (...a: unknown[]) => unknown>;
      };
      const probe = scope.__nuclearApplicationProbe;
      if (!probe) {
        throw new Error('__nuclearApplicationProbe is not installed');
      }
      return probe[probeName](...probeArgs);
    },
    { probeName: name, probeArgs: args },
  ) as Promise<ApplicationAck>;
}

export function describeAck(ack: ApplicationAck): string {
  return `${ack.name ?? ''} ${ack.code ?? ''} ${ack.message ?? ''}`.trim();
}

export function assertNear(actual: number, expected: number, tolerance: number, label: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} != ${expected} (tolerance ${tolerance})`,
  );
}

export function assertComponentsNear(actual: number[], expected: number[], label: string): void {
  assert.equal(actual.length, expected.length, `${label}: arity`);
  for (let i = 0; i < expected.length; i += 1) {
    assertNear(actual[i], expected[i], ORIENTATION_TOLERANCE, `${label}[${i}]`);
  }
}
