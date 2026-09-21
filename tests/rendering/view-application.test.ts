/**
 * NuClear P3.4-B.2.2.2 — real Cornerstone volume viewport application.
 *
 * The controlled WebGL 2 harness bundles `fixtures/application-entry.ts`, which
 * starts the real adapter with `{ viewportType: 'orthographic' }`, loads the
 * committed CT/PT fixtures and applies real compiled plans. These tests assert
 * the actual viewport read-back (geometry, palette, opacity, blend mode,
 * orientation) and that every refusal is typed and leaves no volume set.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';

import { mockPetAsset } from '../fixtures/clinical-contracts.fixture.ts';
import { createRendererHarness } from './fixtures/renderer-harness.mjs';

const APPLICATION_ENTRY_PATH = fileURLToPath(
  new URL('./fixtures/application-entry.ts', import.meta.url),
);

const SUV_FACTOR = mockPetAsset.metadata.petQuantitation?.suvFactor as number;
/** Canonical fusion overlay opacity: `(blendSlider / 100) ^ 0.42` at 50%. */
const FUSION_OPACITY = (0.5) ** 0.42;
/** Declared MIP slab for the observed read-back test (well above Cornerstone's 0.1 mm clamp). */
const SLAB_THICKNESS_MM = 12;
const ORIENTATION_TOLERANCE = 1e-6;

type FixtureName = 'ct-axial' | 'pt-axial';

interface FixtureFiles {
  fixture: Record<string, unknown>;
  pixels: Record<string, unknown>;
  expectedGeometry: Record<string, unknown>;
}

interface AppliedLayer {
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

interface AppliedState {
  viewId: string;
  volumeIds: string[];
  blendMode: string;
  slabThicknessMm?: number;
  requestedOrientation: { viewPlaneNormal: number[]; viewUp: number[] };
  camera: { viewPlaneNormal: number[]; viewUp: number[] };
  layers: AppliedLayer[];
}

interface ApplicationAck {
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

const SCENARIOS: readonly { readonly scenario: string; readonly code: string }[] = [
  { scenario: 'missing-resident', code: 'VIEW_VOLUME_NOT_RESIDENT' },
  { scenario: 'for-mismatch', code: 'VIEW_FOR_MISMATCH' },
  { scenario: 'invalid-transform', code: 'VIEW_TRANSFORM_INVALID' },
  { scenario: 'viewport-size-mismatch', code: 'VIEW_VIEWPORT_SIZE_MISMATCH' },
  { scenario: 'unresolved-palette', code: 'VIEW_COLORMAP_UNKNOWN' },
  { scenario: 'slice-position', code: 'VIEW_SLICE_POSITION_UNSUPPORTED' },
  { scenario: 'unsupported-scheme', code: 'VIEW_VOLUME_SCHEME_UNSUPPORTED' },
];

function readJson(path: URL): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function readFixture(name: FixtureName): FixtureFiles {
  const dir = new URL(`./fixtures/volumes/${name}/`, import.meta.url);
  return {
    fixture: readJson(new URL('fixture.json', dir)),
    pixels: readJson(new URL('pixels.json', dir)),
    expectedGeometry: readJson(new URL('expected-geometry.json', dir)),
  };
}

function callProbe(page: Page, name: string, args: unknown[]): Promise<ApplicationAck> {
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

function describeAck(ack: ApplicationAck): string {
  return `${ack.name ?? ''} ${ack.code ?? ''} ${ack.message ?? ''}`.trim();
}

function assertNear(actual: number, expected: number, tolerance: number, label: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} != ${expected} (tolerance ${tolerance})`,
  );
}

function assertComponentsNear(actual: number[], expected: number[], label: string): void {
  assert.equal(actual.length, expected.length, `${label}: arity`);
  for (let i = 0; i < expected.length; i += 1) {
    assertNear(actual[i], expected[i], ORIENTATION_TOLERANCE, `${label}[${i}]`);
  }
}

describe('NuClear P3.4-B.2.2.2 — Cornerstone volume viewport application', () => {
  it('1. ORTHOGRAPHIC creates a real volume viewport with the volume method surface', async () => {
    const harness = await createRendererHarness({ entryPath: APPLICATION_ENTRY_PATH });
    try {
      const ack = await callProbe(harness.page, 'viewport', []);
      assert.equal(ack.ok, true, describeAck(ack));
      assert.equal(ack.constructorName, 'VolumeViewport', 'ORTHOGRAPHIC must create a volume viewport');
      assert.equal(ack.type, 'orthographic');
      assert.equal(ack.useGenericViewport, false, 'the legacy (non-generic) viewport path is expected');
      assert.deepEqual(ack.elementSizePx, [512, 512]);
      for (const method of ['setVolumes', 'setProperties', 'setBlendMode', 'setOrientation', 'getCamera', 'getActors']) {
        assert.equal(ack.methodSurface?.[method], true, `expected method '${method}'`);
      }
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('2. the single CT built-in gray applies voiRange, Grayscale preset name, invert, linear interpolation and COMPOSITE', async () => {
    const harness = await createRendererHarness({ entryPath: APPLICATION_ENTRY_PATH });
    try {
      const ack = await callProbe(harness.page, 'applyCt', [readFixture('ct-axial')]);
      assert.equal(ack.ok, true, describeAck(ack));
      const applied = ack.applied as AppliedState;
      assert.equal(applied.viewId, 'view-ct');
      assert.equal(applied.layers.length, 1);
      assert.equal(applied.volumeIds.length, 1);
      assert.match(applied.volumeIds[0], /^nuclear-volume:fixture\.volume\.ct-axial:/);

      const [layer] = applied.layers;
      assert.deepEqual(layer.properties.voiRange, { lower: -1000, upper: 1000 });
      assert.equal(layer.properties.colormap.name, 'Grayscale');
      assert.equal(layer.properties.colormap.opacity, 1);
      assert.equal(layer.properties.invert, false);
      assert.equal(layer.properties.interpolationType, 1);
      assert.equal(applied.blendMode, 'COMPOSITE');
      assert.equal(applied.slabThicknessMm, undefined);
      assert.deepEqual(applied.requestedOrientation, {
        viewPlaneNormal: [0, 0, 1],
        viewUp: [0, 1, 0],
      });
      assertComponentsNear(applied.camera.viewPlaneNormal, [0, 0, 1], 'camera.viewPlaneNormal');
      assertComponentsNear(applied.camera.viewUp, [0, 1, 0], 'camera.viewUp');
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('3. a CT+PET fusion applies the PET palette, 0.5^0.42 opacity, mapping and orientation', async () => {
    const harness = await createRendererHarness({ entryPath: APPLICATION_ENTRY_PATH });
    try {
      const ack = await callProbe(harness.page, 'applyFusion', [
        { ct: readFixture('ct-axial'), pet: readFixture('pt-axial') },
      ]);
      assert.equal(ack.ok, true, describeAck(ack));
      const applied = ack.applied as AppliedState;
      assert.equal(applied.viewId, 'view-fusion');
      assert.equal(applied.layers.length, 2);
      assert.equal(applied.blendMode, 'COMPOSITE');
      assert.equal(applied.slabThicknessMm, undefined);

      const [ctLayer, petLayer] = applied.layers;
      assert.equal(ctLayer.assetId, 'fixture.volume.ct-axial');
      assert.equal(ctLayer.properties.colormap.name, 'Grayscale');
      assert.equal(petLayer.assetId, 'fixture.volume.pt-axial');
      assert.equal(petLayer.properties.colormap.name, 'PET');
      assert.equal(petLayer.properties.invert, false);
      assert.equal(petLayer.properties.interpolationType, 1);

      assertNear(petLayer.properties.voiRange.lower, 0, 1e-6, 'PET voiRange.lower');
      assertNear(petLayer.properties.voiRange.upper, 8 / SUV_FACTOR, 1e-6, 'PET voiRange.upper');
      assertNear(
        petLayer.properties.colormap.opacity,
        FUSION_OPACITY,
        1e-12,
        'PET fusion opacity',
      );
      assert.ok(
        (petLayer.properties.colormap.opacityMapping?.length ?? 0) > 0,
        'the fusion overlay must carry an opacity mapping',
      );

      assertComponentsNear(applied.camera.viewPlaneNormal, [0, 0, 1], 'camera.viewPlaneNormal');
      assertComponentsNear(applied.camera.viewUp, [0, 1, 0], 'camera.viewUp');
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  for (const { scenario, code } of SCENARIOS) {
    it(`4.${scenario} refuses with ${code} and leaves the viewport unmodified`, async () => {
      const harness = await createRendererHarness({ entryPath: APPLICATION_ENTRY_PATH });
      try {
        const ack = await callProbe(harness.page, 'negative', [
          { ct: readFixture('ct-axial'), pet: readFixture('pt-axial') },
          scenario,
        ]);
        assert.equal(ack.ok, false, `scenario '${scenario}' must fail closed`);
        assert.equal(ack.code, code, describeAck(ack));
        assert.equal(ack.actorCount, 0, `scenario '${scenario}' must not set any volume`);
        assert.deepEqual(harness.pageErrors, []);
        assert.deepEqual(harness.consoleErrors, []);
      } finally {
        await harness.close();
      }
    });
  }

  it('5. a MIP plan with a 12 mm slab applies MAXIMUM_INTENSITY_BLEND and reads the slab back from the viewport', async () => {
    const harness = await createRendererHarness({ entryPath: APPLICATION_ENTRY_PATH });
    try {
      const ack = await callProbe(harness.page, 'applyCt', [
        readFixture('ct-axial'),
        'gray',
        SLAB_THICKNESS_MM,
      ]);
      assert.equal(ack.ok, true, describeAck(ack));
      const applied = ack.applied as AppliedState;
      assert.equal(applied.blendMode, 'MAXIMUM_INTENSITY_BLEND');
      assert.equal(
        applied.slabThicknessMm,
        SLAB_THICKNESS_MM,
        'slab thickness must be observed from the viewport, not echoed from the plan',
      );
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });
});
