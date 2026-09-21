# ADR-005: PET/CT Radiometry Binding, Authoritative Units and Scalar-Domain Separation

## Status

Accepted

## Date

2026-09-21

## Context

Phase 3.4 must apply the PET/CT fusion radiometry defined by
[PET_CT_FUSION_RADIOMETRY_SPEC.md](../plans/PET_CT_FUSION_RADIOMETRY_SPEC.md).
The addendum flagged two incoherences that must be closed before any state
application code is written:

1. Spec §6 conditions SUV→Bq/mL conversion on
   `PetQuantitationResult.units === "BQML"`, but the NuClear
   `PetQuantitationResult` contract has **no** `units` field. The DICOM Units
   (0054,1001) value is carried by `asset.metadata.pet.units`
   (`PetAcquisitionMetadata.units`).
2. Contract fixtures describe the PET `valueSemantics` as
   `{ type: 'suv-bw', unit: 'g/mL' }` (the clinical SUVbw display semantic),
   while the P3.2 PT fixture transports `scalarDataDomain: 'rescaled-bqml'`
   (Bq/mL) — proven by the P3.2 bridge test. Accepting both interpretations
   implicitly would let a rendered scalar domain diverge from the declared
   quantitation domain.

`PetQuantitationResult.suvFactor` is documented as a body-weight scaling factor
in `g/Bq`; the spec's own formula is `scalar = suv / suvFactor`, and
`SUV [g/mL] / (g/Bq) = Bq/mL`, so the factor maps between the clinical display
value and the loaded scalar transport value.

## Decision

1. **The authoritative PET units source is `asset.metadata.pet?.units`.** No
   `units` field is added to `PetQuantitationResult`; duplicating the DICOM
   value would create a second, contradictory authority. Spec §6 is corrected
   accordingly: the guard is on `asset.metadata.pet?.units`.
2. **Quantitative PET fusion is valid if and only if all of the following
   hold**, checked fail-closed:
   - the asset modality is `PT`;
   - `asset.metadata.pet?.units === 'BQML'`;
   - `asset.metadata.petQuantitation?.status === 'computed'`;
   - `suvFactor` is finite and strictly greater than zero;
   - the loaded volume plan declares `scalarDataDomain === 'rescaled-bqml'`.
3. **Display semantics and transport domain are separate axes.**
   `valueSemantics: suv-bw / g/mL` declares how the clinician reads the value;
   the plan's `scalarDataDomain` declares the physical unit of the array
   Cornerstone actually receives. The two must not be conflated. A plan whose
   domain is not `rescaled-bqml` fails the quantitative-fusion guard, even when
   the asset carries a computed SUVbw quantitation.
4. **SUV ↔ Bq/mL conversion uses `suvFactor` in `g/Bq`:**
   `bqml = suv / suvFactor` and `suv = bqml * suvFactor`. The conversion is a
   pure, Node-safe function; it never re-derives `suvFactor` or SUVbw from raw
   DICOM fields in TypeScript.
5. **Presets are declarative and never silently clinical.**
   `@nuclear/rendering-presets` exports only values authorised by the spec:
   the canonical fusion exponent `0.42`, the `highlighted` and `alpha`
   piecewise opacity modes, and the CT Soft Tissue preset (W400/L40). PET
   colormaps and display ranges are caller-declared inputs and have no silent
   default.

## Consequences

- `@nuclear/rendering-presets` gains a real declarative surface
  (`CANONICAL_PET_FUSION_EXPONENT`, `getFusionOpacity`, `getPETOpacityMapping`,
  CT Soft Tissue preset + VOI helper) with typed fail-closed guards.
- `@nuclear/medical-engine` gains a pure PET quantitation binding resolver that
  consumes `ImagingAsset` plus the plan's `scalarDataDomain` and returns either
  a quantitative binding (`suvFactor`, Bq/mL conversion) or a typed refusal.
  Its conversion helpers are the only TypeScript SUV/Bq/mL arithmetic, and they
  operate on already-validated worker values.
- No `@nuclear/shared-types` change is required, so no persisted-contract
  migration is introduced.
- The P3.2 PT fixture and the P3.4 fusion path are now bound by an explicit,
  testable guard rather than by convention.
- Failures are typed and diagnostic; a missing/invalid quantitation, wrong
  units or wrong scalar domain must never produce a plausible fusion image.

## Conditions That Might Warrant a Revision

- If a future phase produces PET volumes whose rendered scalar domain is
  genuinely SUVbw (`g/mL`) rather than Bq/mL, that domain must be added
  explicitly with its own guard and tests.
- If the worker protocol begins transporting decoded voxel arrays, the
  `rescaled-bqml` expectation for the PT fixture must be re-derived from the
  accepted worker evidence rather than assumed.
