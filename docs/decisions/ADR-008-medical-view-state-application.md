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

## Addendum — P3.4-B.2.2.2 (browser volume viewport and state application)

`packages/medical-engine/src/renderer/view-application-adapter.ts` (browser-only,
exported solely from `renderer/index.ts`) applies a compiled plan to a real
Cornerstone viewport. Empirically in `@cornerstonejs/core@5.10.7` with the
default `useGenericViewport === false`, `Enums.ViewportType.ORTHOGRAPHIC`
resolves to the legacy `VolumeViewport` (`constructor.name === 'VolumeViewport'`,
`type === 'orthographic'`, all volume methods present). The adapter gained an
optional `viewportType: 'stack' | 'orthographic'` (default `'stack'`,
preserving P3.1) plus a `getViewport(): IViewport` accessor.

`applyViewApplication(adapter, input)` is fail-closed before any mutation:

1. `registerDicomPalettes()` (ADR-007).
2. `validateLayerGeometry` + `validateViewportSize`.
3. Every layer's colormap must resolve via
   `utilities.colormap.resolveColormap`, else `VIEW_COLORMAP_UNKNOWN`.
4. The carried slice must be the neutral reference (`referenceLocation` all zero
   and `sliceOffsetMm === 0`, with any `slicePosition` input likewise neutral),
   otherwise `VIEW_SLICE_POSITION_UNSUPPORTED` — faithful slice positioning is
   not implemented and is refused, never silently ignored.

It then calls `setVolumes({ volumeId })`, per-volume `setProperties` (voiRange,
colormap name/opacity/opacityMapping, invert,
`toCornerstoneInterpolationType`), `setBlendMode(Enums.BlendModes[...])`,
`setSlabThickness` (only when declared) and
`setOrientation(viewPlaneNormal, viewUp)`. The returned `AppliedViewState` is the
actual `getProperties(volumeId)` read-back plus `getBlendMode()`, the requested
orientation and `getCamera()` — the legacy `VolumeViewport` has no
`getOrientation()`, so the camera is the orientation getter that exists.

### Empirical `gray` gap (resolved in the pure compiler)

The pure compiler declares the NuClear built-in id `gray`, but the legacy
`VolumeViewport.setColormap` resolves via `utilities.colormap.resolveColormap`,
and vtk.js exposes no exact `gray` preset (only `Grayscale`/`gray_Matlab`), so a
plan carrying `gray` was unresolvable and was refused fail-closed with
`VIEW_COLORMAP_UNKNOWN`. P3.4-B.2.2.2.2 closes the gap in the pure compiler by
mapping the NuClear id to the renderer's real preset name (see the addendum
below); the controlled-harness CT positives use the fixture's persisted `gray`
id and read back `Grayscale`.

### Local-volume image loader bridge

`createLocalVolume` materialises slices as `<volumeId>_slice_<i>` (scheme
`nuclear-volume`), but Cornerstone's `createVolumeActor` default-VOI path calls
`loadAndCacheImage(..., { ignoreCache: true })`, bypassing the cache and
requiring a registered image loader. The adapter registers a loader for the
volume's own scheme that returns the already-cached slice; it fabricates no
pixel data and fails loudly on a missing slice.

New refusal codes: `VIEW_SLICE_POSITION_UNSUPPORTED`,
`VIEW_VIEWPORT_READBACK_FAILED`.

## Addendum — P3.4-B.2.2.2.2 (NuClear id → Cornerstone preset mapping)

`packages/medical-engine/src/view-application/colormap.ts` maps every declared
NuClear built-in id to the Cornerstone/vtk preset name it denotes:

```ts
const BUILTIN_VIEW_COLORMAPS: Readonly<Record<string, string>> = { gray: 'Grayscale' };
```

`resolveViewColormapName` returns the mapped preset name, so a persisted `gray`
compiles to `colormap.name === 'Grayscale'` and the browser-side
`assertColormapsResolvable` (`utilities.colormap.resolveColormap`) finds the
real vtk preset directly. No alias is registered and no LUT is derived or
resampled. An id absent from the map and not a `dicom-*` catalog id is still
refused with `VIEW_COLORMAP_UNKNOWN`; a missing id is refused as required, and
no default palette is ever substituted.

The persisted `MedicalViewState.presentation.colormapId` remains the NuClear id
`gray`; only the compiled, renderer-facing `colormap.name` is the Cornerstone
preset name. This is the same id→name pattern ADR-007 already uses for DICOM
palettes (`dicom-pet` → `PET`). It supersedes the P3.4-B.2.2.2.1 browser-side
alias and its 256-entry resampling of vtk's control points, which is deleted
along with `renderer/builtin-colormap-registration.ts`.

`applyViewApplication` registers DICOM palettes (ADR-007) and then validates
geometry, viewport size and colormap resolvability before any viewport
mutation; there is no built-in registration step.

The local-volume image-loader bridge is unchanged in behaviour and rationale:
`createLocalVolume` materialises slices as `<volumeId>_slice_<i>` (scheme
`nuclear-volume`), but Cornerstone's `createVolumeActor` default-VOI path calls
`loadAndCacheImage(..., { ignoreCache: true })`, bypassing the cache and
requiring a registered image loader. The adapter registers a loader for the
volume's own scheme that returns the already-cached slice; it fabricates no
pixel data and fails loudly on a missing slice. P3.4-B.2.2.2.1 makes that
registration once per scheme (a module-level set), removing duplicate loader
churn across repeated applies.

## Addendum — P3.4-B.2.2.2.3 (viewport-global properties, observed slab, scheme allowlist)

Three review-hardening corrections to the uncommitted P3.4-B.2.2.2 slice.

**Cornerstone applies `invert`/`interpolationType` viewport-globally.**
Verified in `@cornerstonejs/core@5.10.7`: `BaseVolumeViewport.setProperties`
compares `invert` against the viewport-global `viewportProperties.invert` and
calls `setInterpolationType(interpolationType)` with **no `volumeId`**; only
`voiRange` and `colormap` are per-volume. A plan whose layers declare divergent
`invert` or `interpolationType` therefore cannot be applied per-layer
faithfully and would silently take the last layer's value. The pure compiler now
refuses any multi-layer plan whose layers disagree, after building the layers
and before returning, with the new typed code
`VIEW_PER_LAYER_PROPERTY_UNSUPPORTED` naming the property and the conflicting
values. A single-layer plan (and a homogeneous multi-layer plan) is unaffected.

**Slab thickness is observed, not echoed.**
`AppliedViewState.slabThicknessMm` is now read from
`viewport.getSlabThickness()` when `plan.projection.slabThicknessMm` is
declared, and reported as `undefined` when it is not; it is no longer an echo of
the plan. Note that Cornerstone clamps a declared slab below 0.1 mm to
`RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS` (0.05), so the observed value is the
renderer's actual slab, not necessarily the declared one.

**The local-volume image-loader bridge is scheme-allowlisted.**
`ensureLocalVolumeImageLoader` previously derived the scheme from each volume-id
prefix and registered a loader for *any* scheme. It now serves only
`nuclear-volume`, NuClear's sole local-volume scheme, and `applyViewApplication`
refuses — before any viewport mutation and before any loader registration — a
plan layer whose `volumeId` is not a `nuclear-volume:` id, with the new typed
code `VIEW_VOLUME_SCHEME_UNSUPPORTED`. The loader remains idempotent (registered
at most once for that single scheme) and still fails loudly on a missing cached
slice. This supersedes the per-volume-scheme derivation described in the
P3.4-B.2.2.2 and P3.4-B.2.2.2.1 addenda.

New refusal codes: `VIEW_PER_LAYER_PROPERTY_UNSUPPORTED`,
`VIEW_VOLUME_SCHEME_UNSUPPORTED`.

## Addendum — P3.4-B.2.2.4 (different-FoR refusal, viewport-measured size, real cache residency)

Three corrections/hardenings before P3.4-C.

**Correction: a valid `SpatialTransform` was validated but never applied.** The
P3.4-B.2.2.1.1 addendum described a different-Frame-of-Reference layer as
accepted when a valid millimetre `SpatialTransform` bridged the frames. The
adapter then passed both volumes straight to `setVolumes`; neither Cornerstone
nor the worker applies the matrix, so an inter-study fusion would have rendered
misaligned.

**Different-Frame-of-Reference layers are refused until transform application
exists.** `validateLayerGeometry` now refuses every layer whose resident frame
differs from the view plane's frame, whether or not a transform is present:
absent transform → `VIEW_FOR_MISMATCH`; present but not
`validity.isValid === true`, not `units === 'mm'`, or not bridging the
volume/view frames in either direction → `VIEW_TRANSFORM_INVALID`; present and
valid → the new `VIEW_TRANSFORM_UNSUPPORTED`, whose message states that spatial
transform application is not implemented so the fusion would be misaligned. A
co-referenced volume (same Frame of Reference) is still accepted without a
transform, including a different native acquisition plane (MPR/reformat is
legitimate). The former transformed-layer parallelism requirement is removed:
transformed layers are refused outright. Orientation is still validated, but as
a well-formedness check on every resident volume — a
`ResidentVolumeGeometry.orientation` that is not exactly 6 finite numbers is
refused with `VIEW_GEOMETRY_INCOMPATIBLE`, so the branch is not dead. Renderer
consequence: the committed `ct-axial`/`pt-axial` fixtures have distinct
`FrameOfReferenceUID`s, so they can no longer be applied as a fusion; the former
fusion-palette/opacity positive was replaced by a `VIEW_TRANSFORM_UNSUPPORTED`
negative.

**Viewport size is read from the viewport.** `ApplyViewApplicationInput` no
longer accepts `actualViewportSizePx`. `applyViewApplication` measures the
mounted size from the adapter's own viewport element
(`element.clientWidth`/`clientHeight`), refuses a missing, non-finite,
non-integer or non-positive size with `VIEW_VIEWPORT_READBACK_FAILED`, and
passes the measured tuple to `validateViewportSize`. A caller can no longer
declare a false expected size.

**Residency is verified against the real cache.** `ViewGeometryEvidence` is
caller-supplied and may claim a volume is resident. After the pure geometry
validation and before any mutation, `assertVolumesCached` checks every
`plan.layers[*].volumeId` against Cornerstone's real cache
(`cache.getVolume(volumeId) !== undefined`) and refuses
`VIEW_VOLUME_NOT_RESIDENT` naming the volume otherwise. The browser-only guards
live in `renderer/view-application-guards.ts`, which imports
`@cornerstonejs/core` and is therefore not exported from `src/index.ts`.

New refusal code: `VIEW_TRANSFORM_UNSUPPORTED`.
