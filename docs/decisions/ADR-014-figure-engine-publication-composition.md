# ADR-014: Figure Engine Boundary and Publication Composition

## Status

Accepted (boundary decisions D1–D5). Open Decisions OD-1–OD-4 remain
**deferred** and must be resolved by a later ADR amendment before the slices
that depend on them (see “Open Decisions”).

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
medical-engine geometry or rendering logic.

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

## Open Decisions (deferred; refuse rather than invent)

These semantics are **not** ratified here. Until a later ADR amendment resolves
them, the dependent slice must fail closed or remain `NOT YET APPLICABLE`:

- **OD-1 — `PanelFramingState` arithmetic.** The exact mapping from
  `viewportCrop`/`contentScale`/`contentOffsetMm`/`alignment`/`overflow` to
  Viewport ↔ Panel Content space is not specified. P5.1 uses only the aperture
  physical size (`contentSizeMm`) and does not implement the framing transform.
- **OD-2 — `PanelLayoutState` rotation origin.** `rotationDeg` is defined
  without an origin or sign convention. Containment/overlap checks are therefore
  restricted to `rotationDeg === 0`; a non-zero rotation is a typed refusal
  until the origin is ratified.
- **OD-3 — `contentScale` application.** Whether the aperture pixel requirement
  is scaled, and how medical content maps into the aperture, is unspecified.
  P5.1 dimensions the aperture from `contentSizeMm` only.
- **OD-4 — Patient-anchored annotation reprojection.** The exact projection,
  faint/hide threshold and fade arithmetic are unspecified; P5.4 is blocked on
  this amendment.

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
