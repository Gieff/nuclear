# Phase 5 — Figure Engine & Publication Export — AgentLog

> Machine/AI tier. Raw handover reports for every Phase 5 slice. Human release
> notes are compiled separately via `/promote-changelog 5`; never copy this file
> into `CHANGELOG.md` (ADR-001).

**Active phase:** Fase 5 — Figure engine & publication export.
**Closed baseline when this phase started:** Phase 4 complete (HEAD `bedceda`);
`npm run typecheck` PASS, `npm test` 510/510 (96 suites), pytest 411, mypy 77.
**Parallel work notice:** another agent is implementing **P4.4b** in
`view-engine`/`medical-engine` in the same repository. Phase 5 is deliberately
confined to `@nuclear/figure-engine`, `tests/figure-engine/` and its own docs;
it does not modify `shared-types`, `view-engine`, `medical-engine`,
`project-model`, `rendering-presets`, ADR-012 or the Phase 4 documents, and does
not depend on P4.4b.

---

# Slice Record — P5.0 (planning) + P5.1 (publication units & panel dimensioning)

## 1. What Was Implemented

- **P5.0 — plan, runbook and boundary ADR.**
  - `docs/plans/PHASE_5_FIGURE_ENGINE_PLAN.md`: Phase 5 objective, entry
    conditions, in/out of scope, nine architectural invariants, the
    dependency-ordered slice table `P5.0 → P5.8`, the fixture/tolerance policy,
    completion gates and stop conditions.
  - `docs/plans/PHASE_5_OPENCODE_RUNBOOK.md`: orchestration sequence, required
    brief fields and per-slice constraints.
  - `docs/decisions/ADR-014-figure-engine-publication-composition.md`: Accepted
    boundary decisions D1–D5 (figure-engine owns editorial composition and the
    publication plan; no second renderer; renderer/encoder ports; physical mm
    primary; fail-closed availability) and four explicitly **deferred** Open
    Decisions OD-1–OD-4 (framing arithmetic, rotation origin, `contentScale`
    application, patient-annotation reprojection). ADR-014 resolves the apparent
    overlap with ADR-009 by ratifying a deliberate **co-implementation** of the
    single `pixels = round-half-up(mm / 25.4 * dpi)` formula (the acyclic graph
    forbids a figure→medical import), guarded by a cross-package equivalence
    test.
- **P5.1 — `@nuclear/figure-engine` publication core (pure, Node-safe).**
  - `publication/errors.ts`: `FigurePublicationError` + four typed codes
    (`FIGURE_UNITS_INVALID`, `FIGURE_ROTATION_UNSUPPORTED`,
    `FIGURE_SHEET_CONTAINMENT_INVALID`, `FIGURE_PANEL_ORDER_INVALID`).
  - `publication/units.ts`: `MM_PER_INCH = 25.4`, `mmToPixels` (half-up, refuses
    non-finite/non-positive size or DPI and overflowing/non-integer results) and
    `pixelsToMm` (continuous inverse, honestly documented as not the inverse of
    the rounded mapping).
  - `publication/panel-raster.ts`: `computePanelContentPixels` (aperture from
    `PanelFramingState.contentSizeMm`; `contentScale` deliberately does not alter
    the aperture, ADR-014 OD-3) and `computeSheetPixels` (whole sheet).
  - `publication/layout.ts`: `panelSheetRectMm`, `isPanelWithinSheet`,
    `assertPanelWithinSheet` (inclusive edges; typed refusals for a non-physical
    sheet/panel and for any `rotationDeg !== 0`, ADR-014 OD-2) and
    `orderPanelsByZ` (stable ascending z-order, frozen output, non-integer
    z-index refused).

No medical rendering, no UI, no DICOM, no scientific formula was added.

## 2. Files Changed

Created (Phase 5):
- `docs/plans/PHASE_5_FIGURE_ENGINE_PLAN.md`
- `docs/plans/PHASE_5_OPENCODE_RUNBOOK.md`
- `docs/decisions/ADR-014-figure-engine-publication-composition.md`
- `docs/agentlog/phase-5.md` (this file)
- `packages/figure-engine/src/publication/errors.ts`
- `packages/figure-engine/src/publication/units.ts`
- `packages/figure-engine/src/publication/panel-raster.ts`
- `packages/figure-engine/src/publication/layout.ts`
- `packages/figure-engine/src/publication/index.ts`
- `tests/figure-engine/publication-units.test.ts`
- `tests/figure-engine/panel-raster.test.ts`
- `tests/figure-engine/panel-layout.test.ts`

Modified (Phase 5):
- `packages/figure-engine/src/index.ts` — barrel now re-exports
  `./publication/index.js` (was `export {}`).
- `tests/contracts/figure-validators.ts` — Fase-1 oracle `expectedPixels` is now
  exported (additive; the formula is unchanged) so the P5.1 test can assert
  three-way equivalence. No validator behaviour changed.

Not modified by Phase 5: `shared-types`, `rendering-presets`, `medical-engine`,
`view-engine`, `project-model`, `ui`, `apps/*`, `python/`, `AGENTS.md`,
`CHANGELOG.md`, ADR-012 and all Phase 4 documents.

## 3. Architectural Assumptions Made (boundary adherence)

- `figure-engine` stays within the Rule 02 permitted dependency set; every new
  source file imports only type-only `@nuclear/shared-types` and local modules,
  with no React, DOM, `@cornerstonejs/*` or `medical-engine` runtime import.
- The ADR-009 mm→px formula is normative; P5.1 co-implements it in
  `figure-engine` because the package graph forbids a figure→medical import, and
  the equivalence test guarantees the two implementations and the Fase-1 oracle
  cannot diverge. No other medical geometry or rendering logic is duplicated.
- Physical millimetres are the only editorial unit; screen pixels are never
  persisted.
- Under-specified geometry is refused, not guessed: rotation is a typed refusal
  until ADR-014 OD-2 is resolved; the framing transform (OD-1), `contentScale`
  application (OD-3) and annotation reprojection (OD-4) are explicitly not
  implemented.

## 4. Tests Added & Executed

- `node --test "tests/figure-engine/*.test.ts"` → **18 tests / 3 suites, 18
  pass / 0 fail.** Coverage: exact mm↔px at 300/600 DPI; a 6×6 size×DPI matrix
  asserted equal across `figure-engine.mmToPixels`, medical-engine’s
  `computeRenderTargetPixelDimensions` and the Fase-1 oracle `expectedPixels`;
  refusals for non-finite/non-positive size and DPI, overflow, malformed pixel
  dimensions; non-physical aperture/panel/sheet; non-zero rotation; non-integer
  z-index; frozen stable ordering; typed error identity.
- `npm run typecheck` → **PASS** (0 errors, `tsc -b` + test project).
- `npm run build` → **PASS** (`tsc -b`, exit 0).
- `npm run test:python` → **411 passed**; `npm run typecheck:python` →
  **clean, 77 files** (unchanged; no Python touched).
- File-length gate: largest Phase-5 source `publication/layout.ts` = 144 lines;
  all Phase-5 source files ≤ 300.
- `git diff --check` → clean.

### Full-suite status and the external P4.4b blocker (truthful record)

On the shared working tree, `npm test` was observed at **549 tests / 101 suites,
548 pass / 1 fail**. The single failure is
`tests/medical/worker-source-integrity.test.ts` →
*“contains no Math usage anywhere in medical-engine sources”*, caused by the
**parallel P4.4b agent’s uncommitted, untracked file**
`packages/medical-engine/src/spatial/native-grid-domain.ts` (`Math.hypot`) and
its `packages/medical-engine/src/index.ts` export. That file is outside Phase 5,
is not staged by Phase 5 and is not part of this slice. Phase 5’s own tests,
typecheck, build and Python gates are green. The Phase-5 reviewer and QA both
independently confirmed the scope isolation and the green P5.1 evidence.

## 5. Documentation, AgentLog & ADR Status

- Phase plan + runbook + ADR-014 created (ADR-014 status **Accepted** for
  D1–D5 with **Open Decisions OD-1–OD-4 deferred**).
- This eight-point handover is the Phase 5 agentlog entry for P5.0/P5.1.
- `AGENTS.md` and `CHANGELOG.md` intentionally untouched (baseline/release updates
  belong to the phase close / `/promote-changelog 5`). No tag or release created.

## 6. Project Model Impact

None. No `.ncp` schema change and no `shared-types` contract change. The Fase-1
test oracle gained an `export` only; `project-model` and serialized state are
untouched.

## 7. Known Limitations & Technical Debt

- The apparent duplication of the mm→px formula is a ratified co-implementation
  (ADR-014 D2) guarded by the equivalence test, not a second source of truth.
- `pixelsToMm` is provided but not yet consumed by a later slice; it is the
  algebraic continuous inverse and is tested.
- OD-1–OD-4 remain open; the framing transform, rotated placement and patient
  annotation reprojection are **NOT YET IMPLEMENTED** and must not be guessed.
- No publication raster exists yet, so no image/pixel tolerance gate applies
  (`NOT YET APPLICABLE`).
- `figure-engine` still carries a declared but currently unused
  `@nuclear/rendering-presets` dependency (matrix-permitted; to wire or prune at
  the render/export slices).

## 8. Exact Next Recommended Task

Implement **P5.2** (`PublicationRenderRequest` assembly) in
`@nuclear/figure-engine` only, per
`docs/plans/PHASE_5_FIGURE_ENGINE_PLAN.md` and ADR-014 D3/D4: build a valid,
frozen `PublicationRenderRequest` from a `FigureSheet`, per-panel
`PreparedView` inputs and the requested output/DPI; resolve `renderMode`/`output`
from availability under the declared policy only; refuse `missing`/`mismatch` and
fingerprint/render-state-hash mismatches; the result must be accepted by the
Fase-1 `isPublicationRenderRequest` oracle. Do not start P5.2 until this P5.1
record and its reviewer/QA verdicts are in place (they are).

---

## Independent Verdicts — P5.1

- **`nuclear-reviewer` — CONCERNS (non-blocking); boundary and behaviour PASS.**
  Verified: package boundary/imports, acyclic graph and scope isolation (only
  `figure-engine/src/index.ts` tracked-modified by Phase 5), ADR-009/ADR-014
  consistency, no-invented-behaviour, fail-closed negatives, file-length
  (largest 144), docs honesty. Findings: **(1 LOW)** the delivered equivalence
  test was two-way while ADR-014 D2/plan/runbook/`units.ts` promised a three-way
  test including the Fase-1 oracle; **(1 INFO)** agentlog not yet present;
  nits (a stale `panel-order.test.ts` filename in the plan; `pixelsToMm`
  unused-by-slice). **Resolution in this task:** the Fase-1 oracle `expectedPixels`
  is now exported and the matrix asserts three-way equality; the stale filename
  in the plan is fixed; `pixelsToMm` is retained as tested public API. The
  agentlog gap is closed by this file.
- **`nuclear-qa` — PASS (all 11 requested gates).** Independently re-ran
  `git status`/scope isolation, `git diff --check`, `npm run typecheck`,
  focused 18/3, `npm test` (528/99 at the time of QA, before the parallel
  P4.4b files appeared), `npm run build`, pytest 411, mypy 77, file-length, the
  cross-package equivalence evidence and the fail-closed coverage. No unexpected
  deltas. Image/pixel-tolerance gate **NOT YET APPLICABLE**.
