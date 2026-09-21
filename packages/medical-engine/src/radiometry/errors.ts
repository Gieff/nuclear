/**
 * @nuclear/medical-engine — typed, fail-closed PET radiometry refusals.
 *
 * A missing, invalid or domain-mismatched quantitation must never produce a
 * plausible-looking fusion image, so every refusal carries a named code and an
 * actionable message.
 */

export const PET_BINDING_ERROR_CODES = {
  modalityNotPet: 'PET_BINDING_MODALITY_NOT_PET',
  quantitationMissing: 'PET_BINDING_QUANTITATION_MISSING',
  quantitationNotComputed: 'PET_BINDING_QUANTITATION_NOT_COMPUTED',
  unitsNotBqml: 'PET_BINDING_UNITS_NOT_BQML',
  suvFactorInvalid: 'PET_BINDING_SUV_FACTOR_INVALID',
  scalarDomainNotBqml: 'PET_BINDING_SCALAR_DOMAIN_NOT_BQML',
  inputNotFinite: 'PET_BINDING_INPUT_NOT_FINITE',
  suvNegative: 'PET_BINDING_SUV_NEGATIVE',
} as const;

export type PetBindingErrorCode =
  (typeof PET_BINDING_ERROR_CODES)[keyof typeof PET_BINDING_ERROR_CODES];

export class PetBindingError extends Error {
  readonly code: PetBindingErrorCode;

  constructor(code: PetBindingErrorCode, message: string) {
    super(message);
    this.name = 'PetBindingError';
    this.code = code;
  }
}
