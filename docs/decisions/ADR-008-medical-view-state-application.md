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

## Addendum — P3.4-B.2.1.1 (per-asset PET binding map)

A `MedicalViewState.composition` may carry more than one PET overlay
(`FusionCompositionState.layers`), so one view-level binding is unsound: it
would silently apply one asset's `suvFactor` to another asset's overlay.

- `ViewApplicationInput.petBindings` is therefore a **required**
  `ReadonlyMap<AssetId, QuantitativePetBinding>`. Every PET layer resolves its
  binding by its own `binding.assetId`; a layer with no entry is refused with
  `VIEW_PET_BINDING_REQUIRED` naming that asset. There is **no cross-asset
  fallback** — the compiler never substitutes another asset's binding, and it
  still never derives a factor from `asset.metadata`.
- A compiled plan is per-layer: each PET overlay's `voiRange`, overall opacity
  (`getFusionOpacity(blendSlider)`) and `opacityMapping`
  (`getPETOpacityMapping`) are computed independently from that overlay's own
  binding, transfer and declared range.

### Scope of the current pure plan

The pure compiler currently covers **layer properties and projection only**.
The contract requires the whole `MedicalViewState` to be semantically applied,
and three state blocks are not yet represented in `ViewApplicationPlan`:

- `SpatialState`
- `CameraState`
- `CoordinateTransformSet`

These must be **applied or explicitly refused by P3.4-B.2.2**; they must not be
silently dropped. In particular, `CoordinateTransformSet` is the explicit
coordinate-space bridge (patient LPS mm → view-plane mm → viewport render
pixels), and `CameraState.panMm`/`focalPointMm` are measured in view-plane
millimetres, never screen pixels.

*(The scope note above is superseded by the P3.4-B.2.2.1 addendum below, which
makes the disposition of all three blocks explicit in the pure plan.)*

## Addendum — P3.4-B.2.2.1 (spatial/transform carrying and camera disposition)

The pure plan now explicitly represents all three previously-missing state
blocks. `SpatialState` and `CoordinateTransformSet` are carried verbatim and
`CameraState` is applied only when neutral, otherwise refused as a typed,
deliberate decision.

| State | Disposition in the pure plan |
| --- | --- |
| `SpatialState` | **Carried.** `frameOfReferenceUID`, `orientation` (DICOM IOP) and `patientPosition` (when present), plus `viewPlaneNormal`, `viewUp`, `referenceLocation` and `sliceOffsetMm`, are copied verbatim into `ViewSpatialApplication` (all arrays by reference; no normalization, no cross product, no derivation). Slice positioning is not mapped; the browser adapter applies or refuses it. |
| `CameraState` | **Applied only when neutral, otherwise refused.** Neutral is `{ zoom: 1, panMm: [0, 0], rotationDeg: 0, focalPointMm: [0, 0], fitMode: 'manual' }`, compared numerically (never by reference). Any other camera raises the typed `ViewApplicationError(VIEW_CAMERA_UNSUPPORTED)` whose message names the offending field(s) and states that faithful camera mapping is not yet implemented. `panMm`/`focalPointMm` remain view-plane millimetres, never screen pixels. |
| `CoordinateTransformSet` | **Carried.** `patientToViewPlane`, `viewPlaneToViewport` and `viewportSizePx` are copied verbatim into `ViewTransformsApplication` for the adapter to validate against the real viewport. The compiler never composes or re-derives them. |

The camera refusal is evaluated before any layer is compiled, so an unsupported
camera cannot be masked by a later volume/binding or projection refusal. No
camera or transform semantics are invented, and no block is silently dropped.

## Addendum — P3.4-B.2.2.1.1 (spatial identity carried and geometry validation)

**Correction.** The P3.4-B.2.2.1 addendum above claimed that all three state
blocks were represented, but the `SpatialState` row carried only
`viewPlaneNormal`/`viewUp`/`referenceLocation`/`sliceOffsetMm` and stated that
`frameOfReferenceUID`, `orientation` and `patientPosition` were "consumed by
contract validation and view-link compatibility (ADR-006), not carried into the
renderer apply step". That was wrong: without the frame identity the adapter
could not run the mandatory fail-closed co-registration check. The identity
fields are now carried verbatim in `ViewSpatialApplication`:

| Field | Source | Carried as |
| --- | --- | --- |
| `frameOfReferenceUID` | `SpatialState.frameOfReferenceUID` | verbatim string |
| `orientation` | `SpatialState.orientation` (DICOM IOP) | verbatim array, 6 values |
| `patientPosition` | `SpatialState.patientPosition` | verbatim when present, key omitted otherwise |

**Pure geometry validation (`view-application/geometry.ts`).** The Node-safe
adapter contract is exported through the `view-application` barrel. It imports
no Cornerstone and performs no floating-point library call (P2.5 integrity
gate); parallelism is a one-sided dot-product comparison, not an absolute
value.

`validateLayerGeometry(plan, evidence)` checks every plan layer against the
adapter's resident-volume evidence (keyed by `assetId`) and refuses fail-closed
with a typed `ViewApplicationError`:

1. No resident evidence for the layer's `assetId` → `VIEW_VOLUME_NOT_RESIDENT`.
2. Resident `frameOfReferenceUID` equal to `plan.spatial.frameOfReferenceUID`
   → co-referenced, accepted without a transform. This is the authoritative
   co-reference signal, so a different native acquisition plane in the same
   frame (MPR/reformat) is legitimate and is **not** an orientation refusal.
3. Otherwise, a `SpatialTransform` for that `assetId` is mandatory:
   a missing one → `VIEW_FOR_MISMATCH`; one that is not
   `validity.isValid === true`, is not `units === 'mm'`, or whose
   `sourceFrameOfReferenceUID`/`targetFrameOfReferenceUID` do not match the
   volume/view frames in either direction → `VIEW_TRANSFORM_INVALID`.
4. For that transformed layer, the resident volume's IOP row and column must
   each be directionally aligned with `plan.spatial.orientation` (dot product
   `>= 1 - 1e-5`; a non-6-value IOP is refused) → otherwise
   `VIEW_GEOMETRY_INCOMPATIBLE`. Anti-parallel axes are not silently
   normalised, and oblique transformed reslicing is not implemented.

`validateViewportSize(transforms, actualViewportSizePx)` refuses
`VIEW_VIEWPORT_SIZE_MISMATCH` unless the compiled
`transforms.viewportSizePx` matches the mounted viewport along both axes, so a
stale patient/view-plane → pixel mapping is never applied.

New refusal codes: `VIEW_VOLUME_NOT_RESIDENT`, `VIEW_FOR_MISMATCH`,
`VIEW_GEOMETRY_INCOMPATIBLE`, `VIEW_TRANSFORM_INVALID`,
`VIEW_VIEWPORT_SIZE_MISMATCH`. The browser adapter (P3.4-B.2.2) must call these
pure validators with real residency/transform evidence before applying a plan;
the pure module cannot itself observe the GPU residency.
