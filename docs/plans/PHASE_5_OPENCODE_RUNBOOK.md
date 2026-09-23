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

### P5.4 — Annotation Visibility Policy (PARTIAL — projection BLOCKED on OD-5)

- Delivered: the ratified OD-4 visibility/opacity policy with an **explicit,
  declared** out-of-plane distance (`planeToleranceMm = 0` ⇒ no fade band;
  `fadeBandMm = planeToleranceMm`, linear `1 → 0` over `(tol, 2·tol]`, hidden
  beyond; distances in mm; `loading` behaves like
  `offline-cached`/`missing`/`mismatch` — hidden fail-closed).
- **Blocked:** the `LPS → view plane → viewport` projection requires an
  ADR-014 follow-up (OD-5a/b/c in the plan) defining the displayed-plane
  relation, the out-of-plane distance source and whether
  `patientToViewPlane`/`viewPlaneToViewport` are consumed as authored or
  derived. Do not guess them; keep the projection fail-closed until ratified.
- Patient-anchored annotations keep their LPS anchor; panel/sheet-anchored
  editorial objects never participate in the medical transform. Screen pixels
  are never persisted.

### P5.5 — Publication Renderer Port

- `figure-engine` defines a port; the composition root supplies an
  implementation that consumes the medical `MedicalViewState` and the ADR-009
  temporary `RenderTarget` capability. `figure-engine` must not import
  `@cornerstonejs/*` or `medical-engine`.
- A below-required-density raster is refused, never upscaled.

### P5.6 / P5.7 — Raster and PDF Encoders

- Do not add an encoder dependency before its ADR is ratified with user
  sign-off. Compose from already-produced layers; never rasterize the whole
  page for the hybrid PDF.
- An annotation whose resolved opacity is `0` — e.g. the OD-4 fade endpoint at
  exactly `2 × planeToleranceMm` — must be emitted as nothing, never as a
  zero-opacity primitive.

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
