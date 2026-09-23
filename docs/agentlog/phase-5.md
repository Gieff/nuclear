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

---

# Slice Record — P5.2 (`PublicationRenderRequest` assembly)

## 1. What Was Implemented

- **Fail-closed `PublicationRenderRequest` assembly** in `@nuclear/figure-engine`.
  `assemblePublicationRenderRequest(input)` takes a composed `FigureSheet` and
  exactly one `PreparedView` per panel, derives the render mode, target, output
  spec and panel inputs, and returns a frozen contract-valid request. Nothing is
  accepted verbatim from the caller: the `TemporaryRenderTargetSpec` /
  `CachedPreviewRenderTargetSpec` and the `PublicationOutputSpec` are built
  internally (ADR-014 D3/D5).
- **Availability resolution is fail-closed (ADR-014 D4).** `loading`, `missing`
  and `mismatch` always refuse (`FIGURE_PUBLICATION_AVAILABILITY_REFUSED`); an
  all-`online` sheet is `live-medical`; an all-`offline-cached` sheet requires
  `availabilityPolicy: 'allow-offline-preview'`; a mixed sheet refuses
  (`FIGURE_PUBLICATION_MIXED_AVAILABILITY`).
- **Offline provenance verification.** An offline panel must carry a
  `cachedPreviewReference` on both the medical view binding and the prepared
  view, the two must be value-equal (mirroring the oracle's `samePreview`), the
  cached fingerprint set must equal the prepared-view provenance fingerprints
  (order-independent, duplicate-sensitive multiset), and all offline panels must
  agree on one render-state hash. A caller-supplied `renderStateHash` must equal
  that derived hash; omitting it derives it from the single verified preview —
  never an invented value (`FIGURE_PUBLICATION_OFFLINE_PROVENANCE_INVALID`).
- **Malformed-object robustness.** Every input is validated with typed refusals
  and never a bare `TypeError`; validation covers non-object inputs, malformed
  sheets/panels/bindings, malformed prepared views, duplicate or missing
  panel↔prepared-view matches, malformed cached previews, field-level
  `SourceFingerprint` conformance, and malformed scalars/identity fields.
- **Decomposition** into `guards.ts`, `fingerprint-validation.ts`,
  `request-types.ts`, `request-validation.ts`, `request.ts` (all ≤300 lines) so
  the Rule 02 file-size gate is respected.

## 2. Files Changed

Created:
- `packages/figure-engine/src/publication/guards.ts`
- `packages/figure-engine/src/publication/fingerprint-validation.ts`
- `packages/figure-engine/src/publication/provenance.ts`
- `packages/figure-engine/src/publication/request-types.ts`
- `packages/figure-engine/src/publication/request-validation.ts`
- `packages/figure-engine/src/publication/request.ts`
- `packages/figure-engine/src/publication/targets.ts`
- `tests/figure-engine/fixtures/publication-request-fixtures.ts`
- `tests/figure-engine/publication-request.test.ts`
- `tests/figure-engine/publication-request-availability.test.ts`
- `tests/figure-engine/publication-request-malformed.test.ts`
- `tests/figure-engine/publication-request-boundary.test.ts`

Modified:
- `packages/figure-engine/src/publication/errors.ts` — five new typed codes
  (`FIGURE_PUBLICATION_REQUEST_INVALID`, `_PANEL_SOURCE_INVALID`,
  `_AVAILABILITY_REFUSED`, `_MIXED_AVAILABILITY`,
  `_OFFLINE_PROVENANCE_INVALID`).
- `packages/figure-engine/src/publication/index.ts` — barrel adds
  `provenance`, `targets`, `request-types`, `request`.
- `docs/decisions/ADR-014-figure-engine-publication-composition.md` — D2 note on
  the publication-scoped `SourceFingerprint` structural co-implementation.
- `docs/agentlog/phase-5.md` — this handover.

Not modified by Phase 5: `shared-types`, `rendering-presets`, `medical-engine`,
`view-engine`, `project-model`, `ui`, `apps/*`, `python/`, `AGENTS.md`,
`CHANGELOG.md`, ADR-012 and all Phase 4 documents.

## 3. Architectural Assumptions Made (boundary adherence)

- `figure-engine` stays inside the Rule 02 dependency matrix; all new imports
  are type-only `@nuclear/shared-types` or local. No React/DOM/Cornerstone and no
  runtime import of `medical-engine`/`view-engine`/`project-model`/
  `rendering-presets`.
- The assembler validates only the fields it consumes. The **trust boundary** is
  now stated explicitly in `request.ts`: deep `PreparedView.state`/`links`/
  `locks` validity, full `FigureSheet` framing/layout/decoration/annotation
  semantics and non-fingerprint provenance completeness are upstream
  (`view-engine` ADR-011 / figure-engine composition / `project-model`); the
  Fase-1 oracle remains the authority for the assembled result. An accepted
  input satisfies the oracle for every field this module reads; the caller must
  supply contract-valid `FigureSheet`/`PreparedView` objects.
- `SourceFingerprint` structural rules are mirrored from the Fase-1 oracle in
  `fingerprint-validation.ts` (publication-scoped, oracle-proven) — ADR-014 D2
  now records this second co-implementation.
- Metadata is passed by reference (availability, binding cached preview, the
  sheet and prepared views); only newly created containers are frozen, so the
  inputs are never mutated.

## 4. Tests Added & Executed

- `node --test "tests/figure-engine/*.test.ts"` → **34 tests / 7 suites, 34 pass
  / 0 fail** (18 P5.1 + 4 positive assembly + 5 availability/offline + 6
  malformed + 1 boundary).
  - Positive: live PDF/PNG and offline PDF/TIFF requests are each asserted
    accepted by the Fase-1 `isPublicationRenderRequest` oracle; offline
    hash-derivation is covered.
  - Fail-closed: missing/mismatch/loading, offline-without-policy, mixed
    availability, missing/unequal cached preview, fingerprint-set mismatch,
    render-state-hash mismatch.
  - Malformed objects: non-object inputs; malformed sheet/panels/bindings;
    duplicate panel/composer-view-instance ids; non-array annotations; binding↔
    instance `preparedViewId` mismatch; malformed prepared views; empty or
    field-invalid provenance fingerprints; malformed cached-preview fingerprints;
    malformed scalars — every case asserts `FigurePublicationError` and **not**
    `TypeError`.
  - Boundary: deep `PreparedView.state` is passed through and rejected only by
    the oracle, pinning the upstream trust boundary by evidence.
- `npm run typecheck` → **PASS**; `npm run build` → **PASS**.
- `npm test` → **586 tests / 107 suites, 586 pass / 0 fail in this environment**.
  Phase 5 contributes 34 figure-engine tests; the remainder includes the
  parallel P4.4b suite, which grew during the session.
- **Environment caveat (recorded from the phase-owner's environment).** The full
  suite is **not universally green**: the phase owner observed **522/586 pass
  with 64 `listen EPERM` errors on `127.0.0.1` listeners**, all in the
  pre-existing rendering suites. Those failures are sandbox/listener-permission
  artifacts outside Phase 5; the Phase-5 figure-engine suite stays **34/34
  green** in both environments. The full-suite gate is therefore *environment-
  dependent* and must be read with this caveat; it is not evidence about Phase 5.
- `npm run test:python` → **411 passed**; `npm run typecheck:python` → **clean,
  77 files**.
- File-length: largest Phase-5 source `request-validation.ts` = **268 lines**;
  all Phase-5 source files ≤ 300. `git diff --check` → clean.

## 5. Documentation, AgentLog & ADR Status

- ADR-014 D2 amended with the publication-scoped `SourceFingerprint` structural
  co-implementation note. No new ADR was required.
- This eight-point handover is the Phase 5 AgentLog entry for P5.2.
- `AGENTS.md` and `CHANGELOG.md` intentionally untouched.

## 6. Project Model Impact

None. No `.ncp` schema change and no `shared-types` contract change.

## 7. Known Limitations & Technical Debt

- `P5.3`–`P5.7` remain **NOT YET IMPLEMENTED**: no framing/layout transform set,
  no annotation projection, no renderer port, no TIFF/PNG flattening and no
  hybrid PDF.
- ADR-014 OD-1–OD-4 remain open and are refused, not guessed.
- The assembler does not re-validate deep clinical contracts; this is the stated
  trust boundary (upstream `view-engine` ADR-011 / figure-engine composition).
- No publication raster exists yet, so no image/pixel tolerance gate applies
  (`NOT YET APPLICABLE`).
- `renderStateHash` for live requests is caller-supplied provenance, not
  computed here (the renderer owns it in P5.5).

## 8. Exact Next Recommended Task

Implement **P5.3** (ratified framing/layout transform set: Viewport ↔ Panel
Content ↔ Figure Sheet), which is blocked until ADR-014 OD-1 (framing
arithmetic), OD-2 (rotation origin) and OD-3 (`contentScale` application) are
resolved by an ADR amendment — do not implement them by guesswork. If OD-1–OD-3
must remain open, the next unblocked slice is **P5.4** only after those
resolutions; otherwise proceed to resolve the ADR amendment first.

---

## Independent Verdicts — P5.2

- **`nuclear-reviewer` — initial CONCERNS (non-blocking), then PASS.** Initial
  review found one MEDIUM (M1: the trust boundary was understated — some
  deeper-malformed accepted inputs were oracle-rejected) and LOW items (alpha
  default wording; malformed coverage; missing agentlog). Resolution in-slice:
  `assertSheetStructure` (annotations array, unique panel/instance ids),
  binding↔instance `preparedViewId` enforcement, `readFingerprint` field-level
  validation for both fingerprint sets, an explicit rewritten trust-boundary
  docblock, and a boundary test. Re-review confirmed **PASS**: all probed M1
  cases now either refuse typed or are pinned by the boundary test; the one
  residual LOW (empty `provenance.sourceFingerprints`) was closed in the same
  slice by refusing it as `FIGURE_PUBLICATION_REQUEST_INVALID`; file sizes and
  boundaries verified.
- **`nuclear-qa` — PASS (all 11 gates).** Independently re-ran scope isolation,
  `git diff --check`, `npm run typecheck`, focused 32/5 (at QA time),
  `npm test` 563/103/0, `npm run build`, pytest 411, mypy 77, file-length,
  oracle usage and the malformed/no-`TypeError` coverage. No unexpected deltas;
  image/pixel-tolerance gate **NOT YET APPLICABLE**.

---

# Slice Record — ADR-014 Amendment (OD-1–OD-4) and P5.3 (framing/layout transforms)

## 1. What Was Implemented

- **ADR-014 amendment ratified (phase owner, 2026-09-23): OD-1–OD-4 Accepted.**
  The previously deferred Open Decisions are replaced by the
  “Ratified Amendment” section with the owner’s exact terms:
  - **OD-1 (A refined):** normalized crop with validation, `scaledSize =
    contentSizeMm × contentScale`, the five `alignment` offsets, `contentOffsetMm`,
    invertible; `overflow` is a compositor clip policy, not part of the map.
  - **OD-2 (A):** rotation origin = panel centre, positive clockwise in `y-down`;
    `rotationDeg !== 0` **remains refused for medical panel placement** (the
    contract cannot distinguish editorial vs medical rotation).
  - **OD-3 (A):** the publication target stays the physical aperture
    `contentSizeMm × DPI`; `contentScale` never changes export density.
  - **OD-4 (A refined):** `LPS → view plane → viewport → panel content → sheet
    mm`; `planeToleranceMm = 0` ⇒ no fade band; `fadeBandMm =
    planeToleranceMm`, linear 1→0 over `(tol, 2·tol]`; `loading` behaves like
    `offline-cached`/`missing`/`mismatch` (patient annotation hidden fail-closed).
- **P5.3 — OD-1 and OD-2 transforms** in `@nuclear/figure-engine`, pure and
  Node-safe:
  - `framing.ts`: `assertPanelFraming`, `scaledContentSizeMm`,
    `alignmentOffsetMm`, `viewportToPanelContent`, `panelContentToViewport`
    (OD-1, invertible, typed `FIGURE_FRAMING_INVALID` refusals, no clamping).
  - `sheet-placement.ts`: `panelLocalCenterMm`, `panelContentToSheet`,
    `sheetToPanelContent` (OD-2, centre-origin clockwise, invertible) with
    shape guards so malformed JS input is a typed `FIGURE_LAYOUT_INVALID`, not a
    `TypeError`.
  - `layout.ts` reduced to axis-aligned placement/containment/z-order; the
    medical rotation refusal now states the ratified medical policy (no stale
    “no ratified origin” text).
  - `errors.ts` adds `FIGURE_FRAMING_INVALID` and `FIGURE_LAYOUT_INVALID`;
    `panel-raster.ts` comment cites ratified OD-3; barrel exports `framing` and
    `sheet-placement`.
- **OD-4 is NOT implemented** (deferred to P5.4, which must follow the P5.3
  transform tests).

## 2. Files Changed

Created:
- `packages/figure-engine/src/publication/framing.ts`
- `packages/figure-engine/src/publication/sheet-placement.ts`
- `tests/figure-engine/framing-transform.test.ts`
- `tests/figure-engine/layout-transform.test.ts`

Modified:
- `docs/decisions/ADR-014-figure-engine-publication-composition.md` — Status +
  “Ratified Amendment — OD-1–OD-4 (2026-09-23)”.
- `packages/figure-engine/src/publication/{errors,index,layout,panel-raster}.ts`
- `docs/plans/PHASE_5_FIGURE_ENGINE_PLAN.md`,
  `docs/plans/PHASE_5_OPENCODE_RUNBOOK.md` — P5.3/P5.4 unblocked with the
  ratified terms.
- `docs/agentlog/phase-5.md` — this handover.

Not modified by Phase 5: `shared-types`, `rendering-presets`, `medical-engine`,
`view-engine`, `project-model`, `ui`, `apps/*`, `python/`, `AGENTS.md`,
`CHANGELOG.md`.

## 3. Architectural Assumptions Made (boundary adherence)

- OD-1/OD-2 are implemented literally from the ratified amendment; nothing
  beyond it (no clipping implementation, no P5.4 reprojection).
- The OD-2 rotation primitive is exposed for editorial content while the
  **medical** placement path stays fail-closed; this distinction is documented
  in both `layout.ts` and `sheet-placement.ts` and asserted by tests.
- `figure-engine` imports remain type-only `@nuclear/shared-types` or local; no
  React/DOM/Cornerstone/`medical-engine` runtime import.
- Typed refusals throughout; no coercion, clamping or defaulting.

## 4. Tests Added & Executed

- `node --test "tests/figure-engine/*.test.ts"` → **47 tests / 9 suites, 47 pass
  / 0 fail** (18 P5.1 + 16 P5.2 + 7 OD-1 framing + 6 OD-2 layout).
  - OD-1: identity/non-unit crop, `contentScale` centering, all five alignment
    origins/far corners, `contentOffsetMm`, crop-external no-clamp, inverse
    round-trips, 12 malformed framings + non-finite point.
  - OD-2: translation, 90° clockwise with invariant origin, −90°, round-trips
    over `[0, 90, −90, 37.5, 180]`, medical refusal vs accepted primitive,
    malformed layout refusals.
- `npm run typecheck` → **PASS**; `npm run build` → **PASS**.
- `npm test` → **599 tests / 109 suites, 599 pass / 0 fail** (Phase 5 adds the
  13 P5.3 tests; remainder includes the parallel P4.4b suite). The earlier
  environment caveat (64 `listen EPERM` in rendering tests in the phase owner’s
  environment) still applies to the full suite and is not a Phase 5 failure.
- `npm run test:python` → **411 passed**; `npm run typecheck:python` → **clean,
  77 files**.
- File-length: largest Phase-5 source `request-validation.ts` = **268**;
  `layout.ts` now 156, `sheet-placement.ts` 116; all ≤ 300. `git diff --check` →
  clean.

## 5. Documentation, AgentLog & ADR Status

- ADR-014 amendment **Accepted** (OD-1–OD-4 ratified). Plan and runbook
  unblocked. This is the P5.3 AgentLog entry.
- `AGENTS.md` and `CHANGELOG.md` intentionally untouched.

## 6. Project Model Impact

None. No `.ncp` schema change and no `shared-types` contract change.

## 7. Known Limitations & Technical Debt

- **OD-4 / P5.4 pending:** patient-anchored annotation reprojection is not
  implemented; P5.4 must follow the P5.3 tests and the ratified OD-4 terms.
- **OD-2 future contract gap:** there is still no explicit editorial-vs-medical
  rotation distinction; rotated medical panels remain refused until a contract
  extension ratifies it.
- Minor error-code asymmetry: the same non-finite position/size defect yields
  `FIGURE_SHEET_CONTAINMENT_INVALID` on the containment path and
  `FIGURE_LAYOUT_INVALID` on the transform path (intentional, documented in the
  module headers).
- No publication raster exists yet → image/pixel tolerance gate
  **NOT YET APPLICABLE**.

## 8. Exact Next Recommended Task

Implement **P5.4** (patient-anchored annotation projection and anchor policy)
in `@nuclear/figure-engine` only, strictly per the ratified OD-4 terms:
`LPS → view plane → viewport → panel content → sheet mm` using the resolved
`ComposerViewInstance` state incl. overrides; `planeToleranceMm = 0` ⇒ no fade
band; `fadeBandMm = planeToleranceMm` with linear 1→0 opacity over
`(tol, 2·tol]`; `loading`/`offline-cached`/`missing`/`mismatch` hide the
annotation fail-closed; no screen-pixel persistence; editorial (panel/sheet)
anchors unchanged.

---

## Independent Verdicts — P5.3

- **`nuclear-reviewer` — PASS.** Verified literal fidelity to the ratified
  amendment (OD-1 formula/validation/alignment/offset/invertibility; OD-2 centre
  origin, clockwise y-down, exact inverse), the medical rotation policy, the
  no-invented-behaviour boundary, file sizes and package boundary. Findings:
  one LOW (stale “no ratified origin” error text) and nits N1–N5. Resolution:
  the message and module header were corrected; the OD-2 rotation primitive was
  extracted to `sheet-placement.ts` (single responsibility, `layout.ts` 156);
  shape guards added so malformed input is a typed `FIGURE_LAYOUT_INVALID`.
  Bounded re-review **PASS**: all fixes verified, behaviour preserved, 47/47 and
  typecheck green. N2 (intentional containment-vs-transform error-code
  distinction) and N5 (indirect inverse coverage) accepted as recorded debt.
- **`nuclear-qa` — PASS (all 11 gates).** Independently re-ran scope isolation,
  `git diff --check`, `npm run typecheck`, focused 47/9, `npm test` 599/109/0,
  `npm run build`, pytest 411, mypy 77, file-length (max 268), and runtime
  spot-checks of the ratified OD-1/OD-2 values (21/21 and 42/42 round-trips at
  ε = 1e-9). No unexpected deltas; image/pixel-tolerance gate **NOT YET
  APPLICABLE**.

---

# Slice Record — P5.4 (OD-4 annotation visibility policy; projection BLOCKED on OD-5)

## 1. What Was Implemented

- **`resolvePatientAnnotationVisibility`** (`annotation-policy.ts`): the
  ratified ADR-014 OD-4 visibility/opacity policy, pure and Node-safe.
  - `availability !== 'online'` (`loading`, `offline-cached`, `missing`,
    `mismatch`) ⇒ hidden fail-closed.
  - `planeToleranceMm === 0` ⇒ no fade band: visible only at `|d| === 0`.
  - `planeToleranceMm > 0` with `outOfPlaneBehavior: 'fade'`: visible at opacity
    1 while `|d| ≤ tol`, linear `1 → 0` over `(tol, 2·tol]`, hidden beyond.
  - `outOfPlaneBehavior: 'hide'`: hard cutoff at the tolerance.
  - Signed distances are folded to magnitude; distances in mm. Malformed input
    (unknown availability/behaviour, non-finite distance, non-finite or
    negative tolerance) refuses `FIGURE_ANNOTATION_INVALID`.
- **Explicit interpretation recorded:** ADR-014 OD-4 gained an “Interpretation
  note (subject to owner confirmation)” stating that the ratified fade band
  describes `'fade'`, that `'hide'` is a hard cutoff at the tolerance, and that
  `planeToleranceMm = 0` is a hard cutoff in both behaviours — so the reading of
  the frozen `outOfPlaneBehavior` field is not left implicit in code.
- **`FIGURE_ANNOTATION_INVALID`** error code and barrel export added.

## 2. Files Changed

Created:
- `packages/figure-engine/src/publication/annotation-policy.ts`
- `tests/figure-engine/annotation-policy.test.ts`

Modified:
- `packages/figure-engine/src/publication/errors.ts` (+`FIGURE_ANNOTATION_INVALID`)
- `packages/figure-engine/src/publication/index.ts` (barrel; header P5.1–P5.4)
- `docs/decisions/ADR-014-…md` (OD-4 interpretation note)
- `docs/plans/PHASE_5_FIGURE_ENGINE_PLAN.md`,
  `docs/plans/PHASE_5_OPENCODE_RUNBOOK.md` (P5.4 PARTIAL + OD-5a/b/c blocker;
  opacity-0 compositor note)
- `docs/agentlog/phase-5.md` — this handover.

Not modified: `shared-types`, `rendering-presets`, `medical-engine`,
`view-engine`, `project-model`, `ui`, `apps/*`, `python/`, `AGENTS.md`,
`CHANGELOG.md`.

## 3. Architectural Assumptions Made (boundary adherence) — and the OD-5 block

- **No geometry was invented.** The `LPS → view plane → viewport` projection is
  **NOT implemented** and no partial projection code exists. It is blocked
  because the displayed-plane definition and the content semantics of
  `CoordinateTransformSet.patientToViewPlane` / `viewPlaneToViewport` are
  unratified: the matrices are placeholder transforms that are only carried
  (`patientToViewPlane` identity, `viewPlaneToViewport` identity-plus-256-
  translation in every existing artifact; `medical-engine` never composes or
  re-derives them — ADR-008 step 4 / ADR-009), and `medical-engine` refuses
  non-neutral slice positioning (`referenceLocation` non-zero /
  `sliceOffsetMm !== 0`) per ADR-008.
- The out-of-plane distance is therefore an **explicit input** supplied by the
  medical-chain owner, not derived by `figure-engine`.
- `figure-engine` imports remain type-only `@nuclear/shared-types` or local; no
  React/DOM/Cornerstone/`medical-engine` runtime import.

## 4. Tests Added & Executed

- `node --test "tests/figure-engine/*.test.ts"` → **52 tests / 10 suites, 52
  pass / 0 fail** (18 P5.1 + 16 P5.2 + 13 P5.3 + 5 P5.4). P5.4 coverage: every
  availability state × both behaviours at on/off-plane distances; tolerance-0
  exact-plane ±ε; the fade band endpoints (`tol`→1, `2·tol`→opacity 0,
  `2·tol+ε`→hidden, midpoint 0.5); the `hide` cutoff including at `2·tol`;
  signed distances; malformed-input refusals incl. NaN tolerance and ±∞
  distance.
- `npm run typecheck` → **PASS**; `npm run build` → **PASS**.
- `npm test` → **610 tests / 111 suites, 610 pass / 0 fail** (re-baselined from
  the recorded 599/109; the +11/+2 delta is the P5.4 tests plus rendering-suite
  registration/anomaly in this environment — **not** a Phase 5 change). The
  phase-owner `listen EPERM` caveat still applies; the figure-engine suite is
  green in both environments.
- `npm run test:python` → **411 passed**; `npm run typecheck:python` → **clean,
  77 files**.
- File-length: largest Phase-5 source `request-validation.ts` = **268**;
  `annotation-policy.ts` = 108; all ≤ 300. `git diff --check` → clean.

## 5. Documentation, AgentLog & ADR Status

- ADR-014 OD-4 amended with the interpretation note (owner-confirmable).
- Plan/runbook record P5.4 as PARTIAL, the projection blocked on OD-5a/b/c, and
  the two unblocked paths (ratify OD-5, or proceed to P5.5).
- This is the P5.4 AgentLog entry. `AGENTS.md`/`CHANGELOG.md` untouched.

## 6. Project Model Impact

None. No `.ncp` schema change and no `shared-types` contract change.

## 7. Known Limitations & Technical Debt

- **Patient projection blocked on OD-5.** Until ratified, the distance is
  caller-supplied and no LPS reprojection happens.
- `'hide'` semantics are an interpretation pending owner confirmation.
- At exactly `2 × planeToleranceMm` the policy returns `opacity: 0`; the P5.6/P5.7
  compositor must treat opacity 0 as “emit nothing”.
- P5.5–P5.7 remain NOT YET IMPLEMENTED. No publication raster → image/pixel
  tolerance gate **NOT YET APPLICABLE**.

## 8. Exact Next Recommended Task

Either ratify **OD-5a/b/c** (ADR-014 follow-up) to unblock the patient
projection, or proceed to **P5.5** (publication renderer port + orchestration),
which depends on P5.2 and is unblocked. If adopting the `'hide'`
interpretation, confirm it (or supersede the interpretation note).

---

## Independent Verdicts — P5.4

- **`nuclear-reviewer` — PASS** (one LOW concern C1, resolved in-slice). C1: the
  `'hide'` reconciliation was honest and conservative but recorded only in code;
  resolved by the ADR-014 OD-4 interpretation note. Nits addressed: opacity-0
  compositor note (`annotation-policy.ts` header + runbook), `index.ts` header,
  plan “identity placeholders” wording corrected, and extra negative tests
  (NaN tolerance, ±∞ distance, `hide` at `2·tol`). Verified: OD-4 fidelity,
  blocked-projection justification (repo-wide grep; zero partial projection
  code), no-invented-behaviour, boundary and file sizes.
- **`nuclear-qa` — PASS (all gates).** Independently ran scope isolation,
  `git diff --check`, `npm run typecheck`, focused 52/10, `npm test`
  **610/111/0** (one rendering-harness timeout flake on the first run, external
  to Phase 5, green on rerun), `npm run build`, pytest 411, mypy 77,
  file-length (max 268), and 35/35 runtime policy spot-checks. Confirmed no
  LPS→viewport projection code in `figure-engine`. Image/pixel-tolerance gate
  **NOT YET APPLICABLE**.

---

# Slice Record — P5.4 completion (OD-5 patient projection)

## 1. What Was Implemented

- **ADR-014 OD-5 ratified (phase owner, 2026-09-23; options A/A/A + `'hide'`
  confirmed).** The amendment records: OD-5a plane =
  `referenceLocation + sliceOffsetMm · viewPlaneNormal`; OD-5b signed distance
  `d = dot(anchorLps − planePoint, viewPlaneNormal)` from physical LPS geometry
  (never the projective `z`); OD-5c the authored row-major transforms are
  **consumed, never derived**; OD-5d `'hide'` is a hard cutoff (confirmed).
- **`projectPatientAnnotation`** (`patient-projection.ts`): pure, Node-safe
  projection of a patient-anchored annotation to a frozen
  `{ visible, opacity, outOfPlaneDistanceMm, sheetPointMm? }`.
  - Out-of-plane decision from the physical LPS plane; visibility via the OD-4
    policy (`|d|`); hidden ⇒ no `sheetPointMm`, distance still reported.
  - Placement via the authored transforms: `patientToViewPlane` →
    `viewPlaneToViewport` (row-major affine, `w = 1`) → normalize by
    `viewportSizePx` → OD-1 `viewportToPanelContent` → OD-2
    `panelContentToSheet`.
  - Fail-closed: non-`patient` anchor, malformed/absent anchor fields,
    non-finite `SpatialState`, a non-unit `viewPlaneNormal` (tolerance `1e-5`,
    aligned with the Fase-1 contract oracle), a non-finite/non-affine matrix
    (including a non-zero projective row), an invalid `viewportSizePx`, and
    malformed framing/layout are all typed refusals.
- Review fixes folded in: the `annotation-policy.ts` scope note now records that
  OD-5 is ratified and the projection lives in `patient-projection.ts`; the
  unit-normal tolerance was aligned to the contract oracle (`1e-5`); the affine
  comment now names the projective row; anchor `planeToleranceMm` /
  `outOfPlaneBehavior` are validated at the anchor path with precise messages.

## 2. Files Changed

Created:
- `packages/figure-engine/src/publication/patient-projection.ts`
- `tests/figure-engine/patient-projection.test.ts`

Modified:
- `docs/decisions/ADR-014-…md` (Status + `### OD-5` ratified section; `'hide'`
  confirmation)
- `docs/plans/PHASE_5_FIGURE_ENGINE_PLAN.md`,
  `docs/plans/PHASE_5_OPENCODE_RUNBOOK.md` (P5.4 COMPLETE; OD-5 resolved)
- `packages/figure-engine/src/publication/annotation-policy.ts` (scope-note fix)
- `packages/figure-engine/src/publication/index.ts` (barrel)
- `docs/agentlog/phase-5.md` — this handover.

Not modified: `shared-types`, `rendering-presets`, `medical-engine`,
`view-engine`, `project-model`, `ui`, `apps/*`, `python/`, `AGENTS.md`,
`CHANGELOG.md`.

## 3. Architectural Assumptions Made (boundary adherence)

- `figure-engine` derives nothing: the transforms are applied algebraically;
  their physical derivation remains with `view-engine`/`medical-engine`
  (OD-5c), preserving the acyclic boundary.
- The projection consumes the resolved `MedicalViewState`; local overrides are
  applied upstream by `view-engine` (ADR-011) and are not re-applied here.
- No-invented-geometry: the plane and distance are the ratified physical LPS
  definitions; no clamping/defaulting; hidden annotations produce no sheet point.
- Imports remain type-only `@nuclear/shared-types` or local.

## 4. Tests Added & Executed

- `node --test "tests/figure-engine/*.test.ts"` → **60 tests / 11 suites, 60
  pass / 0 fail** (18 P5.1 + 16 P5.2 + 13 P5.3 + 5 policy + 8 projection).
  Projection coverage: full-chain placement at the fixture transforms
  (LPS (0,0,0) → sheet (60,60); (10,0,0) → (61.5625,60)); signed distance
  (0,0,±3); plane shift by `sliceOffsetMm` and `referenceLocation`; fade band
  incl. the `2·tol` opacity-0 endpoint; `'hide'` cutoff; non-online hidden with
  no sheet point (distance still reported); malformed refusals (NaN position,
  negative tolerance, bad behaviour, non-unit normal, non-affine `m15` and
  `m[12]`, zero/negative viewport); frozen output.
- `npm run typecheck` → **PASS**; `npm run build` → **PASS**.
- `npm test` → **618 tests / 112 suites, 618 pass / 0 fail** (Phase 5 adds the
  8 projection tests). The phase-owner `listen EPERM` caveat still applies; the
  figure-engine suite is green in both environments.
- `npm run test:python` → **411 passed**; `npm run typecheck:python` → **clean,
  77 files**.
- File-length: largest Phase-5 source `request-validation.ts` = **268**;
  `patient-projection.ts` = 226; all ≤ 300. `git diff --check` → clean.

## 5. Documentation, AgentLog & ADR Status

- ADR-014 OD-5 **Accepted** with the exact ratified parameters; plan/runbook
  mark P5.4 COMPLETE; this is the completion AgentLog entry.
- `AGENTS.md`/`CHANGELOG.md` untouched.

## 6. Project Model Impact

None. No `.ncp` schema change and no `shared-types` contract change.

## 7. Known Limitations & Technical Debt

- The authored `patientToViewPlane`/`viewPlaneToViewport` are still placeholders
  in fixtures; `figure-engine` correctly consumes them, but end-to-end physical
  correctness awaits the real view-engine/renderer transform set.
- The projection uses `panelContentToSheet`, which accepts any finite rotation;
  the rotated-medical case is unreachable because the medical placement path
  (`layout.ts`) refuses `rotationDeg !== 0` first (OD-2).
- P5.5–P5.7 remain NOT YET IMPLEMENTED. No publication raster → image/pixel
  tolerance gate **NOT YET APPLICABLE**.

## 8. Exact Next Recommended Task

Implement **P5.5** (publication renderer port + orchestration): define the port
that consumes the medical `RenderTarget` capability, produce one
high-resolution medical raster per panel from a live `PublicationRenderRequest`,
and keep `figure-engine` free of `@cornerstonejs/*`/WebGL ownership.

---

## Independent Verdicts — P5.4 completion (OD-5)

- **`nuclear-reviewer` — PASS** (two LOW doc/consistency concerns, resolved
  in-slice). Verified OD-5a/b/c/d fidelity, the consumed-not-derived transforms,
  the resolved-state boundary, fail-closed refusals, boundary/file-size and the
  tests (8/8 executed, arithmetic hand-checked). C1 (unit-normal tolerance not
  aligned with the contract oracle) and C2 (stale `annotation-policy.ts` scope
  note) were fixed; comment/test nits were addressed.
- **`nuclear-qa` — PASS (all 11 gates).** Scope isolation, `git diff --check`,
  `npm run typecheck`, focused **60/11**, `npm test` **618/112/0** (no flake this
  run), `npm run build`, pytest 411, mypy 77, file-length (max 268), and 8/8
  runtime spot-checks against the fixture transforms. Confirmed no forbidden
  runtime imports. Image/pixel-tolerance gate **NOT YET APPLICABLE**.

---

# Slice Record — P5.5a (publication renderer port + live orchestration)

## 1. What Was Implemented

- **Renderer port contract** (`render-port.ts`): `PublicationPanelRenderRequest`
  (resolved `MedicalViewState` + per-panel `TemporaryRenderTargetSpec` +
  render-state hash), `PublicationPanelRaster` (neutral base64 RGBA + renderer
  identity) and `PublicationRendererPort`. `figure-engine` defines only the
  contract; the composition root implements it over the medical `RenderTarget`
  capability (ADR-009), so `figure-engine` imports no `@cornerstonejs/*` or
  `medical-engine` and owns no WebGL context/canvas.
- **Live orchestration** (`render-orchestrator.ts`): `renderLivePublication`
  derives each panel's temporary target from the panel content aperture ×
  request DPI, renders sequentially through the port in request order, and
  returns a frozen `{ sheetId, renderMode, renderStateHash, panels }`.
- **Raster validation** (`render-raster.ts`, internal): fail-closed on a wrong
  panel, wrong dimensions (no upscaling/downscaling), a wrong byte length or a
  blank renderer identity (`FIGURE_PUBLICATION_RASTER_INVALID`).
- **Fail-closed orchestration**: a non-live `renderMode`, a non-temporary
  target, any non-`online` source (incl. `loading`), a non-`live-medical`
  `renderSource`, a panel/prepared-view/sheet-binding mismatch, a port failure
  (wrapped with `cause`) or a malformed raster is refused with a typed
  `FigurePublicationError` (`FIGURE_PUBLICATION_RENDER_UNAVAILABLE`,
  `FIGURE_PUBLICATION_RENDER_FAILED`, `FIGURE_PUBLICATION_RASTER_INVALID`).
- **Explicit split**: the real-harness adapter evidence is **P5.5b**, not part
  of this slice (see plan/runbook).

## 2. Files Changed

Created:
- `packages/figure-engine/src/publication/render-port.ts`
- `packages/figure-engine/src/publication/render-orchestrator.ts`
- `packages/figure-engine/src/publication/render-raster.ts`
- `tests/figure-engine/publication-render.test.ts`

Modified:
- `packages/figure-engine/src/publication/errors.ts` (three render/raster codes)
- `packages/figure-engine/src/publication/index.ts` (barrel adds port + orchestrator; `render-raster` stays internal)
- `docs/plans/PHASE_5_FIGURE_ENGINE_PLAN.md`,
  `docs/plans/PHASE_5_OPENCODE_RUNBOOK.md` (P5.5a COMPLETE / P5.5b NOT YET IMPLEMENTED)
- `docs/agentlog/phase-5.md` — this handover.

Not modified: `shared-types`, `rendering-presets`, `medical-engine`,
`view-engine`, `project-model`, `ui`, `apps/*`, `python/`, `AGENTS.md`,
`CHANGELOG.md`.

## 3. Architectural Assumptions Made (boundary adherence)

- The port is the single rendering seam; `figure-engine` never renders medical
  data itself and never resizes a live canvas (`liveCanvasPolicy:
  'never-resize-live-canvas'` on every per-panel target).
- The per-panel target is the physical aperture (`contentSizeMm`) at the request
  DPI, consistent with ratified OD-3.
- A raster whose dimensions differ from the physically required aperture is
  refused, never upscaled; the `byteLength` is re-derived from the required
  dimensions (stricter, fail-closed).
- No encoder/offline-preview path was added (P5.6/P5.7 remain pending).

## 4. Tests Added & Executed

- `node --test "tests/figure-engine/*.test.ts"` → **67 tests / 12 suites, 67
  pass / 0 fail** (60 + 7 P5.5a). Coverage: the per-panel target (945×945 at
  300 DPI for the 80 mm fixture), request order across two panels, frozen
  result, and refusal cases for non-live mode, non-temporary target, every
  non-online availability, non-live `renderSource`, wrong panel/dimensions/byte
  length/identity, port failure with preserved cause, and malformed
  request/port/sheet-binding.
- `npm run typecheck` → **PASS**; `npm run build` → **PASS**.
- `npm test` → **625 tests / 113 suites, 625 pass / 0 fail** (Phase 5 adds the 7
  P5.5a tests). The phase-owner `listen EPERM` caveat still applies; the
  figure-engine suite is green in both environments.
- `npm run test:python` → **411 passed**; `npm run typecheck:python` → **clean,
  77 files**.
- File-length: largest Phase-5 source `request-validation.ts` = **268**;
  `render-orchestrator.ts` = 229 (≤ Rule 02's 250 threshold), `render-raster.ts`
  = 92, `render-port.ts` = 52. `git diff --check` → clean.

## 5. Documentation, AgentLog & ADR Status

- Plan/runbook split P5.5 into **P5.5a (COMPLETE)** and **P5.5b (real-harness
  adapter, NOT YET IMPLEMENTED)**; no real-harness evidence is claimed.
- No new ADR was required (ADR-014 D1/D3 and ADR-009 already cover the boundary).
- This is the P5.5a AgentLog entry. `AGENTS.md`/`CHANGELOG.md` untouched.

## 6. Project Model Impact

None. No `.ncp` schema change and no `shared-types` contract change.

## 7. Known Limitations & Technical Debt

- **P5.5b pending:** the real-harness adapter (port implementation over
  `captureTemporaryRenderTarget` in the controlled browser harness) is not
  implemented; all evidence here is fake-port contract evidence.
- The orchestrator trusts the caller-supplied `MedicalViewState` (validated by
  `view-engine` upstream); it validates only the publication-relevant fields.
- P5.6/P5.7 remain NOT YET IMPLEMENTED. No publication raster exists → image/
  pixel tolerance gate **NOT YET APPLICABLE**.

## 8. Exact Next Recommended Task

Implement **P5.5b**: add a `PublicationRendererPort` implementation backed by
`captureTemporaryRenderTarget` to the controlled browser harness and assert a
panel-aperture capture, no-upscale refusal and live-canvas invariance. If the
renderer harness is unavailable, report P5.5b `BLOCKED`. (Alternatively P5.6 may
start after its encoder ADR; P5.5a is its declared predecessor.)

---

## Independent Verdicts — P5.5a

- **`nuclear-reviewer` — PASS.** Verified the port contract boundary (no
  `@cornerstonejs`/`medical-engine` import, no canvas ownership), the
  orchestration (per-panel aperture × DPI target, request order, frozen result),
  the complete fail-closed matrix and the docs split. One concern (sheet-binding
  refusal branches untested) was closed in-slice by adding cases for a missing
  sheet panel, a composer-view-instance mismatch and a binding
  `preparedViewId` mismatch; a clarifying `byteLength` note was added.
- **`nuclear-qa` — PASS (all 11 applicable gates).** Scope isolation,
  `git diff --check`, `npm run typecheck`, focused **67/12**, `npm test`
  **625/113/0** (no flake), `npm run build`, pytest 411, mypy 77, file-length
  (`render-orchestrator.ts` 229 ≤ 250), and runtime fake-port spot-checks
  (945×945 target, `missing` → `RENDER_UNAVAILABLE`, 512×512 → `RASTER_INVALID`).
  Real-harness evidence **NOT YET APPLICABLE** (P5.5b).

---

# Slice Record — P5.5b (real-harness publication renderer port adapter)

## 1. What Was Implemented

- **`sizeMm` on the port request** (P5.5a contract amendment): the per-panel
  `PublicationPanelRenderRequest` now carries the physical aperture in mm, which
  the renderer needs to validate its temporary target spec
  (`validateTemporaryRenderTargetSpec(spec, sizeMm)`, ADR-009). The orchestrator
  sets it from `panelFraming.contentSizeMm` (never derived from pixels).
- **Real-harness adapter** (`tests/rendering/fixtures/publication-scenarios.ts`):
  a `PublicationRendererPort` implementation over the real
  `captureTemporaryRenderTarget` that renders the request's resolved
  `MedicalViewState` on a separate temporary target, maps the returned
  `MedicalCaptureDescriptor` to a neutral `PublicationPanelRaster` (dims,
  byteLength, base64 RGBA, real renderer name + `@cornerstonejs/core` version),
  and drives the full `renderLivePublication` orchestration.
- **Browser harness entry + support**
  (`publication-entry.ts`, `publication-probe-types.ts`,
  `publication-test-support.ts`) and a new Node test
  (`tests/rendering/publication-render-port.test.ts`).
- **Evidence**: 80 mm × 80 mm @ 600 DPI → native **1890×1890** raster with
  `byteLength = 1890² × 4`; live element/canvas/camera/aspect/actor invariance;
  the temporary-target container disposed after the run; `missing` availability
  → `FIGURE_PUBLICATION_RENDER_UNAVAILABLE` with no capture.

## 2. Files Changed

Created:
- `tests/rendering/fixtures/publication-probe-types.ts`
- `tests/rendering/fixtures/publication-scenarios.ts`
- `tests/rendering/fixtures/publication-entry.ts`
- `tests/rendering/fixtures/publication-test-support.ts`
- `tests/rendering/publication-render-port.test.ts`

Modified:
- `packages/figure-engine/src/publication/render-port.ts` (`sizeMm`)
- `packages/figure-engine/src/publication/render-orchestrator.ts` (set `sizeMm`)
- `tests/figure-engine/publication-render.test.ts` (assert `sizeMm`)
- `docs/plans/PHASE_5_FIGURE_ENGINE_PLAN.md`,
  `docs/plans/PHASE_5_OPENCODE_RUNBOOK.md` (P5.5b COMPLETE; P5.6 gated on the encoder ADR)
- `docs/agentlog/phase-5.md` — this handover.

Not modified: `shared-types`, `rendering-presets`, `medical-engine`,
`view-engine`, `project-model`, `ui`, `apps/*`, `python/`, `AGENTS.md`,
`CHANGELOG.md`.

## 3. Architectural Assumptions Made (boundary adherence)

- The adapter lives in **test infrastructure** (the composition-root shape), not
  in `figure-engine`; `figure-engine` still imports no `@cornerstonejs/*` or
  `medical-engine` and owns no canvas.
- The port request carries no plan/evidence/layers: a real composition root
  correlates those itself; the harness binds them from its single CT fixture.
- The renderer identity is the capture descriptor's real renderer name plus the
  imported `@cornerstonejs/core` version — no fabricated version.
- The `sizeMm` amendment is permitted by ADR-014 ("the renderer port contract may
  be edited while preserving D1–D4") and requires no new ADR.

## 4. Tests Added & Executed

- `node --test tests/rendering/publication-render-port.test.ts` → **2 tests / 1
  suite, pass** (real esbuild bundle + Playwright Chromium SwiftShader harness):
  native panel-aperture capture with live-canvas invariance and disposal;
  fail-closed unavailable source.
- `node --test "tests/figure-engine/*.test.ts"` → **67 tests / 12 suites, pass**.
- `npm test` → **627 tests / 114 suites, 627 pass / 0 fail** (Phase 5 adds the 2
  browser tests; the earlier `listen EPERM` caveat is environment-specific and
  did **not** occur in this run — the harness listener bound normally).
- `npm run typecheck` → **PASS**; `npm run build` → **PASS**.
- `npm run test:python` → **411 passed**; `npm run typecheck:python` → **clean,
  77 files**.
- File-length: `render-orchestrator.ts` = 235 (≤ 250); `publication-scenarios.ts`
  = 223; all touched files ≤ 300. `git diff --check` → clean.

## 5. Documentation, AgentLog & ADR Status

- Plan/runbook mark P5.5b COMPLETE and gate P5.6 on a future encoder ADR. The
  runbook records that the short-raster refusal is covered by the pure fake-port
  suite (the real capture always returns exact dimensions) and is not fabricated
  in the browser.
- No new ADR was required. This is the P5.5b AgentLog entry.
  `AGENTS.md`/`CHANGELOG.md` untouched.

## 6. Project Model Impact

None. No `.ncp` schema change and no `shared-types` contract change.

## 7. Known Limitations & Technical Debt

- The browser harness binds a single committed CT fixture and therefore the
  plan/evidence/layers; a production composition root must derive those from the
  real workspace.
- The browser evidence covers only the default SwiftShader backend; hardware-GPU
  remains `NOT YET APPLICABLE`.
- A browser-side short-raster negative is intentionally omitted (unreachable
  through the real capture); that refusal is pure-tested.
- P5.6/P5.7 remain NOT YET IMPLEMENTED and P5.6 is gated on the encoder ADR. No
  publication raster encoder exists → image/pixel tolerance gate **NOT YET
  APPLICABLE**.

## 8. Exact Next Recommended Task

Draft and ratify the **encoder ADR** for P5.6 (library choice, colour profile,
compression, determinism, provenance), then implement TIFF/PNG flattened raster
composition over the P5.5 `PublicationRenderResult` panels and the figure-sheet
editorial layers. Do not add any encoder dependency before that ADR is Accepted.

---

## Independent Verdicts — P5.5b

- **`nuclear-reviewer` — PASS after CONCERNS resolved.** Initial review confirmed
  adapter fidelity, the boundary (test-only adapter; `sizeMm` amendment
  justified), real-harness evidence, honesty and file sizes, and raised two
  concerns: the plan/runbook/agentlog were not yet updated, and the runbook's
  short-raster browser bullet was unmet. Both were resolved in-slice: docs mark
  P5.5b COMPLETE, the runbook records that the short-raster refusal is pure-tested
  (unreachable through the real capture), the adapter now renders
  `request.medicalViewState`, and the browser test asserts temporary-target
  disposal.
- **`nuclear-qa` — PASS (all applicable gates), real browser evidence executed.**
  Scope isolation, `git diff --check`, `npm run typecheck`, focused **67/12**,
  browser suite **2/1**, `npm test` **627/114/0**, `npm run build`, pytest 411,
  mypy 77, file-length (`render-orchestrator.ts` 235 ≤ 250), and the browser
  assertions (1890×1890, byte length, live invariance, fail-closed `missing`).
  No unexpected deltas. Image/pixel tolerance gate **NOT YET APPLICABLE**.

---

# Planning Entry — ADR-015 (export encoder pipeline) proposed

Not an implementation slice. **`docs/decisions/ADR-015-export-encoder-pipeline.md`
is Proposed** to unblock P5.6/P5.7, per ADR-014 D5. It adds no dependency and no
code.

- Requirements: Node-safe/isomorphic/DOM-free; behind an encoder port;
  deterministic bytes; physical fidelity (no upscale); explicit sRGB; hybrid PDF
  (raster medical panel + native vectors); provenance; curated-fixture evidence.
- Candidates evaluated: PNG/TIFF via minimal writers over `node:zlib`
  (recommended) vs `upng-js`/`utif` vs native `sharp`; PDF via `pdf-lib`
  (recommended) vs `pdfkit` vs hand-rolled vs Chromium/`node-canvas` (rejected).
- Recommendation: **Track 1** — minimal PNG/TIFF writers + `node:zlib` and
  `pdf-lib`, no native binaries; **Track 2** (`upng-js` + `utif` + `pdf-lib`) as
  fallback; `sharp` deferred for v1.
- Open Decisions awaiting owner ratification: OD-6a (raster track), OD-6b (TIFF
  form), OD-6c (colour management), OD-6d (encoder location), OD-6e (PDF fonts),
  OD-6f (determinism policy), OD-6g (P5.7 scope).
- P5.6/P5.7 are marked **GATED on ADR-015** in the plan and runbook. No encoder
  dependency has been added and no composition code exists yet.
- Exact next step: owner ratifies ADR-015 (track + OD-6a…OD-6g), then implement
  P5.6 (raster flatten) behind the encoder port with byte-determinism and
  round-trip evidence.

---

# Slice Record — ADR-015 Accepted and P5.6 (raster flatten + reference encoders)

## 1. What Was Implemented

- **ADR-015 ratified (phase owner, 2026-09-23): Accepted — Track 1** with
  OD-6a…OD-6g defaults (minimal `node:zlib` writers; baseline TIFF + Deflate;
  declare sRGB/no ICC; composition-root adapter; PDF fonts = permissive
  open-source subset, Inter; strict determinism; P5.7 raster + native vectors).
- **Pure sheet compositor** (`compose-sheet.ts`): `PublicationCompositionPlan` +
  `composeSheetRgba`, which fills an opaque `#rrggbb` background and composites
  raster layers with deterministic alpha-over. It **never resamples** (a layer
  whose pixel dimensions differ from its mm destination at the plan DPI is
  refused), refuses overflow and malformed/non-physical input with typed
  `FIGURE_COMPOSITION_INVALID`, and never silently drops a layer.
- **Encoder port** (`encode-port.ts`): `PublicationRasterRequest`,
  `EncodedArtifact` (format, dimensions, colour profile, bytes, encoder
  identity) and `EncoderPort` (`encodePng`/`encodeTiff`) — renderer-neutral.
- **Reference encoders** (test infrastructure, composition-root shape per
  OD-6d): minimal deterministic **PNG** (IHDR/sRGB/gAMA/IDAT/IEND, fixed filter
  0, deflate level 9, CRC32) and **TIFF** (little-endian baseline, one Deflate
  RGB strip, fixed IFD order) writers over `node:zlib`, wired behind the port as
  `createReferenceEncoder`, plus test-only decoders.

## 2. Files Changed

Created:
- `packages/figure-engine/src/publication/encode-port.ts`
- `packages/figure-engine/src/publication/compose-sheet.ts`
- `tests/export/fixtures/png-writer.ts`
- `tests/export/fixtures/tiff-writer.ts`
- `tests/export/fixtures/reference-encoder.ts`
- `tests/export/compose-sheet.test.ts`
- `tests/export/raster-encoder.test.ts`

Modified:
- `docs/decisions/ADR-015-export-encoder-pipeline.md` — Status **Accepted** +
  Ratification Record (OD-6a…OD-6g resolved).
- `packages/figure-engine/src/publication/errors.ts` (`FIGURE_COMPOSITION_INVALID`)
- `packages/figure-engine/src/publication/index.ts` (barrel adds port + compositor)
- `docs/plans/PHASE_5_FIGURE_ENGINE_PLAN.md`,
  `docs/plans/PHASE_5_OPENCODE_RUNBOOK.md` (P5.6 READY; follow-ups named)
- `docs/agentlog/phase-5.md` — this handover.

Not modified: `shared-types`, `rendering-presets`, `medical-engine`,
`view-engine`, `project-model`, `ui`, `apps/*`, `python/`, `AGENTS.md`,
`CHANGELOG.md`.

## 3. Architectural Assumptions Made (boundary adherence)

- `figure-engine` stays pure and browser-safe: the barrel imports no
  `node:zlib`, no DOM and no third-party encoder; the writers live only in
  `tests/export/fixtures/` (the composition-root shape ratified by OD-6d, to be
  relocated to `apps/desktop` when it exists). The P5.5b browser bundle is
  therefore unaffected.
- Composition is deterministic integer source-over; no wall-clock, random IDs
  or resampling; the `EncoderPort` is the only encoding seam (ADR-014 D5).
- Scope is explicit: P5.6 delivers the **compositor + port + raster writers**.
  The figure-sheet **plan builder** and editorial **text/vector rasterization**
  are named follow-up sub-slices, not implied as done.

## 4. Tests Added & Executed

- `node --test "tests/export/*.test.ts"` → **8 tests / 2 suites, pass**:
  compositor background/alpha-over/no-resampling/overflow/boundary-fit/malformed
  refusals; PNG byte-determinism + CRC-validated decoder round-trip; TIFF
  byte-determinism + decoder round-trip; end-to-end compose→encode→decode;
  non-sRGB refusal in both formats.
- `node --test "tests/figure-engine/*.test.ts"` → **67/12, pass** (regression).
- `npm test` → **635 tests / 116 suites, 635 pass / 0 fail** (P5.6 adds 8; the 2
  browser tests remain green in this environment).
- `npm run typecheck` → **PASS**; `npm run build` → **PASS**.
- `npm run test:python` → **411 passed**; `npm run typecheck:python` → **clean,
  77 files**.
- File-length: largest new file `compose-sheet.ts` = **237** (≤ 250 Rule-02
  threshold); all touched files ≤ 300. `git diff --check` → clean.

## 5. Documentation, AgentLog & ADR Status

- ADR-015 **Accepted** with the ratification record. Plan/runbook mark P5.6
  READY with the two follow-up sub-slices named. This is the P5.6 AgentLog entry.
- `AGENTS.md`/`CHANGELOG.md` untouched.

## 6. Project Model Impact

None. No `.ncp` schema change and no `shared-types` contract change.

## 7. Known Limitations & Technical Debt

- **Plan builder pending**: nothing yet maps a `FigureSheet` + P5.5
  `PublicationRenderResult` into a `PublicationCompositionPlan`.
- **Text/vector rasterization pending**: annotations/typography are not yet
  rasterized into the flattened PNG/TIFF (needs a font/vector-rasterizer
  decision).
- Byte-determinism is scoped to the same `zlib` build; cross-version stability
  is not claimed (the encoder version is recorded in provenance).
- `EncodedArtifact` does not yet carry DPI and the PNG/TIFF writers embed no
  physical-resolution metadata (pHYs / XResolution); derivable from the plan.
- Test decoders are self-authored (now CRC-validating and structural); no
  independent third-party decoder is invoked.
- P5.7 remains NOT YET IMPLEMENTED; true image/pixel tolerance on real datasets
  remains **NOT YET APPLICABLE**.

## 8. Exact Next Recommended Task

Implement **P5.7** (hybrid vector PDF behind the `EncoderPort`, `pdf-lib`,
embedded permissive open-source font subset per OD-6e) and, in parallel or
before, the **figure-sheet plan builder** sub-slice so a real `FigureSheet` +
P5.5 rasters produce a `PublicationCompositionPlan`. Keep byte-determinism and
the no-resampling/no-upscale refusals as gates.

---

## Independent Verdicts — P5.6

- **`nuclear-reviewer` — PASS after CONCERNS resolved.** Confirmed boundary
  purity (no `node:zlib`/DOM in `figure-engine`; writers only in test
  infrastructure), compositor math, encoder port, writer structure and scope
  honesty. Findings resolved in-slice: MINOR-1 (huge finite `xMm` could be
  silently dropped), MINOR-2 (bare `TypeError` on malformed plan shapes),
  MINOR-3 (decoder now validates PNG CRCs and TIFF SamplesPerPixel), MINOR-4
  (plan-builder follow-up now named in plan/runbook); nits (TIFF non-sRGB test,
  exact-fit boundary, negative origin) addressed.
- **`nuclear-qa` — PASS (all 11 gates).** Scope isolation, `git diff --check`,
  `npm run typecheck`, focused **8/2** and **67/12**, `npm test` **634/116/0**
  (at QA time; 635 after the review nits), `npm run build`, pytest 411, mypy 77,
  file-length, and runtime spot-checks (byte-identical PNG/TIFF, decoder
  round-trips, resampling refusal, zero `node:zlib` imports under
  `figure-engine/src`). Image/pixel tolerance on real datasets **NOT YET
  APPLICABLE**.

---

# Slice Record — P5.6 plan builder (`buildPublicationCompositionPlan`)

## 1. What Was Implemented

- **Pure composition plan builder** (`plan-builder.ts`): maps a `FigureSheet`
  (panels with `PanelFramingState`/`PanelLayoutState` in mm) plus the P5.5
  `PublicationPanelRaster[]` into a `PublicationCompositionPlan` — the semantic →
  physical bridge (mm/layout → sheet pixels) that closes the export control flow.
  Each layer's pixel dimensions are the panel content aperture at the plan DPI,
  its `rectMm` is the panel's sheet rectangle, and layers follow ascending
  z-order so the compositor paints lowest-z first.
- **Structural validation extracted** (`plan-builder-validation.ts`, internal):
  sheet/panel/raster shapes are validated with typed `FIGURE_COMPOSITION_INVALID`
  refusals, so a malformed panel or raster never surfaces as a bare `TypeError`
  (the P5.6 compositor-review failure class is closed here too). Includes a pure
  RFC 4648 base64 decoder (no `Buffer`, no DOM) and duplicate-panel/raster
  detection.
- **Fail-closed where unratified**: the builder requires
  `framing.contentSizeMm === layout.sizeMm` (aperture-inside-panel placement is
  not yet ratified) and refuses non-zero rotation (ADR-014 OD-2); resampling,
  extra/missing/duplicate rasters, containment violations and malformed input are
  all typed refusals.

## 2. Files Changed

Created:
- `packages/figure-engine/src/publication/plan-builder.ts`
- `packages/figure-engine/src/publication/plan-builder-validation.ts`
- `tests/export/plan-builder.test.ts`

Modified:
- `packages/figure-engine/src/publication/index.ts` (barrel adds plan builder)
- `docs/plans/PHASE_5_FIGURE_ENGINE_PLAN.md`,
  `docs/plans/PHASE_5_OPENCODE_RUNBOOK.md` (plan builder delivered; aperture
  decision tracked; P5.6 COMPLETE with the two named follow-ups)
- `docs/agentlog/phase-5.md` — this handover.

Not modified: `shared-types`, `rendering-presets`, `medical-engine`,
`view-engine`, `project-model`, `ui`, `apps/*`, `python/`, `AGENTS.md`,
`CHANGELOG.md`.

## 3. Architectural Assumptions Made (boundary adherence)

- `figure-engine` remains pure/browser-safe: no `node:zlib`, `Buffer`, DOM or
  third-party encoder (the base64 decoder is a pure lookup-table implementation).
- The builder output is accepted by `composeSheetRgba` by construction: the
  aperture/panel equality requirement is exactly what makes the compositor's
  rect-vs-pixels no-resampling check pass.
- The aperture-inside-panel constraint is recorded as an **open decision**
  (plan/runbook), not a permanent contract.

## 4. Tests Added & Executed

- `node --test "tests/export/*.test.ts"` → **13 tests / 3 suites, pass** (5 new
  plan-builder tests): mapping values, end-to-end `build → composeSheetRgba`,
  z-order, and refusals for missing/extra/duplicate rasters, resampling,
  byteLength mismatch, invalid dpi/background, null/malformed sheet, malformed
  panel/raster (asserted not a bare `TypeError`), non-zero rotation,
  aperture/panel mismatch and panel-outside-sheet.
- `node --test "tests/figure-engine/*.test.ts"` → **67/12, pass** (regression).
- `npm test` → **640 tests / 117 suites, 640 pass / 0 fail**.
- `npm run typecheck` → **PASS**; `npm run build` → **PASS**.
- `npm run test:python` → **411 passed**; `npm run typecheck:python` → **clean,
  77 files**.
- File-length: `plan-builder.ts` **133**, `plan-builder-validation.ts` **187**
  (both ≤ 250); all touched files ≤ 300. `git diff --check` → clean.

## 5. Documentation, AgentLog & ADR Status

- Plan/runbook mark the plan builder delivered and P5.6 COMPLETE, with the two
  explicit follow-ups (aperture placement decision; text/vector rasterization).
- No new ADR required. This is the plan-builder AgentLog entry.
  `AGENTS.md`/`CHANGELOG.md` untouched.

## 6. Project Model Impact

None. No `.ncp` schema change and no `shared-types` contract change.

## 7. Known Limitations & Technical Debt

- **Aperture-inside-panel placement** is unratified; the builder requires the
  aperture to equal the panel rectangle and refuses otherwise.
- **Text/vector rasterization** into the flattened PNG/TIFF is not implemented.
- The builder ignores `raster.colorProfile`/`renderer` (the plan contract has no
  provenance field; sRGB is declared at the encoder port per OD-6c).
- mm-inclusive containment and px-exact composition can disagree at fractional-mm
  sheet edges; the compositor refuses fail-closed, but a doc note is warranted.
- No image/pixel tolerance on real datasets → **NOT YET APPLICABLE**.

## 8. Exact Next Recommended Task

Implement **P5.7** (hybrid vector PDF behind the `EncoderPort`, `pdf-lib`,
embedded permissive open-source font subset per OD-6e), consuming the now-stable
`PublicationCompositionPlan`. Keep byte-determinism, no-resampling and
vector-preservation as gates. The two P5.6 follow-ups (aperture placement;
text/vector rasterization) remain tracked.

---

## Independent Verdicts — P5.6 plan builder

- **`nuclear-reviewer` — PASS after CONCERNS resolved.** Confirmed mapping
  fidelity, compositor compatibility, purity/boundary and the honest
  aperture-equals-panel fail-closed choice. MAJOR-1 (malformed panel/raster
  surfaced as a bare `TypeError`) was fixed by extracting
  `plan-builder-validation.ts` with typed refusals; MINOR-1 (missing refusal
  tests: duplicate raster, byteLength mismatch, containment through the builder,
  malformed shapes) was closed; MINOR-2 (aperture decision under-tracked) is now
  recorded in plan/runbook.
- **`nuclear-qa` — PASS (all 11 gates).** Scope isolation, `git diff --check`,
  `npm run typecheck`, focused **13/3** and **67/12**, `npm test` **640/117/0**,
  `npm run build`, pytest 411, mypy 77, file-length, and runtime spot-checks
  (180×120 plan, layer rect 20,20,80×80, compose pixel at (20,20), missing/
  resampled raster refused, zero `node:*`/Buffer/DOM under `figure-engine/src`).
  Image/pixel tolerance on real datasets **NOT YET APPLICABLE**.

---

# Slice Record — P5.7 (hybrid vector PDF)

## 1. What Was Implemented

- **Ratified dependencies installed (ADR-015 Track 1).** `pdf-lib@1.17.1` and
  `@pdf-lib/fontkit@1.1.1` were added as exact-pinned root devDependencies (the
  concrete encoder is composition-root-shaped test infrastructure per OD-6d; the
  `figure-engine` barrel stays free of pdf-lib/DOM/`node:*`). The **Inter
  Regular** TTF (SIL OFL 1.1) is vendored at
  `tests/export/fixtures/fonts/Inter-Regular.ttf` with `OFL.txt` (OD-6e).
- **Pure PDF physical units** (`pdf-units.ts`): `PT_PER_INCH = 72`,
  `mmToPoints`/`pointsToMm` (`(mm / 25.4) * 72`), the explicit y-down→PDF
  bottom-left flip `pdfPointsFromSheetY`, and `pdfRectFromSheetRect` anchored at
  the rect's **lower-left**. Non-finite lengths / non-positive sheet heights or
  sizes are typed `FIGURE_UNITS_INVALID` refusals, never clamped. The sheet
  rectangle type is reused from `layout.ts` (single source of truth).
- **Hybrid PDF document contract** (`pdf-document.ts`): the pure
  `PublicationPdfRequest` (sheet mm + DPI + nominal pixel dimensions, raster
  layers, native `PublicationVectorLayer`s — text/rect/line in sheet mm,
  declared metadata) and `buildPublicationPdfRequest(plan, editorial)`, which
  re-validates the plan and all layers, validates the vectors/metadata, omits
  opacity-0 layers (OD-4) and returns a frozen request. No `pdf-lib`, no DOM.
- **Shared plan/layer validation** (`composition-validation.ts`, added during
  review): the single source of truth for plan + per-layer checks
  (shape, RGBA8 length, no-resampling at the plan DPI, sheet containment). The
  P5.6 compositor (`compose-sheet.ts`) and the P5.7 PDF builder both use it, so a
  hand-built/mutated plan cannot smuggle a below-density raster into the PDF path.
- **Encoder port extension** (`encode-port.ts`): `EncodedArtifact.format` gains
  `'pdf'`; `EncoderPort.encodePdf(request: PublicationPdfRequest)` is added. For
  a PDF, `pixelDimensions` is the nominal full-sheet raster at the plan DPI
  (provenance only) and `colorProfile` is `'srgb'`.
- **Reference `pdf-lib` adapter** (`tests/export/fixtures/pdf-writer.ts`,
  composition-root shape): `updateMetadata: false`; explicit payload metadata and
  `/Producer`; `CreationDate`/`ModDate` only when the payload supplies a
  parseable date (pdf-lib serialises UTC `D:…Z`); the full-page opaque background
  as a native rect; each panel raster as exactly one image XObject placed at its
  exact physical PDF rect; text/rect/line as native operators using the embedded
  Inter subset (`/FontFile2`); a deterministic `/ID` = the two halves of a
  SHA-256 over a canonical request hash; `save({ useObjectStreams: false,
  addDefaultPage: false })` for stable object order. No wall-clock, randomness,
  locale or resampling.
- **Test-only PDF inspector** (`tests/export/fixtures/pdf-inspector.ts`):
  dependency-free parsing of the Flate content streams, image XObjects, trailer
  `/ID` and Info dictionary, plus a `q`/`Q`/`cm`/`Do` matrix evaluator and `Tm`
  text-origin reader for exact geometric assertions.

## 2. Files Changed

Created:
- `packages/figure-engine/src/publication/pdf-units.ts` (94)
- `packages/figure-engine/src/publication/pdf-document.ts` (135)
- `packages/figure-engine/src/publication/pdf-document-validation.ts` (193)
- `packages/figure-engine/src/publication/pdf-validation-primitives.ts` (135)
- `packages/figure-engine/src/publication/composition-validation.ts` (233)
- `tests/export/fixtures/pdf-writer.ts` (250)
- `tests/export/fixtures/pdf-inspector.ts` (228)
- `tests/export/fixtures/fonts/Inter-Regular.ttf`, `…/OFL.txt`
- `tests/export/pdf-units.test.ts` (83)
- `tests/export/pdf-document.test.ts` (245)
- `tests/export/pdf-encoder.test.ts` (201)

Modified:
- `package.json`, `package-lock.json` — exact devDeps `pdf-lib`, `@pdf-lib/fontkit`.
- `packages/figure-engine/src/publication/{errors,encode-port,index}.ts` —
  `FIGURE_PDF_DOCUMENT_INVALID`, `encodePdf`/`format: 'pdf'`, barrel exports.
- `packages/figure-engine/src/publication/compose-sheet.ts` — now delegates to
  `composition-validation.ts`; `assertPublicationCompositionPlan` re-validates all
  layers (P5.6 behaviour preserved, 118 lines).
- `tests/export/fixtures/reference-encoder.ts` — `encodePdf` wired into the port.
- `docs/decisions/ADR-015-…md` — Implementation Note (P5.7 port shape/determinism).
- `docs/plans/PHASE_5_FIGURE_ENGINE_PLAN.md`,
  `docs/plans/PHASE_5_OPENCODE_RUNBOOK.md` — P5.7 COMPLETE; follow-up (c) tracked.
- `docs/agentlog/phase-5.md` — this handover.

Not modified: `shared-types`, `rendering-presets`, `medical-engine`,
`view-engine`, `project-model`, `ui`, `apps/*`, `python/`, `AGENTS.md`,
`CHANGELOG.md`, the Fase-1 oracle.

## 3. Architectural Assumptions Made (boundary adherence)

- The concrete `pdf-lib` writer lives only in `tests/export/fixtures/` (the
  composition-root shape; ADR-014 D5/ADR-015 OD-6d). `packages/figure-engine/src`
  imports no `pdf-lib`/`@pdf-lib`, no `node:*`, no DOM, no Cornerstone and no
  `medical-engine`; the package graph stays acyclic and its dependency list is
  unchanged.
- The PDF is genuinely hybrid: only the medical panel is a raster XObject;
  supplied text/rect/line are native operators with the embedded font and are
  never rasterized; the whole page is never flattened.
- Physical mm is primary; the pt conversion and y-flip are explicit and exact
  (`String(mmToPoints(...))` asserted). Panel rasters are placed at their exact
  physical rectangle with unchanged pixel dimensions — no resampling/upscale.
- Determinism (OD-6f): fixed metadata, payload-only dates, explicit `/Producer`,
  content-hash `/ID`, fixed object order; two encodes are byte-identical.
- No editorial/clinical behaviour was invented: only caller-supplied primitives
  are emitted. Mapping `FigureSheet` typography/decorations/annotations into
  vectors is follow-up (c), not implemented.

## 4. Tests Added & Executed

- `node --test "tests/export/*.test.ts"` → **30 tests / 6 suites, 30 pass / 0
  fail** (16 new P5.7: 5 units + 6 document incl. the review regression + 6
  encoder; 13 pre-existing P5.6 + 1). Coverage: exact mm↔pt and y-flip; frozen
  request; opacity-0 omission; metadata/vector/colour/opacity/size/out-of-sheet/
  non-object typed refusals (never `TypeError`); unparseable-date refusal;
  hand-built-plan resample/overflow/wrong-length refusals; byte-determinism;
  one image XObject at the exact pt rect; native `Tj` + `/FontFile2`, no
  `DCTDecode`/`JPXDecode`; exact text origin; `/ID` = request-hash halves;
  explicit metadata/Producer and no dates when omitted.
- `node --test "tests/figure-engine/*.test.ts"` → **67/12, pass** (regression;
  no P5.1–P5.6 behaviour changed by the shared-validation refactor).
- `npm test` → **657 tests / 120 suites, 657 pass / 0 fail**.
- `npm run typecheck` → **PASS**; `npm run build` → **PASS**.
- `npm run test:python` → **411 passed**; `npm run typecheck:python` → **clean,
  77 files**.
- File-length: largest package source `request-validation.ts` = 268 (≤ 250–300);
  new `composition-validation.ts` 233; `pdf-writer.ts` 250 (test infrastructure,
  at the ≤ 250 threshold). `git diff --check` → clean.

## 5. Documentation, AgentLog & ADR Status

- ADR-015 gained the P5.7 Implementation Note (formalised `encodePdf` port,
  determinism, font, tracked follow-up); no decision changed.
- Plan/runbook mark P5.7 COMPLETE and track follow-up (c)
  (FigureSheet→`PublicationVectorLayer` mapping) so the "Vector PDF" gate is
  scoped to the emission **mechanism**, not FigureSheet content.
- `AGENTS.md`/`CHANGELOG.md` intentionally untouched.

## 6. Project Model Impact

None. No `.ncp` schema change and no `shared-types` contract change.

## 7. Known Limitations & Technical Debt

- **Follow-up (c) open:** `FigureSheet` panel letters/captions, decoration
  borders, scalebars, measurement ticks and annotation kinds are **not** mapped
  to vectors (needs ratified editorial/geometry semantics; arrow heads, ROI
  rotation and text-box alignment are unratified). P5.7 emits caller-supplied
  primitives only.
- **Follow-ups (a)/(b) remain:** aperture-inside-panel placement; PNG/TIFF
  text/vector rasterization.
- `/ID` is derived from the canonical request, not the final emitted bytes, and
  does not cover `PdfWriterOptions`; the reference adapter always embeds the
  vendored Inter, so the font is constant (documented in the writer).
- `pdf-writer.ts` sits at the 250-line ceiling; a production `apps/desktop`
  adapter should be a distinct module, not a growth of this fixture.
- Colour is declared sRGB with no embedded ICC and font embedding is a subset of
  one vendored family (v1 scope per OD-6c/OD-6e).
- No real-dataset image/pixel-tolerance gate → **NOT YET APPLICABLE**.

## 8. Exact Next Recommended Task

Proceed to **P5.8** (independent phase review, configured gates and the final
eight-point phase handover), explicitly carrying follow-ups (a)/(b)/(c) and
scoping the "Vector PDF" completion gate to the delivered emission mechanism.

---

## Independent Verdicts — P5.7

- **`nuclear-reviewer` — PASS after two MEDIUM findings resolved.** Initial
  review confirmed coordinate-system discipline, vector preservation, OD-6f
  determinism, boundary purity, fail-closed negatives, file sizes and docs
  honesty, and raised: **M1** `assertPublicationCompositionPlan` only validated
  the plan, not the per-layer no-resampling/containment rules, while its JSDoc
  claimed otherwise (a hand-built plan could reach the PDF adapter and be
  stretched); **M2** the FigureSheet content→vectors follow-up was not tracked,
  so the phase "Vector PDF" gate would overclaim. Resolution in-slice: the
  per-layer checks were extracted to a shared `composition-validation.ts` used by
  both the compositor and the PDF builder, `assertPublicationCompositionPlan` now
  re-validates every layer, and a regression test asserts a hand-built 40×40 px /
  80×80 mm plan, an off-sheet layer and a wrong RGBA8 length are refused; the
  follow-up (c) is now recorded in the plan, runbook and ADR-015, and the gate
  row scopes itself to the mechanism. LOW items were reworded/documented/removed
  (date-message honesty, `/ID` scope, raster freeze rationale, opacity-0 note,
  shared `isRecord`). Bounded re-review: **PASS**, all checks verified against
  the current tree (30/6, 657/120, purity, sizes, docs).
- **`nuclear-qa` — PASS (all applicable gates), twice.** Independently ran scope
  isolation, `git diff --check`, `npm run typecheck`, focused **30/6** and
  **67/12**, `npm test` **657/120/0**, `npm run build`, pytest 411, mypy 77,
  file-length, and an independent reproduction (own script): byte-identical PDF
  encodes, one 80×80 image XObject placed at `x=(20/25.4)*72`,
  `y=((120−100)/25.4)*72`, `w=h=(80/25.4)*72`, native `Tj` + `/FontFile2`, no
  `DCTDecode`/`JPXDecode`, `/ID` = request-hash halves, explicit metadata with no
  dates when omitted and `D:20260923000000Z` when supplied, and the three
  hand-mutated-plan refusals as typed `FIGURE_COMPOSITION_INVALID` (never
  `TypeError`). Zero flakes. Real-dataset image/pixel-tolerance gate **NOT YET
  APPLICABLE**.

---

# Planning Entry — follow-up (c) audit and ADR-016 (editorial vector mapping) proposed

Not an implementation slice. Follow-up **(c)** was audited against the frozen
editorial contracts, `NUCLEAR_ARCHITECTURE_V3.md` §21–§26/§30 and the P5.x
ratified transforms. The P5.7 emission mechanism is complete, but the
`FigureSheet` → `PublicationVectorLayer` mapping is **semantically
under-specified**, so implementing it now would violate Rule 01 (no invented
geometry) and the plan's stop condition.

- **Determined:** panel background (panel sheet rect + colour) — still needs a
  paint-order decision; panel border path/width/colour — still needs a
  stroke-alignment and dash-pattern decision; `line` endpoints — still needs
  optional-stroke defaults and patient-endpoint projection; ROI geometry — needs
  ellipse/polygon primitives the emitter does not yet have.
- **Under-specified (no source resolves it):** label/caption and text-box
  anchors, padding/alignment, `fontFamily` (only one embedded Inter face),
  `weight: 'bold'`, dashed/dotted patterns, arrowhead geometry, scalebar/measurement
  tick geometry, number formatting, and the editorial paint order. Architecture
  §30 itself scopes native vectors to semantics that "lo consentono".
- **`docs/decisions/ADR-016-editorial-vector-mapping.md` is Proposed** with
  OD-7a…OD-7j (options + a recommended A-set) and an empty Ratification Record.
  No code, dependency or contract change is added by the record.
- Plan/runbook now gate follow-up (c) on ADR-016 ratification.
- **Status: follow-up (c) BLOCKED pending owner ratification** (not NOT YET
  APPLICABLE and not PASS). On ratification the slice is a bounded pure
  `buildEditorialVectorLayers(figureSheet, context)` plus an `ellipse`/`polygon`
  emitter extension, with per-kind fail-closed tests.
- Exact next step: the phase owner ratifies or amends OD-7a…OD-7j; then implement
  (c), then P5.8.
