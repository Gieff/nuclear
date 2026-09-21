# ADR-006: Per-Layer MedicalViewState Presentation for Fusion

## Status

Accepted

## Date

2026-09-21

## Context

`MedicalViewState` (Phase 1) carries a single `PresentationState` plus a
`CompositionState` whose `layers` are bare `DataBinding`s and whose only
per-layer value is `layerOpacity` keyed by an undeclared string. That shape
cannot express a complete PET/CT fusion without the renderer inferring
semantics:

- the PET transfer mode (`highlighted` vs `alpha`, spec §3);
- the PET gamma (spec §4);
- the interactive fusion slider `s ∈ [0, 100]` (spec §2);
- a distinct presentation for the CT underlay and the PET overlay (VOI,
  colormap, range).

Applying such a state would force `@nuclear/medical-engine` to invent missing
clinical parameters, violating the project's no-invented-behaviour and
no-implicit-fallback rules. The fusion contract must make an incomplete fusion
**unrepresentable**, not merely discouraged.

## Decision

1. **Per-layer presentation is mandatory for composed views.** A new
   `CompositionLayer` carries its own `binding` and its own `presentation`.
   There is no view-level presentation fallback for composition layers.

2. **PET fusion transfer parameters are first-class and explicit.**
   `PetFusionTransfer` declares `transferMode` (`highlighted` | `alpha`),
   `gamma` (> 0) and `blendSlider` (`s ∈ [0, 100]`). Overall PET opacity is
   derived as `(s / 100)^0.42` (spec §2); the renderer never chooses a mode,
   gamma or slider on its own.

3. **`MedicalViewState` is a discriminated union.**
   - `SingleMedicalViewState` keeps the single authoritative `presentation` and
     a one-binding `SingleCompositionState`.
   - `ComposedMedicalViewState` has **no view-level `presentation`**; its
     `FusionCompositionState`/`MultiLayerCompositionState` layers each carry
     their own presentation. A composed view with a top-level `presentation` is
     structurally impossible.

4. **Fusion completeness is enforced by validation (fail-closed).** For a
   `fusion` composition:
   - `blend` must be explicit (`alpha`);
   - at least two layers, exactly one `base` and at least one `overlay`;
   - the `base` layer declares its window (`presentation.voi`) and MUST NOT
     declare a `fusion` transfer;
   - every `overlay` layer declares an explicit `presentation.colormapId`,
     exactly one of `presentation.voi` (transport Bq/mL) or
     `presentation.suvRange` (clinical SUVbw), never both, and a valid
     `fusion` transfer;
   - `transferMode` is one of the two modes, `gamma > 0`, `blendSlider ∈ [0,100]`.

5. **`layerOpacity` is removed.** Per-layer `presentation.opacity` is the single
   authoritative per-layer opacity; keeping both would create a second source
   of truth.

6. **The PET colormap and range stay caller-declared.** The contract requires
   them to be present for a fusion overlay but does not supply defaults, per
   ADR-005 and invariant 7.

## Consequences

- `@nuclear/medical-engine` can apply a fusion state mechanically from the
  contract (`spec §7`), without inferring any clinical parameter.
- Phase 1 view fixtures/validators are updated: `mockMedicalView` remains a
  valid single CT view; new CT/PET/fusion `MedicalViewState` fixtures bind the
  validated `mockCtAsset`/`mockPetAsset` ids with explicit provenance.
- `LayerState`/`CompositionLayer`, `PetFusionTransfer`, the composition union
  and `MedicalViewState`'s union are exported from `@nuclear/shared-types`.
- `@nuclear/view-engine` and `@nuclear/figure-engine` consume the new union;
  `PreparedView.state` remains a `MedicalViewState`.
- No Cornerstone, rendering, capture or UI change is introduced by this ADR.

## Conditions That Might Warrant a Revision

- If a future multi-layer (non-fusion) mode needs non-PET transfer semantics,
  it must be modelled explicitly rather than reusing `PetFusionTransfer`.
- If projection/MPR state becomes per-layer, the same per-layer pattern must be
  applied and ratified here.
