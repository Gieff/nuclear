# Phase 5 — Figure Engine: Editorial Composition & Publication Export

## Objective

Deliver `@nuclear/figure-engine`: the headless editorial composition layer that
turns reproducible medical views into a publication figure and orchestrates
export, without owning medical pixels, a GPU context or any UI.

```text
PreparedView[] + ComposerViewInstance + Panel states + FigureAnnotations
  -> figure-engine
     -> figure document model (sheet mm, panels, annotations, typography)
     -> PanelFramingState  : Viewport Space  -> Panel Content Space
     -> PanelLayoutState   : Panel Content Space -> Figure Sheet Space (mm)
     -> PublicationRenderRequest (fail-closed availability)
     -> publication render orchestration through a caller-supplied port
     -> TIFF / PNG flattened raster   OR   hybrid vector PDF
```

“Headless” here means **no product UI owns the behaviour** and no React/DOM
chrome is introduced. The figure engine is pure composition, physical geometry,
validation and export orchestration; it never renders medical data itself and
never manages a WebGL context.

## Phase Entry Conditions

Phase 4 is closed (P4.0–P4.8, plus correctives). Phase 5 may start from that
baseline when:

1. All Phase 4 gates were green on the closure commit (`npm run typecheck`,
   `npm test`, `npm run build`, Python tests/mypy, docs).
2. The Phase 1 figure contracts in `packages/shared-types/src/figure.ts` are
   frozen and independently validated by `tests/contracts/figure-validators.ts`
   (the test-side oracle): `PanelFramingState`, `PanelLayoutState`,
   `PanelDecorationState`, `ComposerViewInstance`, `AnnotationAnchor`,
   `FigureAnnotation`, `ComposerPanel`, `FigureSheet`,
   `TemporaryRenderTargetSpec`, `PublicationOutputSpec`,
   `PublicationPanelInput`, `PublicationRenderRequest`.
3. The Phase 3 temporary high-resolution `RenderTarget` capability exists
   (`packages/medical-engine/src/view-application/render-target.ts`,
   ADR-009) and must be consumed, never re-implemented.
4. `@nuclear/figure-engine` remains within its permitted dependency matrix:
   `shared-types`, `rendering-presets`, `project-model`, `view-engine` — and
   **not** `medical-engine` (Rule 02). Medical rendering reaches the figure
   engine only through a port supplied by the composition root.
5. `P4.4b` (inter-study link propagation) may be running **in parallel** in
   `view-engine`/`medical-engine`; Phase 5 must not modify `shared-types`,
   `view-engine`, `medical-engine`, ADR-012 or the Phase 4 documents, and must
   not depend on P4.4b.

## In Scope

- Figure document model operations over the frozen contracts: deterministic
  panel ordering, sheet containment, framing/layout invariants, annotation
  anchor discipline.
- The publication coordinate chain, pure and invertible where the semantics are
  ratified:
  `Patient Space -> ... -> Viewport Space -> Panel Content Space -> Figure
  Sheet Space (mm)`.
- Physical publication dimensioning: panel content aperture and whole `Figure
  Sheet` in mm, converted to raster pixels from the requested DPI.
- `PublicationRenderRequest` assembly with the fail-closed availability policy
  of architecture §26.1/§30.2.
- Publication render orchestration through a caller-supplied **renderer port**
  that consumes the same `MedicalViewState`/presets; the figure engine composes
  the returned high-resolution medical rasters with editorial vector/raster
  layers.
- TIFF/PNG flattened raster composition and hybrid vector PDF emission behind
  **encoder ports**; the medical panel is a high-resolution raster, while
  typography, panel letters, badges, scalebars and vector annotations remain
  native PDF vector primitives in Figure Sheet mm.
- Output provenance: dimensions, DPI, colour profile, renderer version.

## Explicitly Excluded

- Product UI, React, Electron shell, DOM chrome, mouse/tool interaction and
  application workflow (Fase 6–7).
- Any second medical renderer, shader, WebGL context, live canvas or GPU
  lifecycle. Cornerstone3D remains the only medical renderer (`medical-engine`).
- Scientific algorithms (resampling, registration, SUVbw) and DICOM parsing.
- Screenshot upscaling; a below-density medical raster must never be enlarged
  to meet the publication figure.
- Silent fallbacks for `missing`, `mismatch` or `offline-cached` sources.
- Adding an external PDF/TIFF/PNG encoding dependency without a dedicated ADR
  and explicit user sign-off.

## Architectural Invariants

1. **UI-agnostic and DOM-free.** `figure-engine` imports no React, no DOM and
   no `@cornerstonejs/*`. Package graph stays acyclic per Rule 02.
2. **Physical mm is primary.** Sheet, panel and content geometry are expressed
   in millimetres; screen pixels are never a persisted anchor or a source of
   truth.
3. **Same rendering path, different physical canvas.** Publication medical
   rasters are produced by the same medical renderer/state/presets as the live
   viewport, through a port; no second renderer and no preview upscaling.
4. **No live-canvas mutation.** The publication target is temporary and
   `never-resize-live-canvas` (ADR-009). Export must not change the interactive
   `CameraState`, aspect ratio or viewport size.
5. **Fail-closed availability.** `missing`, `mismatch` and `offline-cached`
   block live publication-grade rendering unless an explicit offline-preview
   policy with a matching render-state hash and fingerprint set is requested;
   a cached preview is never interpolated or presented as a live medical render.
6. **Vectors stay vectors in PDF.** Only the medical panel is a raster; text,
   letters, badges, scalebars and annotations are emitted as native vector
   primitives in sheet mm.
7. **No invented geometry.** Any under-specified transform (for example a
   rotation origin or the exact framing arithmetic) is refused or resolved by
   an ADR before implementation; a plausible-looking default is never used.
8. **Determinism.** Identical inputs produce a byte-stable composition plan:
   stable ordering, no wall-clock or environment input in geometry.
9. **No duplicated sources of truth.** The mm↔pixel formula is one ratified
   formula implemented in `medical-engine` for the temporary `RenderTarget`
   (ADR-009) and in `figure-engine` for editorial dimensioning (the package
   graph forbids a figure→medical import). ADR-014 ratifies this co-ownership
   and mandates a cross-package equivalence test.

## Delivery Slices

| Slice | Owner | Deliverable | Acceptance evidence |
| --- | --- | --- | --- |
| P5.0 | orchestrator | Baseline audit, this plan, runbook and ADR-014 | Entry state recorded; boundary decisions and open semantics documented |
| P5.1 | engine engineer | Publication physical units + panel content raster dimensioning + sheet containment + deterministic panel ordering | Pure Node tests: exact mm↔px at 300/600 DPI, equivalence with the ADR-009 formula and the Fase-1 oracle, typed refusals for non-physical input and non-zero rotation, stable ordering |
| P5.2 | engine engineer | `PublicationRenderRequest` assembly with fail-closed availability | Positive live and explicit offline-preview cases; `missing`/`mismatch`/fingerprint-mismatch refusals; result accepted by the Fase-1 contract oracle |
| P5.3 | engine engineer | Framing/layout transform set (Viewport ↔ Panel Content ↔ Sheet), invertible where required. **READY — ADR-014 OD-1/OD-2/OD-3 ratified 2026-09-23.** | Reference-point and round-trip tests; OD-1 alignment/crop cases; OD-2 transform (medical rotation still refused); file-size gate |
| P5.4 | engine engineer | Annotation visibility policy (OD-4) + patient projection (OD-5 ratified 2026-09-23, A/A/A). **COMPLETE.** | OD-4 policy cases; OD-5 plane/distance cases; full LPS→sheet chain; fail-closed refusals (non-unit normal, non-affine matrix, invalid viewport, malformed anchor) |
| P5.5 | engine engineer | Publication renderer port + orchestration (consume the medical `RenderTarget` capability; no Cornerstone import) | Port-contract tests; real-harness evidence for a live panel; fail-closed on unavailable source |
| P5.6 | engine engineer | TIFF/PNG raster flatten composition via an encoder port | Deterministic composition against a curated fixture; encoder ADR ratified first |
| P5.7 | engine engineer | Hybrid vector PDF emission via an encoder port | Vector-preservation assertions (text/annotations native, medical panel raster); encoder ADR ratified first |
| P5.8 | reviewer + QA | Independent phase review, gates and final handover | Reviewer/QA verdicts, configured gates and the eight-point phase report recorded |

Dependency order: P5.2 → P5.1; P5.3 → P5.1; P5.4 → P5.3; P5.5 → P5.2;
P5.6 → P5.5; P5.7 → P5.6. Do not begin a later slice before the predecessor’s
review and QA evidence is recorded.

**ADR gate (binding).** ADR-014 was amended and OD-1–OD-4 are **ratified
(2026-09-23)**, so P5.3 may proceed. P5.4 must follow the P5.3 transform tests
and must implement the OD-4 terms exactly (no fade band at
`planeToleranceMm = 0`; `fadeBandMm = planeToleranceMm`; `loading`/`offline-
cached`/`missing`/`mismatch` hidden fail-closed). Any behaviour not covered by
the amendment remains fail-closed and must not be invented.

**Resolved — OD-5 ratified (2026-09-23) and implemented.** The patient
projection was blocked because the displayed-plane definition and the content
semantics of `CoordinateTransformSet.patientToViewPlane` / `viewPlaneToViewport`
were unratified. OD-5 (A/A/A) now ratifies them: the plane is
`referenceLocation + sliceOffsetMm · viewPlaneNormal`; the out-of-plane distance
is the physical `dot(anchorLps − planePoint, viewPlaneNormal)`; the authored
row-major transforms are **consumed, never derived** (their physical derivation
stays with `view-engine`/`medical-engine`). `figure-engine` performs only
algebraic application and fails closed on non-finite/non-affine matrices, an
invalid viewport size, a non-unit normal or malformed framing/layout.

## Fixture and Test Policy

- All figure-engine tests are **pure Node tests** under `tests/figure-engine/`
  (no browser, no DOM). Composition/encoding slices may later use the controlled
  renderer harness under `tests/rendering/`.
- The curated editorial fixture is the Fase-1
  `tests/fixtures/figure-contracts.fixture.ts` (`FigureSheet` `180 x 120 mm`,
  `PanelFramingState.contentSizeMm` `80 x 80 mm`, panel position `(20, 20) mm`,
  rotation `0`), reused rather than duplicated.
- Declared tolerance for physical dimensioning is **exact integer pixels**
  (round half-up); there is no image/pixel tolerance gate in Phase 5 until a
  raster composition slice lands, where it is `NOT YET APPLICABLE` until then.
- Every slice includes negative/fail-closed cases; a missing fixture or runner
  is `BLOCKED` or `NOT YET APPLICABLE`, never PASS.

## Completion Gates

| Gate | Required Phase 5 evidence |
| --- | --- |
| AgentLog | Eight-point handover for every P5 slice in `docs/agentlog/phase-5.md` |
| Physical geometry | mm↔px exactness at 300/600 DPI, sheet containment and deterministic ordering fail-closed |
| Publication assembly | Fail-closed availability and offline-preview provenance; result accepted by the Fase-1 contract oracle |
| No upscale | Target pixel dimensions derived from mm+DPI; below-density input refused |
| Vector PDF | Text/annotations emitted as native vectors; medical panel raster (P5.7) |
| Boundary | No UI/React/DOM/Cornerstone import, no `medical-engine` runtime import; package graph acyclic; Rule 02 file-size limit respected |
| Quality | Typecheck, Node tests, configured Python tests, build and source-integrity report actual results |
| Review | `nuclear-reviewer` and `nuclear-qa` independently inspect the Phase 5 diff and evidence before closure |

## Stop Conditions

Stop the active slice as `BLOCKED` rather than guessing when:

- a framing/layout transform semantic is unspecified (for example rotation
  origin or `contentScale` application) and an ADR resolution does not exist;
- a PDF/TIFF/PNG encoder library would have to be added without an ADR and user
  sign-off;
- publication rendering would require `figure-engine` to own a WebGL
  context/canvas or import `@cornerstonejs/*`;
- a frozen `shared-types` contract must change (requires an ADR, validator and
  fixture, and must not collide with the parallel P4.4b work);
- the medical `RenderTarget` capability cannot be consumed through a port
  without violating package ownership.

## Exact Next Step

P5.0–P5.4 are delivered and accepted (OD-5 ratified and implemented).
**Implement P5.5** in `@nuclear/figure-engine` + its integration seam:
the publication renderer port (consume the medical `RenderTarget` capability;
`figure-engine` never imports `@cornerstonejs/*` or owns a WebGL context) and
the orchestration that turns a live `PublicationRenderRequest` into one
high-resolution medical raster per panel.

```text
P5.5 (READY after P5.2)  — publication renderer port + orchestration
```
