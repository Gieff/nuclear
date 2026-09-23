# Phase 5 — OpenCode Orchestration Runbook

> **Start here.** Phase 5 delivers `@nuclear/figure-engine` on the closed
> Phase 4 baseline. A separate agent may be implementing **P4.4b** in
> `view-engine`/`medical-engine` in parallel: Phase 5 must not edit
> `shared-types`, `view-engine`, `medical-engine`, ADR-012 or the Phase 4
> documents, and must not depend on P4.4b.

## Start Command

Run one bounded slice at a time:

```text
/phase 5 P5.1: implement publication physical units and panel raster dimensioning in @nuclear/figure-engine (pure Node; no UI/React/DOM/Cornerstone/medical-engine runtime import), with exact mm↔px tests, equivalence to the ADR-009 formula, sheet containment and deterministic panel ordering.
```

Before delegation, the orchestrator must read:

- `docs/plans/PHASE_5_FIGURE_ENGINE_PLAN.md`;
- `docs/NUCLEAR_ARCHITECTURE_V3.md` §12.1, §21–§26, §29–§31 (coordinate chain,
  Composer panel/instance, Edit Scope, rendering, export);
- `docs/PROJECT_VADEMECUM.md` §4.1 (figure-engine ownership, acyclic graph,
  publication rendering) and Workstream H/L (figure engine, export);
- `docs/decisions/ADR-014-figure-engine-publication-composition.md`;
- `docs/decisions/ADR-009-temporary-high-resolution-render-target.md`;
- the frozen Phase 1 figure contracts in `packages/shared-types/src/figure.ts`
  and their oracle in `tests/contracts/figure-validators.ts`;
- the curated fixture `tests/fixtures/figure-contracts.fixture.ts`.

## Delegation Sequence

1. The orchestrator validates the exact P5.x slice and its entry conditions.
   It must not delegate all of Phase 5 in one request.
2. `nuclear-engine-engineer` implements exactly the bounded figure-engine work
   of that slice. It must not stage, commit or push.
3. `nuclear-reviewer` performs a read-only review against this plan, the
   architecture sections, the package graph and Rule 02 limits. It reports
   PASS, CONCERNS or REJECT with concrete evidence.
4. `nuclear-qa` runs the configured gates and the slice acceptance cases. It
   reports PASS, FAIL, BLOCKED or NOT YET APPLICABLE, never a fabricated pass
   and never a vacuous zero-test run.
5. The orchestrator resolves every REJECT/FAIL, examines the final diff and
   records the eight-point handover in `docs/agentlog/phase-5.md`.
6. Only after every applicable gate is green may the orchestrator make a
   selective atomic local commit. Push remains user-authorized only.

`nuclear-scientific-engineer` is used only if a Phase 5 slice is genuinely
blocked on a new Python worker operation; it must never duplicate geometry,
registration or SUVbw science in figure-engine.

## Required Brief Fields

Every delegation brief must include:

1. exact P5.x objective, explicit exclusions and stop condition;
2. owner package and an allowlist of editable paths;
3. authoritative contracts, architecture sections and ADR-014 clauses;
4. whether the slice is pure Node and the exact test command;
5. fixture/evidence provenance and the exact expected result, or an explicit
   `NOT YET APPLICABLE` statement;
6. positive and fail-closed negative cases;
7. all commands to execute;
8. no staging, commit, push, UI, React, DOM, Cornerstone, `shared-types`,
   `view-engine` or `medical-engine` runtime changes.

## Slice-specific Constraints

### P5.0 — Baseline, Plan, Runbook and ADR-014

- Baseline audit and boundary decisions only; no production behaviour.

### P5.1 — Publication Physical Units and Panel Dimensioning

- Owner `@nuclear/figure-engine` only; pure Node; ≤300-line source files.
- The ratified formula is `pixels = round-half-up(mm / 25.4 * dpi)`. It must be
  **exactly equivalent** to `medical-engine`’s
  `computeRenderTargetPixelDimensions` and the Fase-1 oracle
  `expectedPixels`; a cross-package equivalence test guards divergence.
- Panel content raster dimensions come from `PanelFramingState.contentSizeMm`
  at the requested DPI. `contentScale` scales the medical content *inside* the
  aperture and must not silently change the aperture pixel size.
- Sheet containment is meaningful only for `rotationDeg === 0`; a non-zero
  rotation is a typed refusal until ADR-014 resolves the rotation origin.
- Non-finite / non-positive / non-integer physical input is refused; nothing is
  clamped, defaulted or inferred.
- Suggested paths: `packages/figure-engine/src/publication/{errors,units,
  panel-raster,layout}.ts`, `tests/figure-engine/*.test.ts`.

### P5.2 — PublicationRequest Assembly

- Build a valid `PublicationRenderRequest` from a `FigureSheet`, per-panel
  `PreparedView` inputs and requested output; do not mutate the sheet.
- Resolve `renderMode`/`output` from availability only under the declared
  `availabilityPolicy`; `online` panels are `live-medical`; `offline-cached`
  panels require an exact render-state-hash and fingerprint-set match and an
  explicit `allow-offline-preview`. `missing`/`mismatch` always refuse.
- The result must be accepted by the Fase-1 `isPublicationRenderRequest` oracle.

### P5.3 — Framing/Layout Transforms (READY — OD-1/OD-2/OD-3 ratified 2026-09-23)

- Implement exactly the ratified ADR-014 amendment: OD-1 normalized crop with
  validation, `scaledSize = contentSizeMm × contentScale`, the five `alignment`
  offsets, `contentOffsetMm`, invertible; `overflow` is a clip policy, not part
  of the affine map. OD-2 rotation about the panel center, clockwise in
  `y-down`; **`rotationDeg !== 0` stays a typed refusal for medical panels**
  (the contract cannot yet distinguish editorial vs medical rotation).
- Any transform must be pure, invertible where required and expressed in
  physical units.

### P5.4 — Annotation Visibility Policy and Patient Projection (COMPLETE — OD-4/OD-5 ratified 2026-09-23)

- Delivered: the OD-4 visibility/opacity policy and the OD-5 patient
  projection (`projectPatientAnnotation`). The projection uses the physical LPS
  plane (`referenceLocation + sliceOffsetMm · viewPlaneNormal`) for the
  out-of-plane distance and **applies** the authored row-major transforms
  (`patientToViewPlane` → `viewPlaneToViewport` → normalize by `viewportSizePx`
  → OD-1 → OD-2); it derives no transform.
- Fail-closed: non-unit `viewPlaneNormal`, non-finite/non-affine matrix,
  invalid viewport size, malformed anchor, or any non-`online` availability
  (hidden, no sheet point) is a typed refusal/outcome.
- Patient-anchored annotations keep their LPS anchor; panel/sheet-anchored
  editorial objects never participate in the medical transform. Screen pixels
  are never persisted.

### P5.5a — Publication Renderer Port (COMPLETE)

- `figure-engine` defines the port; the composition root supplies an
  implementation that consumes the medical `MedicalViewState` and the ADR-009
  temporary `RenderTarget` capability. `figure-engine` must not import
  `@cornerstonejs/*` or `medical-engine`.
- `renderLivePublication` derives the per-panel temporary target from the panel
  content aperture × request DPI, renders sequentially through the port, and
  fails closed on a non-live request, a non-online source, a panel/instance
  mismatch, a port failure or a malformed/short raster. A below-required-density
  raster is refused, never upscaled.

### P5.5b — Real-Harness Adapter (COMPLETE)

- The controlled browser harness now bundles `fixtures/publication-entry.ts`,
  which wires a `PublicationRendererPort` implementation to the real
  `captureTemporaryRenderTarget` and drives the full `renderLivePublication`
  orchestration. It asserts a panel-aperture capture (80 mm @ 600 DPI →
  1890×1890 with the native byte length), live-canvas invariance, temporary-
  target disposal, and fail-closed on an unavailable source
  (`FIGURE_PUBLICATION_RENDER_UNAVAILABLE`).
- The short-raster `FIGURE_PUBLICATION_RASTER_INVALID` refusal is asserted in
  the pure fake-port suite (`tests/figure-engine/publication-render.test.ts`):
  the real capture always returns the exact physical dimensions, so a short
  raster can only be synthesised through a fake port. The browser evidence
  covers the real capture path; the browser-side short-raster case is
  intentionally omitted rather than fabricated.
- If the renderer harness is unavailable in an environment (e.g. `listen EPERM`
  sandbox), report P5.5b `BLOCKED` there rather than PASS.

### P5.6 / P5.7 — Raster and PDF Encoders (ADR-015 Accepted — Track 1)

- **ADR-015** (`docs/decisions/ADR-015-export-encoder-pipeline.md`) is
  **Accepted**: Track 1 (minimal PNG/TIFF writers over `node:zlib` + `pdf-lib`),
  OD-6a…OD-6g ratified (sRGB declared, no ICC; composition-root adapter; PDF
  fonts = embedded permissive open-source subset, Inter).
- `figure-engine` owns the `EncoderPort` contract and the **pure** sheet
  compositor; the concrete encoder is a composition-root-shaped adapter (OD-6d)
  and, until `apps/desktop` exists, lives in test infrastructure. The
  `figure-engine` barrel must stay free of `node:zlib`/DOM so it remains
  browser-safe.
- Compose from already-produced layers; never rasterize the whole page for the
  hybrid PDF. The medical panel is the P5.5 high-resolution raster.
- **No resampling**: a layer whose raster dimensions differ from its physical
  destination at the plan DPI is refused, never upscaled/downscaled.
- An annotation whose resolved opacity is `0` — e.g. the OD-4 fade endpoint at
  exactly `2 × planeToleranceMm` — must be emitted as nothing, never as a
  zero-opacity primitive.
- Determinism is a gate: encoding the same plan twice must produce identical
  bytes (same environment), and the encoder name/version must be recorded in
  provenance.
- Editorial **text/vector rasterization into the flattened PNG/TIFF is a
  follow-up sub-slice** requiring a font/vector-rasterizer decision; P5.6
  delivers the compositor, the port and the raster writers.
- The **figure-sheet plan builder** is delivered
  (`buildPublicationCompositionPlan`): it maps `FigureSheet` +
  `LayoutState`/`FramingState` + the P5.5 rasters into a
  `PublicationCompositionPlan`. It is fail-closed where a semantic is not yet
  ratified: the panel **content aperture** must equal the panel size
  (`framing.contentSizeMm === layout.sizeMm`), non-zero rotation is refused, and
  a raster whose dimensions differ from its physical aperture is refused.
- The `contentSizeMm === sizeMm` requirement is a **tracked open decision**, not
  a permanent contract: aperture-inside-panel placement is not yet ratified, so
  the builder refuses rather than inventing an offset. Revisit when panels need
  an opening smaller than their sheet rectangle (with pixel-exact `pHYs`/`XResolution` provenance).
- Still a follow-up sub-slice: editorial **text/vector rasterization** into the
  flattened PNG/TIFF (needs a font/vector-rasterizer decision).
- **P5.7 delivered (COMPLETE).** The hybrid PDF path is behind the same
  `EncoderPort` (`encodePdf`) with a dedicated pure `PublicationPdfRequest`
  (`pdf-units.ts`, `pdf-document.ts`, `pdf-document-validation.ts`) and a
  reference `pdf-lib` + embedded Inter adapter in `tests/export/fixtures/`
  (OD-6d). Panel rasters become image XObjects at their exact physical rect;
  caller-supplied text/line/rect are native PDF primitives with the embedded
  font, never rasterized; the mm↔pt and y-down→PDF bottom-left transforms are
  explicit and exactly tested; metadata and the trailer `/ID` are deterministic
  (OD-6f) with an explicit `/Producer`.
- **Tracked follow-up (c):** mapping `FigureSheet` panel letters, captions,
  decoration borders, scalebars, measurement ticks and annotation kinds into
  `PublicationVectorLayer`s is **not** delivered by P5.7 (their editorial/geometry
  semantics are not yet ratified). The P5.7 "Vector PDF" gate therefore covers
  the native-vector **emission mechanism**, not yet FigureSheet content; do not
  claim otherwise in the phase handover.

## Required Gate Commands

At minimum, each applicable slice runs:

```text
npm run typecheck
npm test
npm run build
npm run test:python
npm run typecheck:python
```

Run `npm run docs` at P5.8. A missing runner or fixture is reported
`BLOCKED`/`NOT YET APPLICABLE`, never PASS.

## Final Phase Handover

P5.8 appends the final eight-point report to `docs/agentlog/phase-5.md` and
records: runtime/package facts, geometry/assembly/render/export evidence,
remaining risks, reviewer/QA verdicts and the Phase 6 entry conditions. Do not
promote the changelog or create a tag unless the user explicitly requests a
release.
