/**
 * @nuclear/medical-engine — PET quantitation binding resolver (ADR-005).
 *
 * Ratifies the correspondence between the DICOM PET units
 * (`asset.metadata.pet.units`) and the loaded volume's transport domain
 * (`scalarDataDomain`). Display semantics (`valueSemantics`) and transport
 * domain are separate axes and are deliberately not conflated.
 *
 * Node-safe and arithmetic-free beyond the certified `suvFactor` conversion:
 * the pure conversion helpers never re-derive SUVbw from raw DICOM fields, and
 * this module performs no floating-point library calls (P2.5 integrity gate).
 */

import type { ImagingAsset } from '@nuclear/shared-types';
import type { ScalarDataDomain } from '../renderer/volume-types.js';
import { PET_BINDING_ERROR_CODES, PetBindingError } from './errors.js';

/** Validated quantitative PET binding consumable by the fusion path. */
export interface QuantitativePetBinding {
  /** Body-weight scaling factor in g/Bq, validated finite and strictly > 0. */
  readonly suvFactor: number;
  readonly units: 'BQML';
  readonly scalarDataDomain: 'rescaled-bqml';
}

/**
 * Resolves the quantitative PET binding for a PET asset whose volume plan
 * declares `scalarDataDomain`. Refuses fail-closed in a fixed order:
 * modality → PET units → quantitation presence → computed status → factor
 * validity → transport domain.
 */
export function resolvePetQuantitationBinding(
  asset: ImagingAsset,
  scalarDataDomain: ScalarDataDomain,
): QuantitativePetBinding {
  if (asset.modality !== 'PT') {
    throw new PetBindingError(
      PET_BINDING_ERROR_CODES.modalityNotPet,
      `asset '${asset.id}' has modality '${asset.modality}'; quantitative fusion requires a PET (PT) asset`,
    );
  }

  const units = asset.metadata.pet?.units;
  if (units !== 'BQML') {
    throw new PetBindingError(
      PET_BINDING_ERROR_CODES.unitsNotBqml,
      `asset '${asset.id}' declares PET Units '${units ?? 'undefined'}'; quantitative fusion requires DICOM Units (0054,1001) 'BQML'`,
    );
  }

  const quantitation = asset.metadata.petQuantitation;
  if (quantitation === undefined) {
    throw new PetBindingError(
      PET_BINDING_ERROR_CODES.quantitationMissing,
      `asset '${asset.id}' has no PET quantitation result; run the scientific worker SUVbw quantitation before fusion`,
    );
  }

  if (quantitation.status !== 'computed') {
    throw new PetBindingError(
      PET_BINDING_ERROR_CODES.quantitationNotComputed,
      `asset '${asset.id}' PET quantitation status is '${quantitation.status}'; only a 'computed' result permits quantitative fusion`,
    );
  }

  const suvFactor = quantitation.suvFactor;
  if (suvFactor === undefined || !Number.isFinite(suvFactor) || suvFactor <= 0) {
    throw new PetBindingError(
      PET_BINDING_ERROR_CODES.suvFactorInvalid,
      `asset '${asset.id}' PET quantitation suvFactor is ${String(suvFactor)}; expected a finite value strictly greater than 0 (g/Bq)`,
    );
  }

  if (scalarDataDomain !== 'rescaled-bqml') {
    throw new PetBindingError(
      PET_BINDING_ERROR_CODES.scalarDomainNotBqml,
      `volume plan for asset '${asset.id}' declares scalarDataDomain '${scalarDataDomain}'; quantitative fusion requires 'rescaled-bqml' regardless of the asset valueSemantics display unit`,
    );
  }

  return { suvFactor, units: 'BQML', scalarDataDomain: 'rescaled-bqml' };
}

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new PetBindingError(
      PET_BINDING_ERROR_CODES.inputNotFinite,
      `${label} must be a finite number, received ${String(value)}`,
    );
  }
  return value;
}

/** `suv [g/mL] / suvFactor [g/Bq] = Bq/mL`. */
export function suvToBqml(suv: number, suvFactor: number): number {
  requireFinite(suv, 'suv');
  requireFinite(suvFactor, 'suvFactor');
  if (suv < 0) {
    throw new PetBindingError(
      PET_BINDING_ERROR_CODES.suvNegative,
      `suv must be non-negative (spec §3 guard minSuv >= 0), received ${String(suv)}`,
    );
  }
  return suv / suvFactor;
}

/** `bqml [Bq/mL] * suvFactor [g/Bq] = suv [g/mL]`. */
export function bqmlToSuv(bqml: number, suvFactor: number): number {
  requireFinite(bqml, 'bqml');
  requireFinite(suvFactor, 'suvFactor');
  return bqml * suvFactor;
}

/** Converts a `[min, max]` SUV range to its Bq/mL transport range. */
export function suvRangeToBqml(
  range: readonly [number, number],
  suvFactor: number,
): readonly [number, number] {
  return [suvToBqml(range[0], suvFactor), suvToBqml(range[1], suvFactor)];
}
