/**
 * NuClear P3.4-B.1 — real Cornerstone DICOM palette registration evidence.
 *
 * The controlled WebGL 2 harness bundles `fixtures/palette-entry.ts`, which
 * registers the real `@nuclear/rendering-presets` catalog through the real
 * `registerDicomPalettes()` adapter. These tests assert that Cornerstone's
 * registry actually lists and resolves every palette under both its DICOM name
 * and its content label, that the PET transfer function carries 1024 RGB
 * points, and that a repeated registration is idempotent and does not grow the
 * registry.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';

import { createRendererHarness } from './fixtures/renderer-harness.mjs';

const PALETTE_ENTRY_PATH = fileURLToPath(new URL('./fixtures/palette-entry.ts', import.meta.url));

interface PaletteAck {
  ok?: boolean;
  name?: string;
  code?: string;
  message?: string;
  names?: string[];
  secondCallNames?: string[];
  petRgbPointCount?: number;
  hotIronRgbPointCount?: number;
  namesInclude?: Record<string, boolean>;
}

const REQUIRED_NAMES = [
  'PET',
  'HOT_IRON',
  'Hot Iron',
  'Hot Metal Blue',
  'HOT_METAL_BLUE',
  'PET 20 Step',
  'PET_20_STEP',
] as const;

/**
 * The seven unique registry names, in catalog order: each palette's `name` and
 * `contentLabel`, deduped where identical (`PET`).
 */
const EXPECTED_NAMES = [
  'Hot Iron',
  'HOT_IRON',
  'PET',
  'Hot Metal Blue',
  'HOT_METAL_BLUE',
  'PET 20 Step',
  'PET_20_STEP',
];

async function callRegisterTwice(page: Page): Promise<PaletteAck> {
  return page.evaluate(() => {
    const scope = globalThis as unknown as {
      __nuclearPaletteProbe?: { registerTwice: () => unknown };
    };
    const probe = scope.__nuclearPaletteProbe;
    if (!probe) {
      throw new Error('__nuclearPaletteProbe is not installed');
    }
    return probe.registerTwice();
  }) as Promise<PaletteAck>;
}

function describeAck(ack: PaletteAck): string {
  return `${ack.name ?? ''} ${ack.code ?? ''} ${ack.message ?? ''}`.trim();
}

describe('NuClear P3.4-B.1 — Cornerstone DICOM palette registration', () => {
  it('1. registers all four palettes under seven unique name/label forms', async () => {
    const harness = await createRendererHarness({ entryPath: PALETTE_ENTRY_PATH });
    try {
      const ack = await callRegisterTwice(harness.page);
      assert.equal(ack.ok, true, describeAck(ack));
      assert.equal(ack.names?.length, 7, 'registerDicomPalettes must return seven unique names');
      assert.deepEqual(ack.names, EXPECTED_NAMES, 'registerDicomPalettes must return unique names');
      for (const required of REQUIRED_NAMES) {
        assert.equal(ack.namesInclude?.[required], true, `registry must include '${required}'`);
      }
      assert.equal(ack.petRgbPointCount, 1024, 'getColormap("PET").RGBPoints.length');
      assert.equal(ack.hotIronRgbPointCount, 1024, 'getColormap("Hot Iron").RGBPoints.length');
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });

  it('2. a second registration is idempotent and does not grow the registry', async () => {
    const harness = await createRendererHarness({ entryPath: PALETTE_ENTRY_PATH });
    try {
      const ack = await callRegisterTwice(harness.page);
      assert.equal(ack.ok, true, describeAck(ack));
      assert.deepEqual(ack.secondCallNames, ack.names, 'the second call must return the same names');
      const uniqueRegistered = new Set(ack.names ?? []);
      assert.equal(uniqueRegistered.size, 7, 'both forms collapse to seven unique registry names');
      for (const required of REQUIRED_NAMES) {
        assert.equal(
          uniqueRegistered.has(required),
          true,
          `'${required}' must be a registered unique name`,
        );
      }
      assert.deepEqual(harness.pageErrors, []);
      assert.deepEqual(harness.consoleErrors, []);
    } finally {
      await harness.close();
    }
  });
});
