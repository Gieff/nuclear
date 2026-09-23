# ADR-014: Figure Engine Boundary and Publication Composition

## Status

Accepted (boundary decisions D1–D5). **Amendment 2026-09-23: OD-1–OD-4 are
ratified** by the phase owner (OD-1 A refined, OD-2 A with medical rotation
still fail-closed, OD-3 A, OD-4 A refined — see “Ratified Amendment”). The
dependent slices (P5.3, P5.4) may proceed under those terms.

## Date

2026-09-23

## Context

Phase 4 closed the view engine and the persistent-surface model. Phase 5 must
deliver `@nuclear/figure-engine`: editorial composition (sheet in mm, panels,
framing/layout, annotations, typography, labels) and publication export
(high-resolution medical rasters composed into TIFF/PNG and a hybrid vector
PDF). The architecture places the figure engine between the view engine and the
UI:

```text
view-engine -> figure-engine -> ui -> apps/desktop
```

The ownership matrix (Vademecum §4.1, Rule 02) permits `figure-engine` to depend
on `shared-types`, `rendering-presets`, `project-model` and `view-engine` — and
**not** on `medical-engine`. Yet the publication pipeline must use the same
medical renderer, the same `MedicalViewState`, and the ADR-009 temporary
high-resolution `RenderTarget` capability that physically lives in
`medical-engine`. In addition, the ratified `pixels = round(mm / 25.4 * dpi)`
conversion is implemented in `medical-engine`’s
`computeRenderTargetPixelDimensions` (ADR-009) and mirrored in the Fase-1
contract oracle (`tests/contracts/figure-validators.ts`), while Phase 5 needs
the same conversion for editorial aperture and sheet dimensioning. This ADR
ratifies these boundaries so Phase 5 does not invent them silently.

## Decision

### D1 — Editorial composition is owned by `figure-engine`; no second renderer

`figure-engine` owns the figure document, panel framing/layout, typography,
label/badge placement, annotation projection and the publication composition
plan. It never renders medical data: it obtains publication medical rasters
from a caller-supplied **renderer port** whose implementation reuses the
`medical-engine` renderer, `MedicalViewState` and presets. `figure-engine`
imports no `@cornerstonejs/*`, owns no WebGL context, canvas or GPU lifecycle,
and does not become a lifecycle owner of a viewport.

### D2 — One physical conversion formula, two consumers, one equivalence test

The ratified publication conversion is:

```text
pixels = round-half-up(mm / 25.4 * dpi)
```

`MM_PER_INCH = 25.4` is the single physical constant. Because the acyclic
package graph forbids a `figure-engine` → `medical-engine` import, the formula
is implemented in **both** `medical-engine` (for the temporary `RenderTarget`
spec, ADR-009) and `figure-engine` (for editorial aperture/sheet dimensioning).
This is a deliberate, ratified co-implementation — **not** a second source of
truth: ADR-009’s formula is normative, and a cross-package **equivalence test**
over a curated size/DPI matrix must assert that the two implementations and the
Fase-1 oracle agree exactly. Neither implementation may change without updating
the other and the equivalence test. `figure-engine` must not otherwise duplicate
medical-engine geometry or rendering logic. Separately, and for the same
package-graph reason (the Fase-1 oracle is test-side only), `figure-engine`
mirrors the oracle's `isSourceFingerprint` structural rules for the fingerprints
it relies on when validating an offline preview (`fingerprint-validation.ts`).
This check is publication-scoped, is proven against the oracle by the
`tests/figure-engine/publication-request*.test.ts` suites, and does **not**
authorize a general contract validator inside `figure-engine`.

### D3 — Physical millimetres are primary; the publication target never resizes the live canvas

Sheet, panel and content geometry are expressed in millimetres; screen pixels
are never persisted. The publication target is a distinct temporary target
(`TemporaryRenderTargetSpec`, `liveCanvasPolicy: 'never-resize-live-canvas'`,
ADR-009). Export must not change the interactive `CameraState`, aspect ratio or
viewport size. A medical raster below the physical pixel requirement is
refused; it is never upscaled to satisfy the requested figure.

### D4 — Fail-closed availability

Publication assembly and rendering follow architecture §26.1/§30.2. `online`
panels render live. `offline-cached` panels may be composed only under an
explicit `allow-offline-preview` policy, only from a `CachedPreviewReference`
whose render-state hash and source-fingerprint set match the `PreparedView`,
and never by resampling. `missing` and `mismatch` block the affected live
medical render. NuClear never silently substitutes a “similar” source, updates
an expected fingerprint to fit a different source, or presents a preview as a
live medical render.

### D5 — Encoders are ports; adding an encoder dependency requires its own ADR

TIFF/PNG flattening and hybrid PDF emission sit behind **encoder ports**.
`figure-engine` composes layers and emits a portable composition plan; it does
not vendor an encoder. Adding an external PDF/TIFF/PNG library is a separate
ADR with explicit user sign-off. For the hybrid PDF, only the medical panel is a
high-resolution raster; typography, panel letters, badges, scalebars and
annotations must be emitted as native vector primitives in Figure Sheet mm. The
whole page is never rasterized merely for convenience.

## Ratified Amendment — OD-1–OD-4 (2026-09-23)

Ratified by the phase owner. These supersede the previously deferred Open
Decisions; the prior “refuse rather than invent” status is lifted for exactly
the semantics below and for nothing else.

### OD-1 — `PanelFramingState` arithmetic (ratified: A refined)

Normalized crop with explicit validation, `0 ≤ left < right ≤ 1` and
`0 ≤ top < bottom ≤ 1`:

```text
u = (x - left) / (right - left)
v = (y - top) / (bottom - top)
```

The scaled image is placed inside the content aperture and offset by alignment:

```text
scaledSize   = contentSizeMm × contentScale
panelContent = alignmentOffset(aperture, scaledSize) + contentOffsetMm + (u, v) × scaledSize
```

`alignmentOffset` uses `aperture = contentSizeMm`:

- `top-left`: `[0, 0]`
- `top-right`: `[aperture.w - scaled.w, 0]`
- `bottom-left`: `[0, aperture.h - scaled.h]`
- `bottom-right`: `[aperture.w - scaled.w, aperture.h - scaled.h]`
- `center`: half of the residual space, `[(aperture.w - scaled.w) / 2, (aperture.h - scaled.h) / 2]`

Direction: normalized Viewport Space → Panel Content Space (mm). The mapping is
invertible while `scaledSize` components are strictly positive. `overflow` is
**not** part of the affine map: it is a clip policy applied by the compositor
(`clip` limits to the content aperture, `visible` preserves external
coordinates).

### OD-2 — `PanelLayoutState` rotation (ratified: A; medical rotation still fail-closed)

Rotation origin is the **panel center**; positive angle is **clockwise in
figure-sheet `y-down` coordinates**:

```text
center = sizeMm / 2
R(θ)   = [[cos θ, -sin θ], [sin θ, cos θ]]   (θ in radians)
sheet  = positionMm + R(θ)·(panelContentPoint - center) + center
```

`rotationDeg !== 0` **continues to be refused** for panels containing medical
content. The current contract (`PanelLayoutState` / `ComposerPanel`) does not
distinguish an editorial container from a medical panel, so the medical
placement and containment APIs remain fail-closed. A future contract extension
must introduce that distinction explicitly before rotated medical panels are
permitted; this ADR does not authorize it.

### OD-3 — `contentScale` and the publication target (ratified: A)

The publication target remains the **physical aperture**:

```text
targetPixels = contentSizeMm × DPI
```

`contentScale` modifies framing/camera and crop; it does **not** change the
physical target density. Variant B (dimensioning the target from
`contentSizeMm × contentScale`) is rejected: it conflates editorial zoom with
export density and would turn the no-upscale guarantee into an improper change
of the output size.

### OD-4 — Patient-anchored annotation reprojection (ratified: A refined)

Chain: `LPS → view plane → viewport → panel content → sheet mm`, evaluated from
the resolved `ComposerViewInstance` state including applicable local overrides.

- `planeToleranceMm = 0` ⇒ **no fade band**: draw only on the exact plane,
  otherwise hide.
- For `planeToleranceMm > 0`: `fadeBandMm = planeToleranceMm`; draw when
  `|d| ≤ planeToleranceMm`, linear opacity `1 → 0` over
  `planeToleranceMm < |d| ≤ 2 × planeToleranceMm`, hide beyond.
- Distances are always in millimetres.
- `loading` behaves exactly like `offline-cached`, `missing` and `mismatch`:
  the patient annotation is hidden (fail-closed).

**Interpretation note (subject to owner confirmation).** The band above
describes `outOfPlaneBehavior: 'fade'`. The frozen contract also allows
`'hide'`; it is interpreted as a hard visibility cutoff at `planeToleranceMm`
(no fade band), and `planeToleranceMm = 0` is a hard cutoff in both behaviours.
This reading never grants more visibility than `'fade'` would, and no other
behaviour is implemented. If the owner intends `'hide'` to differ, this note
must be superseded by an amendment.

## Consequences

- Phase 5 can proceed with pure, Node-testable editorial geometry and
  publication assembly without touching `medical-engine`, `view-engine` or
  `shared-types`.
- The co-implemented conversion is guarded by an explicit equivalence test,
  preserving ADR-009 as the normative source while respecting the package graph.
- The renderer and encoder ports keep the figure engine on the same rendering
  path without owning GPU resources, and defer library choices to explicit ADRs.
- Several legitimately under-specified behaviours are refused or deferred
  instead of guessed, which may slow composition slices but preserves clinical
  correctness.

## Conditions That Might Warrant a Revision

- If a true offscreen medical target replaces the ADR-009 temporary engine, the
  renderer port contract may be edited while preserving D1–D4.
- If the package graph is ever changed to allow a `figure-engine` →
  `medical-engine` dependency, D2 should be collapsed to a single imported
  implementation and the equivalence test retired.
- If the architecture ratifies a shared pure-geometry package, D2’s
  co-implementation should move there.
