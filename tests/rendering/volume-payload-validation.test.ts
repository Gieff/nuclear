/**
 * NuClear P3.2.1 — pure fixture payload and scalar-semantics validation.
 *
 * Imports the Node-safe `volume.ts` directly (no browser, no Cornerstone) and
 * drives it with the committed CT/PT fixtures. Every negative here exists
 * because Cornerstone 5.10.7's `createLocalVolume` only derives a byte length
 * for five typed arrays and silently mis-handles an incoherent payload.
 */

import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type { VolumeScalarArray } from '../../packages/medical-engine/src/renderer/volume.ts';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));
const {
  buildVolumeIngestionPlan,
  VOLUME_INGESTION_ERROR_CODES,
  VolumeIngestionError,
} = await import('../../packages/medical-engine/src/renderer/volume.ts');
const { makeRequest } = await import('./fixtures/volume-request.ts');

function expectCode(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof VolumeIngestionError, `expected VolumeIngestionError, got ${String(error)}`);
    assert.equal((error as VolumeIngestionError).code, code);
    assert.ok((error as VolumeIngestionError).message.length > 0, 'expected an actionable message');
    return true;
  });
}

describe('NuClear P3.2.1 — fixture payload validation', () => {
  const codes = VOLUME_INGESTION_ERROR_CODES;
  const ct = () => makeRequest('ct-axial');
  const pt = () => makeRequest('pt-axial');

  it('refuses a non-single sample count and an unsupported/mismatched scalar array', () => {
    const request = ct();
    expectCode(
      () => buildVolumeIngestionPlan({ ...request, pixels: { ...request.pixels, samplesPerPixel: 2 } }),
      codes.payloadInvalid,
    );
    const wide = new Int32Array(request.pixels.scalarData.length) as unknown as VolumeScalarArray;
    expectCode(
      () => buildVolumeIngestionPlan({ ...request, pixels: { ...request.pixels, scalarData: wide } }),
      codes.payloadInvalid,
    );
    expectCode(
      () => buildVolumeIngestionPlan({ ...request, pixels: { ...request.pixels, dtype: 'uint16' } }),
      codes.payloadInvalid,
    );
  });

  it('refuses a signedness incoherent with the declared dtype', () => {
    const request = ct();
    expectCode(
      () => buildVolumeIngestionPlan({ ...request, pixels: { ...request.pixels, signedness: 'unsigned' } }),
      codes.payloadInvalid,
    );
    const ptRequest = pt();
    expectCode(
      () => buildVolumeIngestionPlan({ ...ptRequest, pixels: { ...ptRequest.pixels, signedness: 'signed' } }),
      codes.payloadInvalid,
    );
  });

  it('refuses each incoherent bit layout', () => {
    const request = ct();
    for (const bits of [{ bitsAllocated: 8 }, { bitsStored: 0 }, { bitsStored: 17 }, { highBit: 14 }]) {
      expectCode(
        () => buildVolumeIngestionPlan({ ...request, pixels: { ...request.pixels, ...bits } }),
        codes.payloadInvalid,
      );
    }
    // The rescaled-float32 layout escape must itself stay bounded: the committed
    // PT fixture is source 16-bit, but an unsupported source width (12) must be
    // refused rather than reaching Cornerstone with an undefined byte length.
    const ptRequest = pt();
    expectCode(
      () =>
        buildVolumeIngestionPlan({
          ...ptRequest,
          pixels: { ...ptRequest.pixels, bitsAllocated: 12, bitsStored: 12, highBit: 11 },
        }),
      codes.payloadInvalid,
    );
  });

  it('refuses an empty or non-string photometricInterpretation', () => {
    const request = ct();
    expectCode(
      () => buildVolumeIngestionPlan({ ...request, pixels: { ...request.pixels, photometricInterpretation: '' } }),
      codes.payloadInvalid,
    );
    expectCode(
      () =>
        buildVolumeIngestionPlan({
          ...request,
          pixels: { ...request.pixels, photometricInterpretation: 42 as unknown as string },
        }),
      codes.payloadInvalid,
    );
  });

  it('refuses non-positive, non-integer and grid-mismatched dimensions', () => {
    const request = ct();
    for (const dimensions of [[4, 4, 4], [0, 4, 3], [4.5, 4, 3]] as Array<[number, number, number]>) {
      expectCode(
        () => buildVolumeIngestionPlan({ ...request, pixels: { ...request.pixels, dimensions } }),
        codes.payloadInvalid,
      );
    }
  });

  it('refuses a non-finite float32 payload (NaN and Infinity)', () => {
    const request = pt();
    const nan = new Float32Array(request.pixels.scalarData);
    nan[0] = Number.NaN;
    const infinite = new Float32Array(request.pixels.scalarData);
    infinite[1] = Number.POSITIVE_INFINITY;
    expectCode(
      () => buildVolumeIngestionPlan({ ...request, pixels: { ...request.pixels, scalarData: nan } }),
      codes.payloadInvalid,
    );
    expectCode(
      () => buildVolumeIngestionPlan({ ...request, pixels: { ...request.pixels, scalarData: infinite } }),
      codes.payloadInvalid,
    );
  });

  it('refuses a value semantics incoherent with the declared scalar domain', () => {
    const ctRequest = ct();
    expectCode(
      () =>
        buildVolumeIngestionPlan({
          ...ctRequest,
          asset: { ...ctRequest.asset, valueSemantics: { type: 'generic-intensity', unit: 'a.u.' } },
        }),
      codes.scalarSemanticsDisagreement,
    );
    expectCode(
      () =>
        buildVolumeIngestionPlan({
          ...ctRequest,
          asset: { ...ctRequest.asset, valueSemantics: { type: 'hounsfield', unit: 'Bq/mL' } },
        }),
      codes.scalarSemanticsDisagreement,
    );
    const ptRequest = pt();
    expectCode(
      () =>
        buildVolumeIngestionPlan({
          ...ptRequest,
          asset: { ...ptRequest.asset, valueSemantics: { type: 'hounsfield', unit: 'HU' } },
        }),
      codes.scalarSemanticsDisagreement,
    );
    expectCode(
      () =>
        buildVolumeIngestionPlan({
          ...ctRequest,
          pixels: { ...ctRequest.pixels, scalarDataDomain: 'stored-values' },
          asset: { ...ctRequest.asset, valueSemantics: { type: 'hounsfield', unit: 'HU' } },
        }),
      codes.scalarSemanticsDisagreement,
    );
  });

  it('accepts stored-values with raw-counts or generic-intensity', () => {
    const request = ct();
    assert.ok(
      buildVolumeIngestionPlan({
        ...request,
        pixels: { ...request.pixels, scalarDataDomain: 'stored-values' },
        asset: { ...request.asset, valueSemantics: { type: 'raw-counts', unit: 'counts' } },
      }),
    );
    assert.ok(
      buildVolumeIngestionPlan({
        ...request,
        pixels: { ...request.pixels, scalarDataDomain: 'stored-values' },
        asset: { ...request.asset, valueSemantics: { type: 'generic-intensity', unit: 'a.u.' } },
      }),
    );
  });

  it('accepts a rescaled float32 source layout narrower than its element width', () => {
    // Committed PT fixture: float32 Bq/mL derived from 16-bit source pixels.
    assert.ok(buildVolumeIngestionPlan(pt()));
  });
});
