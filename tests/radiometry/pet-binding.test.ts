/**
 * NuClear P3.4-A — PET quantitation binding resolver (ADR-005).
 *
 * Pure Node: no DOM, no WebGL, no Cornerstone. Proves fail-closed ordering,
 * the authoritative-units rule (`asset.metadata.pet.units`, never a
 * `PetQuantitationResult.units` field), and that display semantics
 * (`valueSemantics: suv-bw / g/mL`) are not conflated with the transport
 * `scalarDataDomain`.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  PET_BINDING_ERROR_CODES,
  PetBindingError,
  bqmlToSuv,
  resolvePetQuantitationBinding,
  suvRangeToBqml,
  suvToBqml,
} = await import('../../packages/medical-engine/src/radiometry/index.ts');

import type {
  ImagingAsset,
  PetAcquisitionMetadata,
  PetQuantitationResult,
} from '../../packages/shared-types/src/index.js';
import { mockPetAsset } from '../fixtures/clinical-contracts.fixture.ts';

const BASE_PET = mockPetAsset.metadata.pet as PetAcquisitionMetadata;
const COMPUTED = mockPetAsset.metadata.petQuantitation as PetQuantitationResult;
const SUV_FACTOR = 0.0002764;

/** Named tolerance for the linear SUV <-> Bq/mL conversions. */
const TOLERANCE = 1e-12;

function petAsset(options: {
  readonly modality?: ImagingAsset['modality'];
  readonly pet?: PetAcquisitionMetadata | undefined;
  readonly petQuantitation?: PetQuantitationResult | undefined;
}): ImagingAsset {
  return {
    ...mockPetAsset,
    modality: options.modality ?? mockPetAsset.modality,
    metadata: {
      ...mockPetAsset.metadata,
      pet: 'pet' in options ? options.pet : BASE_PET,
      petQuantitation:
        'petQuantitation' in options ? options.petQuantitation : COMPUTED,
    },
  };
}

function expectPetCode(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof PetBindingError, `expected PetBindingError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    return true;
  });
}

describe('NuClear P3.4-A — PET quantitation binding (ADR-005)', () => {
  it('1. a computed BQML PET asset on a rescaled-bqml plan resolves and preserves the factor', () => {
    const binding = resolvePetQuantitationBinding(petAsset({}), 'rescaled-bqml');
    assert.deepEqual(binding, {
      suvFactor: SUV_FACTOR,
      units: 'BQML',
      scalarDataDomain: 'rescaled-bqml',
    });
    assert.equal(binding.suvFactor, mockPetAsset.metadata.petQuantitation?.suvFactor);
  });

  it('2. a non-PET modality refuses with PET_BINDING_MODALITY_NOT_PET', () => {
    expectPetCode(
      () => resolvePetQuantitationBinding(petAsset({ modality: 'CT' }), 'rescaled-bqml'),
      PET_BINDING_ERROR_CODES.modalityNotPet,
    );
  });

  it('3. missing quantitation refuses with PET_BINDING_QUANTITATION_MISSING', () => {
    expectPetCode(
      () => resolvePetQuantitationBinding(petAsset({ petQuantitation: undefined }), 'rescaled-bqml'),
      PET_BINDING_ERROR_CODES.quantitationMissing,
    );
  });

  it('4. invalid and unavailable statuses refuse with PET_BINDING_QUANTITATION_NOT_COMPUTED', () => {
    for (const status of ['invalid', 'unavailable'] as const) {
      expectPetCode(
        () =>
          resolvePetQuantitationBinding(
            petAsset({ petQuantitation: { ...COMPUTED, status } }),
            'rescaled-bqml',
          ),
        PET_BINDING_ERROR_CODES.quantitationNotComputed,
      );
    }
  });

  it('5. CNTS and GML units refuse with PET_BINDING_UNITS_NOT_BQML', () => {
    for (const units of ['CNTS', 'GML']) {
      expectPetCode(
        () =>
          resolvePetQuantitationBinding(
            petAsset({ pet: { ...BASE_PET, units } }),
            'rescaled-bqml',
          ),
        PET_BINDING_ERROR_CODES.unitsNotBqml,
      );
    }
  });

  it('6. a missing pet metadata block refuses with PET_BINDING_UNITS_NOT_BQML', () => {
    expectPetCode(
      () => resolvePetQuantitationBinding(petAsset({ pet: undefined }), 'rescaled-bqml'),
      PET_BINDING_ERROR_CODES.unitsNotBqml,
    );
  });

  it('7. a zero, negative, NaN or undefined suvFactor refuses with PET_BINDING_SUV_FACTOR_INVALID', () => {
    for (const suvFactor of [0, -1, Number.NaN, undefined]) {
      expectPetCode(
        () =>
          resolvePetQuantitationBinding(
            petAsset({ petQuantitation: { ...COMPUTED, suvFactor } }),
            'rescaled-bqml',
          ),
        PET_BINDING_ERROR_CODES.suvFactorInvalid,
      );
    }
  });

  it('8. stored-values and rescaled-hu plan domains refuse with PET_BINDING_SCALAR_DOMAIN_NOT_BQML', () => {
    for (const domain of ['stored-values', 'rescaled-hu'] as const) {
      expectPetCode(
        () => resolvePetQuantitationBinding(petAsset({}), domain),
        PET_BINDING_ERROR_CODES.scalarDomainNotBqml,
      );
    }
  });

  it('9. non-conflation: a suv-bw/g-mL asset on a stored-values plan is refused by domain', () => {
    const asset = petAsset({});
    assert.equal(asset.valueSemantics.type, 'suv-bw');
    assert.equal(asset.valueSemantics.unit, 'g/mL');
    // The plan's transport domain is the only relevant axis; the display
    // semantic must not be read as the scalar transport domain.
    expectPetCode(
      () => resolvePetQuantitationBinding(asset, 'stored-values'),
      PET_BINDING_ERROR_CODES.scalarDomainNotBqml,
    );
    assert.equal(
      PET_BINDING_ERROR_CODES.scalarDomainNotBqml,
      'PET_BINDING_SCALAR_DOMAIN_NOT_BQML',
    );
    assert.equal(
      resolvePetQuantitationBinding(asset, 'rescaled-bqml').scalarDataDomain,
      'rescaled-bqml',
    );
  });
});

describe('NuClear P3.4-A — SUV <-> Bq/mL conversion (ADR-005 §4)', () => {
  it('10. suvRangeToBqml([0, 8]) equals [0, 8 / suvFactor] within 1e-12', () => {
    const range = suvRangeToBqml([0, 8], SUV_FACTOR);
    assert.equal(range.length, 2);
    assert.ok(Math.abs(range[0] - 0) <= TOLERANCE);
    assert.ok(Math.abs(range[1] - 8 / SUV_FACTOR) <= TOLERANCE);
  });

  it('11. bqmlToSuv(suvToBqml(suv)) round-trips within 1e-12', () => {
    for (const suv of [0, 0.5, 2, 8, 100]) {
      const roundTripped = bqmlToSuv(suvToBqml(suv, SUV_FACTOR), SUV_FACTOR);
      assert.ok(Math.abs(roundTripped - suv) <= TOLERANCE, `round-trip for suv=${suv}`);
    }
  });

  it('12. non-finite conversion inputs refuse with PET_BINDING_INPUT_NOT_FINITE', () => {
    expectPetCode(
      () => suvToBqml(Number.NaN, SUV_FACTOR),
      PET_BINDING_ERROR_CODES.inputNotFinite,
    );
    expectPetCode(
      () => suvToBqml(1, Number.POSITIVE_INFINITY),
      PET_BINDING_ERROR_CODES.inputNotFinite,
    );
    expectPetCode(
      () => bqmlToSuv(Number.NEGATIVE_INFINITY, SUV_FACTOR),
      PET_BINDING_ERROR_CODES.inputNotFinite,
    );
    expectPetCode(
      () => suvRangeToBqml([Number.NaN, 1], SUV_FACTOR),
      PET_BINDING_ERROR_CODES.inputNotFinite,
    );
  });

  it('13. a negative SUV input refuses with PET_BINDING_SUV_NEGATIVE (spec §3 minSuv >= 0)', () => {
    expectPetCode(
      () => suvToBqml(-1, SUV_FACTOR),
      PET_BINDING_ERROR_CODES.suvNegative,
    );
    expectPetCode(
      () => suvRangeToBqml([-1, 8], SUV_FACTOR),
      PET_BINDING_ERROR_CODES.suvNegative,
    );
  });

  it('14. suvToBqml refuses a zero or negative factor with PET_BINDING_SUV_FACTOR_INVALID', () => {
    for (const suvFactor of [0, -0.1]) {
      expectPetCode(
        () => suvToBqml(1, suvFactor),
        PET_BINDING_ERROR_CODES.suvFactorInvalid,
      );
    }
  });

  it('15. bqmlToSuv refuses a zero or negative factor with PET_BINDING_SUV_FACTOR_INVALID', () => {
    for (const suvFactor of [0, -1]) {
      expectPetCode(
        () => bqmlToSuv(1, suvFactor),
        PET_BINDING_ERROR_CODES.suvFactorInvalid,
      );
    }
  });

  it('16. a reversed SUV range refuses with PET_BINDING_RANGE_INVALID', () => {
    expectPetCode(
      () => suvRangeToBqml([8, 0], SUV_FACTOR),
      PET_BINDING_ERROR_CODES.rangeInvalid,
    );
    assert.equal(PET_BINDING_ERROR_CODES.rangeInvalid, 'PET_BINDING_RANGE_INVALID');
  });

  it('17. an overflowing conversion refuses with PET_BINDING_OUTPUT_NOT_FINITE', () => {
    expectPetCode(
      () => suvToBqml(Number.MAX_VALUE, Number.MIN_VALUE),
      PET_BINDING_ERROR_CODES.outputNotFinite,
    );
    expectPetCode(
      () => bqmlToSuv(Number.MAX_VALUE, 2),
      PET_BINDING_ERROR_CODES.outputNotFinite,
    );
    assert.equal(
      PET_BINDING_ERROR_CODES.outputNotFinite,
      'PET_BINDING_OUTPUT_NOT_FINITE',
    );
  });
});
