# ADR-008: `MedicalViewState` → Cornerstone Application Contract

## Status

Accepted

## Date

2026-09-21

## Context

P3.4-B must apply a persisted `MedicalViewState` to a Cornerstone viewport
without inferring any clinical or presentation value. Cornerstone's
`setProperties` consumes `ViewportProperties { voiRange, colormap, invert,
interpolationType, … }`, where `interpolationType` is the numeric
`InterpolationType` and `colormap` is `{ name, opacity, opacityMapping }`. The
state carries portable strings and contract types, so a translation boundary is
required — and it must be testable without a GPU.

## Decision

1. **Split the pure compiler from the browser adapter.** P3.4-B.2.1 adds a
   Node-safe `compileMedicalViewApplication(input)` in
   `@nuclear/medical-engine` that emits a serializable `ViewApplicationPlan`
   (per-layer Cornerstone-shaped `properties` + a projection plan). It imports
   no Cornerstone and touches no GPU. P3.4-B.2.2 owns the browser apply step
   (`setVolumes`, `setProperties`, `setBlendMode`, `setSlabThickness`), the
   residency/geometry checks and the raster capture.

2. **Layer modality is explicit, never inferred.** A layer follows the PET path
   only when it is a fusion `overlay` layer or, for a `single` view, when
   `presentation.modalityPresentation === 'pet'`. `ct`/`mr`/`generic`/undefined
   and all `multi-layer` layers use the CT/generic path. The compiler never
   reads `asset.metadata`, modality enums or scalar ranges to decide.

3. **Colormap resolution is fail-closed.** A `dicom-*` id resolves through the
   ADR-007 catalog to its Cornerstone registration name; a declared built-in
   (`gray`) is accepted verbatim; anything else — including a missing id — is a
   typed refusal. No default palette is substituted.

4. **PET requires the ADR-005 binding and an explicit range.** A PET layer
   without a `QuantitativePetBinding` is refused; it must declare exactly one of
   `voi` (transport Bq/mL) or `suvRange` (clinical SUVbw, converted with
   `suvRangeToBqml`). A fusion overlay's overall opacity is single-sourced from
   `getFusionOpacity(blendSlider)` and its mapping from
   `getPETOpacityMapping(lower, upper, 0, gamma, transferMode)` (ADR-006). A
   single PET view uses `presentation.opacity` and no mapping.

5. **Projection mapping is declared.** `slice` → `COMPOSITE` with no slab;
   `MIP`/`MinIP`/`Average` → the matching `BlendModes` and a required finite
   `slabThicknessMm > 0`. No slab is inferred.

6. **The interpolation enum is mapped at the boundary.**
   `ViewLayerApplication.properties.interpolationType` stays the portable string
   (`'nearest' | 'linear'`); `toCornerstoneInterpolationType` maps it to
   Cornerstone's numeric `InterpolationType` (nearest = 0, linear = 1) for the
   adapter. The other property fields are emitted in Cornerstone shape and can
   be passed through unchanged.

7. **Typed refusals.** Missing/ambiguous inputs raise `ViewApplicationError`
   with a named code; the certified preset (`PresetError`) and conversion
   (`PetBindingError`) errors propagate fail-closed rather than being
   re-labelled, so a corrupt transfer curve can never become a plausible plan.

## Consequences

- The application rules are unit-testable in Node with the committed fixtures;
  the real-harness evidence is confined to the thin adapter step (B.2.2).
- No `@nuclear/shared-types` change; the compiler consumes the ADR-006 union.
- Residency availability, geometry compatibility and provenance coherence are
  adapter-level (browser) checks and must remain fail-closed there.

## Conditions That Might Warrant a Revision

- If additional Cornerstone built-in colormaps are ratified, extend the
  allowlist explicitly with tests.
- If `multi-layer` gains non-PET transfer semantics, model them explicitly
  rather than reusing the PET path.
