/**
 * NuClear P3.5-A — pure, Node-safe temporary high-resolution `RenderTarget`
 * dimensioning, spec validation and plan retargeting (ADR-009). No DOM, no
 * WebGL and no Cornerstone: the native offscreen capture belongs to the
 * controlled renderer harness suite.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type { ViewApplicationPlan } from '../../packages/medical-engine/src/view-application/index.ts';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  MM_PER_INCH,
  RENDER_TARGET_ERROR_CODES,
  RenderTargetError,
  computeRenderTargetPixelDimensions,
  deriveTemporaryRenderTargetPlan,
  validateTemporaryRenderTargetSpec,
} = await import('../../packages/medical-engine/src/view-application/index.ts');

type RenderTargetErrorCode = string;

function expectRenderTargetError(
  run: () => unknown,
  code: RenderTargetErrorCode,
): RenderTargetError {
  let caught: RenderTargetError | undefined;
  assert.throws(run, (error: unknown) => {
    assert.ok(
      error instanceof RenderTargetError,
      `expected RenderTargetError, got ${String(error)}`,
    );
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    caught = error;
    return true;
  });
  return caught as RenderTargetError;
}

const PLAN = {
  viewId: 'view-ct',
  layers: [
    {
      assetId: 'asset-ct',
      volumeId: 'nuclear-volume:volume-ct',
      role: 'base',
      modality: 'ct',
      properties: {
        voiRange: { lower: -1000, upper: 1000 },
        colormap: { name: 'Grayscale', opacity: 1 },
        invert: false,
        interpolationType: 'linear',
      },
    },
  ],
  projection: { mode: 'slice', blendMode: 'COMPOSITE', slabThicknessMm: undefined },
  spatial: {
    frameOfReferenceUID: 'for-ct',
    orientation: [1, 0, 0, 0, 1, 0],
    viewPlaneNormal: [0, 0, 1],
    viewUp: [0, 1, 0],
    referenceLocation: [0, 0, 0],
    sliceOffsetMm: 0,
  },
  transforms: {
    patientToViewPlane: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    viewPlaneToViewport: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    viewportSizePx: [512, 512],
  },
} satisfies ViewApplicationPlan;

const VALID_SPEC = {
  kind: 'temporary-high-resolution',
  pixelDimensions: [1890, 1890],
  dpi: 600,
  colorProfile: 'srgb',
  alpha: 'opaque',
  liveCanvasPolicy: 'never-resize-live-canvas',
} as const;

describe('NuClear P3.5-A — render target dimensioning', () => {
  it('1. computes the exact pixel dimensions for 300 and 600 DPI', () => {
    assert.equal(MM_PER_INCH, 25.4);
    assert.deepEqual(computeRenderTargetPixelDimensions([80, 80], 600), [1890, 1890]);
    assert.deepEqual(computeRenderTargetPixelDimensions([80, 80], 300), [945, 945]);
    assert.deepEqual(computeRenderTargetPixelDimensions([180, 120], 300), [2126, 1417]);
  });

  it('2. refuses a non-positive or non-finite size or DPI with RENDER_TARGET_SPEC_INVALID', () => {
    const sizes: readonly (readonly [number, number])[] = [
      [0, 80],
      [-1, 80],
      [Number.NaN, 80],
      [Number.POSITIVE_INFINITY, 80],
      [80, 0],
      [80, Number.NEGATIVE_INFINITY],
    ];
    for (const size of sizes) {
      expectRenderTargetError(
        () => computeRenderTargetPixelDimensions(size, 600),
        RENDER_TARGET_ERROR_CODES.specInvalid,
      );
    }
    for (const dpi of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectRenderTargetError(
        () => computeRenderTargetPixelDimensions([80, 80], dpi),
        RENDER_TARGET_ERROR_CODES.specInvalid,
      );
    }
  });
});

describe('NuClear P3.5-A — temporary render target spec validation', () => {
  it('3. accepts a consistent 8 cm at 600 DPI spec and refuses each malformed field', () => {
    assert.doesNotThrow(() => validateTemporaryRenderTargetSpec(VALID_SPEC, [80, 80]));

    // Non-positive / non-integer pixel dimensions.
    for (const pixelDimensions of [
      [0, 1890],
      [1890, -1],
      [1890.5, 1890],
    ]) {
      expectRenderTargetError(
        () =>
          validateTemporaryRenderTargetSpec(
            { ...VALID_SPEC, pixelDimensions } as never,
            [80, 80],
          ),
        RENDER_TARGET_ERROR_CODES.specInvalid,
      );
    }

    // Invalid DPI.
    for (const dpi of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectRenderTargetError(
        () => validateTemporaryRenderTargetSpec({ ...VALID_SPEC, dpi } as never, [80, 80]),
        RENDER_TARGET_ERROR_CODES.specInvalid,
      );
    }

    // Forbidden live-canvas policy (cast past the contract union).
    expectRenderTargetError(
      () =>
        validateTemporaryRenderTargetSpec(
          { ...VALID_SPEC, liveCanvasPolicy: 'resize-live-canvas' } as never,
          [80, 80],
        ),
      RENDER_TARGET_ERROR_CODES.specInvalid,
    );

    // Blank colour profile.
    for (const colorProfile of ['', '   ']) {
      expectRenderTargetError(
        () =>
          validateTemporaryRenderTargetSpec({ ...VALID_SPEC, colorProfile } as never, [80, 80]),
        RENDER_TARGET_ERROR_CODES.specInvalid,
      );
    }

    // Unknown alpha mode (cast past the contract union).
    expectRenderTargetError(
      () =>
        validateTemporaryRenderTargetSpec(
          { ...VALID_SPEC, alpha: 'translucent' } as never,
          [80, 80],
        ),
      RENDER_TARGET_ERROR_CODES.specInvalid,
    );

    // Declared pixels inconsistent with size/DPI.
    expectRenderTargetError(
      () =>
        validateTemporaryRenderTargetSpec(
          { ...VALID_SPEC, pixelDimensions: [1000, 1000] } as never,
          [80, 80],
        ),
      RENDER_TARGET_ERROR_CODES.dimensionsMismatch,
    );
  });
});

describe('NuClear P3.5-A — temporary render target plan derivation', () => {
  it('4. retargets only transforms.viewportSizePx and carries every other field verbatim', () => {
    const derived = deriveTemporaryRenderTargetPlan(PLAN, [1890, 1890]);

    const expected = {
      ...PLAN,
      transforms: { ...PLAN.transforms, viewportSizePx: [1890, 1890] },
    };
    assert.deepEqual(derived, expected);

    // Identity carries prove nothing else is cloned, re-derived or dropped.
    assert.equal(derived.layers, PLAN.layers);
    assert.equal(derived.projection, PLAN.projection);
    assert.equal(derived.spatial, PLAN.spatial);
    assert.equal(derived.transforms.patientToViewPlane, PLAN.transforms.patientToViewPlane);
    assert.equal(derived.transforms.viewPlaneToViewport, PLAN.transforms.viewPlaneToViewport);

    // The source plan is never mutated.
    assert.deepEqual(PLAN.transforms.viewportSizePx, [512, 512]);

    for (const pixelDimensions of [
      [0, 100],
      [100, -1],
      [1.5, 100],
      [Number.NaN, 100],
    ]) {
      expectRenderTargetError(
        () => deriveTemporaryRenderTargetPlan(PLAN, pixelDimensions),
        RENDER_TARGET_ERROR_CODES.specInvalid,
      );
    }
  });
});

describe('NuClear P3.5-A — render target error', () => {
  it('5. RenderTargetError carries the typed code, its name and a non-empty message', () => {
    const error = new RenderTargetError(RENDER_TARGET_ERROR_CODES.disposalFailed, 'dispose failed');
    assert.ok(error instanceof Error);
    assert.ok(error instanceof RenderTargetError);
    assert.equal(error.name, 'RenderTargetError');
    assert.equal(error.code, 'RENDER_TARGET_DISPOSAL_FAILED');
    assert.equal(error.message, 'dispose failed');
  });
});
