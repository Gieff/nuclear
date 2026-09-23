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
