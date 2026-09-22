# Handover Report — Phase 2B.1: `SpatialTransform` Worker Operation Registration & Evidence Schema

Authority for this slice:
[`docs/plans/PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md`](../plans/PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md)
(slice 2B.1) and [`ADR-002`](../decisions/ADR-002-scientific-worker-stdio-json-rpc.md).

> **Scope note on the working tree.** During this task a **parallel P4.6 agent**
> wrote unrelated uncommitted `packages/view-engine/**` and
> `tests/view-engine/**` changes into the same working directory (the tree was
> clean at the start of this task). Those files are **not part of this slice**,
> were never touched by the 2B.1 implementer, and are **excluded** from this
> report, from the 2B.1 commit and from the 2B.1 test-count attribution.

## 1. What Was Implemented

Phase 2B.1 registers the inter-study registration operation and freezes its
request/evidence schema. **No registration algorithm was implemented:** the
handler validates the schema fail-closed and then raises the reserved
`OPERATION_NOT_IMPLEMENTED` (`-32011`) error. It never produces a transform,
matrix, provenance or residual. Mutual Information / SimpleITK (2B.3) and
Procrustes (2B.2) remain out of scope.

- **Worker operation.** `nuclear.registration` registered in
  `python/worker/dispatch.py::build_dispatcher` alongside `geometry`,
  `compatibility` and `suvbw`, so the handshake `operations` list and the
  unknown-method `supportedMethods` list include it automatically.
- **Reserved error code.** `OPERATION_NOT_IMPLEMENTED = -32011` added to
  `python/worker/protocol.py` (`NUCLEAR_RESERVED_CODES`, `ERROR_MESSAGES`) and
  mirrored as `NUCLEAR_OPERATION_NOT_IMPLEMENTED` in the TS protocol module.
  It sits inside the ADR-002 reserved server range `-32000..-32099`.
- **Request schema (fail-closed).** Mode-discriminated `nuclear.registration`:
  - common: `mode: "rigid" | "landmarks"`, caller-declared
    `transformId` (opaque) and `outOfDomainBehavior: "clamp" | "hide" | "warn"`,
    both validated and **preserved verbatim, never defaulted**;
  - `rigid`: `fixed` and `moving` asset references (`{ locator, seriesInstanceUID }`)
    validated through the existing `dicom.locators.parse_locator`;
  - `landmarks`: `sourceFrameOfReferenceUID` / `targetFrameOfReferenceUID`
    plus an ordered `landmarks` array of ≥ 3 `{ source: [x,y,z], target: [x,y,z] }`
    pairs with finite, non-boolean coordinates.
  Unknown keys are ignored (consistent with the geometry/quantitation handlers).
  Landmark degeneracy (collinear/coincident) is deliberately deferred to 2B.2/2B.4.
- **Success evidence schema (defined now, produced by 2B.2+).** A worker
  `transform` object faithful to the accepted `shared-types` `SpatialTransform`
  (`id` echo, source/target FoR, `transformType`, 16-element `matrix4x4`,
  `units: "mm"`, `provenance`, `validity{isValid, errorMarginMm,
  outOfDomainBehavior}`) plus top-level `workerMetadata`. **No `shared-types`
  extension was needed** (no genuine gap), so no validator/fixture was added
  there.
- **TypeScript bridge surface (no `view-engine` coupling).** Typed
  request/response contracts, a pure serializer and a fail-closed evidence
  mapper, wired through `ScientificWorkerBridge.registration()`.

## 2. Files Changed / Created

Created:
- `python/dicom/registration_schema.py` — request schema + `RegistrationRequest`.
- `python/dicom/registration_operations.py` — thin validate-then-refuse handler.
- `python/tests/test_registration_operations.py` — 18 pytest cases.
- `packages/medical-engine/src/worker/registration-types.ts` — typed request/result.
- `packages/medical-engine/src/worker/mapping-registration.ts` — serializer + mapper.
- `tests/medical/worker-registration.test.ts` — real-worker round-trip + wire-shape tests.
- `docs/agentlog/phase-2b.md` — this report.

Modified:
- `python/worker/protocol.py` — `REGISTRATION_METHOD`, `-32011`.
- `python/worker/dispatch.py` — register `nuclear.registration`.
- `python/dicom/__init__.py` — module list docstring.
- `python/tests/test_worker_handshake.py` — expected operations list.
- `python/tests/test_worker_envelope.py` — expected `supportedMethods` list.
- `tests/fixtures/protocol/response.handshake.json` — handshake `operations`.
- `tests/fixtures/protocol/error.unknown-method.json` — `supportedMethods`.
- `packages/medical-engine/src/worker/protocol.ts` — method constant, required
  operations, `-32011`.
- `packages/medical-engine/src/worker/narrowing.ts` — `matrix4x4` helper.
- `packages/medical-engine/src/worker/bridge.ts` — `registration()` query.
- `packages/medical-engine/src/worker/index.ts` — barrel exports.
- `tests/medical/fixtures/fake-worker.mjs` — advertises the new operation.

Not modified: `@nuclear/shared-types`, `@nuclear/view-engine`, `@nuclear/ui`,
`figure-engine`, `project-model`, `apps/**`, `CHANGELOG.md`, any ADR.

## 3. Architectural Assumptions Made

- **ADR-002 remains the transport authority.** The worker owns scientific
  interpretation; TypeScript only validates envelopes/schema, copies values
  verbatim and never computes (the engine no-`Math` source-integrity scan still
  passes).
- **`transformId` and `outOfDomainBehavior` are caller-declared, not computed.**
  The worker echoes them; this avoids inventing an opaque id scheme or a
  rendering policy. Per ADR-012 §6 the link declares `outOfDomainBehavior`, and
  there is no implicit default. ADR-012 is referenced read-only and **not** a
  dependency.
- **`SpatialTransform.validity.errorMarginMm` is the worker's advisory residual**
  (evidence, not an acceptance decision). `InterStudyLink.toleranceMm` stays
  caller-declared and is never applied by the worker (ADR-012 R-1 alignment).
- **The operation name is a candidate, not a ratified constant.** `2B.0`
  naming/evidence-shape/tolerance decisions remain open (see §7).
- **Boundary adherence:** no `view-engine`/UI/figure/project-model import or
  edit; no second renderer; source files decomposed per Rule 02 (a 270-line
  first draft was split into a schema module + a thin handler).

## 4. Tests Added & Executed

Gates re-run by the orchestrator and independently by `nuclear-qa` on the same
uncommitted tree:

| Gate | Command | Result |
| --- | --- | --- |
| Python tests | `npm run test:python` | **207 passed** (baseline 189, **+18**) |
| Python typecheck | `npm run typecheck:python` | **Success, 50 source files** (baseline 47) |
| TS typecheck | `npm run typecheck` | **0 errors** |
| Test suite | `npm test` | **423 pass / 0 fail / 79 suites** (baseline 404/75; **+4 tests/+2 suites = 2B.1**, +15/+2 = parallel P4.6) |
| Build | `npm run build` | **clean** |
| Isolated 2B.1 | `node --test tests/medical/worker-registration.test.ts` | **4/4 pass** |

Evidence:
- 18 Python cases: 2 positive shape (valid `rigid`/`landmarks` → `-32011` with
  `data == {diagnostic, mode, phaseSlice}` and no transform/matrix), 13 genuine
  fail-closed negatives (missing/unknown mode, missing/empty `transformId`,
  invalid `outOfDomainBehavior`, missing `moving`, malformed locator, 2 landmark
  pairs, wrong triple length, NaN coordinate, boolean coordinate, empty FoR),
  2 envelope round-trips and 1 handshake-registration assertion.
- 4 TS cases: real-worker handshake advertises `nuclear.registration`; valid
  request → typed `-32011` with no fabricated transform/matrix; invalid mode →
  `-32602`; `mapRegistrationResult` wire-shape identity mapping (absent residual
  omitted), 15-element matrix → `WorkerContractError`, and exact serialization
  of both request modes.
- **Independent review (`nuclear-reviewer`): PASS**, all eight checklist axes
  verified against the real files; non-blocking notes only.
- **Independent QA (`nuclear-qa`): CODE VERIFICATION PASS**; raw worker-stdio
  JSON cited for the handshake, `-32011` and `-32602`. Its single open item was
  the missing agentlog entry, which this report resolves.

## 5. Documentation, Agentlog & ADR Status

- This report satisfies the AgentLog Gate for slice 2B.1.
- `CHANGELOG.md` was **not** touched (raw handover notes must never enter it;
  ADR-001). A `feat(medical-engine)` capability bullet can be promoted at
  release time via `/promote-changelog`.
- No ADR was created or modified. ADR-012 remains **Proposed** and was not made
  a dependency. ADR-002 already governs the transport and needs no change.

## 6. Project Model Impact

- None. No `.ncp` schema, `SpatialTransform`/`TransformProvenance` contract,
  fixture manifest or serialized state changed. The new operation lives at the
  worker/IPC boundary only; persistence and figure state are unaffected.

## 7. Known Limitations & Technical Debt

- **2B.0 ratification still open (candidate values, not asserted):** the
  operation name (`nuclear.registration` with `mode`, chosen here provisionally)
  and the candidate tolerances 2B-T1..T4 marked `[TO RATIFY]`. No numeric
  tolerance is hard-coded anywhere in this slice.
- **The success path is currently unreachable** against the real worker (the
  operation always refuses with `-32011`); `mapRegistrationResult` is validated
  only against an explicitly labelled wire-shape object. It must not be read as
  clinical-evidence validation; real evidence semantics arrive with 2B.2–2B.4.
- **Rigid mode carries no FoR UIDs** in the request; FoR provenance must be
  derived from the loaded geometry evidence in 2B.3/2B.4.
- **`REQUIRED_WORKER_OPERATIONS` now includes `nuclear.registration`:** a worker
  binary predating 2B.1 will fail the handshake while still speaking protocol
  `1.0`. This follows the established in-repo lockstep model and warrants a
  changelog line.
- **Deferred by design:** Procrustes (2B.2), Mutual Information (2B.3), evidence
  validity / `errorMarginMm` / fail-closed FoR checks (2B.4), and independent
  verification/handover (2B.5). ADR-012 R-1..R-4 and OD-1..OD-6 remain open;
  P4.4b is not implemented here.

## 8. Exact Next Recommended Task

Ratify the 2B.0 decisions (operation name + evidence shape + tolerances
2B-T1..T4), then implement **slice 2B.2 — Procrustes manual-landmark
registration**: replace the `-32011` stub on the `landmarks` path with the
optimal rigid transform plus its exact-correspondence tolerance and
degenerate-input refusal, reusing this slice's schema and the
`SpatialTransform` evidence contract. Do not start 2B.3 before 2B.2 review/QA.

## Addendum — Phase Owner Review (2026-09-22)

The phase owner independently re-verified slice 2B.1 and approved commit
`1dbe540` as **PASS — IPC contract and schema registered**. The owner
explicitly does **not** treat it as scientific validation of registration, as
sufficient evidence for P4.4b, or as closure of the Phase 2B addendum.

Owner-reported independent evidence: focused Python **38/38**; TS real-worker
**4/4**; mypy **50 files clean**; `1dbe540` isolated to **19 files** with no
`shared-types` or `view-engine` change.

### Binding pre-2B.2 acceptance conditions (recorded verbatim from the owner)

Before slice 2B.2 is implemented, the following must hold:
- Procrustes must **refuse degenerate inputs**.
- The result must be a **rigid** transform `P_target = M · P_source`.
- The residual must have **ratified semantics and tolerance**.
- The **success path must be verified through the real worker** (not only a
  wire-shape object).
- Evidence **without clinical validity must not reach `view-engine`**.

These become gate criteria for 2B.2/2B.3/2B.4 and are **not yet satisfied**.

### Partial ratification (phase owner, 2026-09-22)

**Ratified now.** R1 (one op `nuclear.registration` + `mode`); R2 (output
`SpatialTransform`, `errorMarginMm` advisory, `transformId`/`outOfDomainBehavior`
caller-declared); R3 (2B-T1: RMS ≤ 0.5 mm / rotation ≤ 0.5°) and R5 (2B-T3:
≤ 1e-6 mm / ≤ 1e-6°) **as fixture criteria only**, with ratified measurement
conventions (RMS **and** maximum point error; geodesic rotation error of
`R_recovered · R_groundtruthᵀ`; LPS mm **row-major** 4×4; strict
`P_target = M · P_source`); R7 (same FoR refused in scientific validation, not
the IPC schema); R8 (mapper semantic checks are a blocking 2B.4 gate); R9
(lockstep `protocolVersion "1.0"`; release-changelog compatibility decision).
Recorded in `docs/plans/PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md` §2B.0
Ratification Record.

**Still `[TO RATIFY]`.** R4 / 2B-T2 — MI determinism protocol (SimpleITK
version, initialisation, seed, metric sampling, max iterations, stopping
criterion, multi-thread behaviour); does **not** block 2B.2. R6 numeric bound —
`κ = 1e6` is only a **candidate**; the structural refusals (`<3`/coincident/
collinear) are ratified, the numeric threshold is ratified only after a
degeneracy sensitivity test, post-2B.2 review/QA.

### Additional owner conditions carried forward

- `mapRegistrationResult` semantic checks (`isValid === true`,
  `errorMarginMm >= 0`, distinct source/target FoR, `transformType`↔matrix
  coherence, homogeneous last matrix row) are an explicit **2B.4 blocking
  criterion** before any consumer (P4.4b) may use the evidence.
- Adding `nuclear.registration` to `REQUIRED_WORKER_OPERATIONS` under an
  unchanged `protocolVersion "1.0"` makes pre-2B.1 workers incompatible; this is
  a recorded **compatibility decision** to be surfaced in the release changelog,
  and a blocker for any mixed worker/bridge distribution.
- Repo-wide `npm test` / `build` figures are shared with the uncommitted P4.6
  worktree and must be **re-run after P4.6 is committed or separated** before
  they are attributed to 2B.1 alone.
- ADR-012 may stay **Proposed** during 2B.2 but must be **Accepted** before
  P4.4b is implemented.

_Status: architectural decisions R1/R2/R7/R8/R9 and the fixture criteria R3/R5
are ratified; R4 (MI determinism) and the R6 numeric degeneracy bound remain
`[TO RATIFY]`._

# Handover Report — Phase 2B.2: Manual Landmark Registration (Procrustes)

## 1. What Was Implemented

The `landmarks` path of `nuclear.registration` now performs real, deterministic
scientific computation; the `rigid` path is unchanged.

- **Orthogonal Procrustes / Kabsch** (`python/dicom/registration_math.py`): given
  `n ≥ 3` ordered correspondences in LPS mm, centre both sets,
  `H = Sᵀ T = U Σ Vᵀ`, recover the **proper rigid** transform
  `R = V·diag(1,1,det(V Uᵀ))·Uᵀ`, `t = t̄ − R s̄`, and compute the residual
  `e_i = ||R s_i + t − t_i||` (RMS and maximum). Pure math: no I/O, no clock, no
  DICOM types.
- **Strict convention**: `P_target = M · P_source`, points column vectors in
  patient LPS mm, homogeneous 4×4 stored **row-major** with last row
  `[0 0 0 1]`, flattened to 16 finite numbers.
- **Handler dispatch** (`registration_operations.py`): `landmarks` → scientific
  validation + evidence; `rigid` → unchanged reserved `-32011` stub (MI is 2B.3;
  no SimpleITK added).
- **R7 same-Frame-of-Reference** refused in scientific validation (not the IPC
  schema) with a typed `-32012`.
- **R6 structural refusals**: fewer than 3 correspondences (schema), coincident
  points and collinear points (centred rank < 2). The numeric near-degeneracy
  bound remains a single unwired `[TO RATIFY]` candidate.
- **Reflection fail-closed**: an improper best-fit orthogonal map
  (`det(V Uᵀ) < 0`) is refused as `reflection-required`, never silently mirrored.
- **Reserved code `-32012 REGISTRATION_INVALID`** (Python `NUCLEAR_RESERVED_CODES`
  + `ERROR_MESSAGES`; TS `NUCLEAR_REGISTRATION_INVALID`), data keys exactly
  `{diagnostic, mode, reason}`; reasons `same-frame-of-reference`,
  `degenerate-landmarks`, `reflection-required`.

## 2. Files Changed / Created

Created:
- `python/dicom/registration_math.py` (186) — Procrustes + residual + structural degeneracy + reflection guard.
- `python/tests/synthetic_registration.py` (128) — deterministic curated landmarks + documented ground truth.
- `python/tests/registration_procrustes_support.py` (134) — pure-Python independent recomputation + request builders.
- `python/tests/test_registration_procrustes.py` (218) — R3/R5, convention, residual, determinism, refusals, sensitivity.
- `tests/medical/fixtures/worker-registration-requests.ts` (115) — TS request builders + inline wire-shape evidence.

Modified:
- `python/dicom/registration_operations.py` — mode dispatch, clock, evidence, `-32012`.
- `python/worker/dispatch.py` — pass `dispatcher.clock`.
- `python/worker/protocol.py` — `-32012`.
- `python/tests/test_registration_operations.py` — landmarks now succeeds; `rigid` `-32011` and all schema negatives kept.
- `packages/medical-engine/src/worker/protocol.ts` — `-32012` mirror.
- `tests/medical/worker-registration.test.ts` — real-worker success round-trip + `-32012` refusals + `rigid` stub.
- `docs/agentlog/phase-2b.md` — this handover.

Not modified: `@nuclear/shared-types`, `view-engine`, `ui`, `figure-engine`,
`project-model`, Fase 4 code, `tests/view-engine/**`, `tests/fixtures/manifest.json`,
`python/pyproject.toml`, ADR-012.

## 3. Architectural Assumptions Made

- ADR-002 remains the transport authority. The Procrustes formula lives **only**
  in Python; TypeScript mirrors only the error constant and maps the evidence. No
  formula is duplicated.
- The evidence reuses the accepted `SpatialTransform` contract; `errorMarginMm`
  carries the **RMS**; the **maximum** residual is carried in
  `workerMetadata.parameters` (`rmsPointErrorMm`, `maxPointErrorMm`) so the wire
  `transform` shape is unchanged. Any consumer may only treat it as advisory.
- Degeneracy is enforced with **structural** criteria only (`σ₂ ≤ 0` exactly,
  `det(V Uᵀ) < 0`). The numeric condition-number candidate is deliberately not
  wired, pending R6 ratification.
- NumPy (2.5.3, already declared) is typed `NDArray[np.float64]`; mypy strict is
  clean with zero `type: ignore`.

## 4. Tests Added & Executed

| Gate | Command | Result |
| --- | --- | --- |
| Python tests | `npm run test:python` | **219 passed** (207 → +12) |
| Python typecheck | `npm run typecheck:python` | **Success, 54 source files** (50 → +4) |
| TS typecheck | `npm run typecheck` | **0 errors** |
| TS suite | `npm test` | **431 pass / 0 fail / 79 suites** (shared with committed P4.6; 2B.2 TS delta **0** — the file grew in place, still 4 tests) |
| Build | `npm run build` | **clean** |
| Registration suite | `node --test tests/medical/worker-registration.test.ts` | **4/4** (real Python worker) |
| File length | `wc -l` | max **218** (≤ 250/300) |

Observed fixture values (non-vacuous): R5 exact → RMS `1.39e-14` mm, max
`2.16e-14` mm, rotation `0.0°`; R3 noisy → RMS `0.141733` mm, max `0.181903` mm,
rotation `0.081651°`; R6 sensitivity → centred ratio `s0/s1 = 1.504e8` (candidate
`1e6` **not** asserted).

- **Independent review (`nuclear-reviewer`): PASS**, including an independent
  re-derivation of the Kabsch formula (agreement ~3e-16) and a check that the
  `1e6` candidate is unreferenced by any decision path.
- **Independent QA (`nuclear-qa`): PASS**, with raw worker-stdio JSON for the
  success path (`M·P_source` verified to 2.1e-14 mm, `det(R)=+1`) and all four
  refusals; all 7 gates green.

**QA finding (for the R6 decision).** A *non-axis-aligned* exactly-collinear set is
refused fail-closed (`-32012`) but classified `reflection-required` rather than
`degenerate-landmarks`, because its centred second singular value is `≈1.4e-16`
(not exactly `0.0`). The committed axis-aligned fixture is exact
(`σ₂ = 0.0`), so the suite is deterministic; still, the refusal **reason** for
arbitrary collinear sets is numerically dependent and must be settled with the
R6 numeric rule.

## 5. Documentation, Agentlog & ADR Status

- This eight-point report satisfies the AgentLog Gate for 2B.2. `CHANGELOG.md`
  untouched (ADR-001); promotion remains a release-time action.
- No ADR created/modified. ADR-012 stays **Proposed** (not a dependency of 2B.2).

## 6. Project Model Impact

- None. No `.ncp` schema, `SpatialTransform`/`TransformProvenance` contract,
  manifest or serialized state changed.

## 7. Known Limitations & Technical Debt

- **Pending ratification:** `-32012 REGISTRATION_INVALID`; the R6 numeric
  degeneracy bound; and the collinear **reason** rule noted above.
- **R4 / 2B-T2 (MI determinism)** remains `[TO RATIFY]` and is 2B.3 scope; the
  `rigid` path is still the `-32011` stub.
- Nearly-collinear sets pass by design until R6's numeric bound is ratified; the
  sensitivity fixture records a ratio `1.5e8` **above** the `1e6` candidate, so it
  must be revisited when R6 is ratified.
- The TS landmark request builders use `as unknown as WorkerRegistrationRequest`
  for branded-id literals (test-only; pre-existing pattern).
- `estimate_rigid_transform`'s `ValueError` paths are unreachable through the
  handler while the schema guarantees ≥3 finite 3-tuples.

## 8. Exact Next Recommended Task

Ratify `-32012` and the R6 numeric degeneracy rule (including the collinear
`reason` classification), then implement **slice 2B.3 — automatic rigid
Mutual-Information registration** with the ratified deterministic MI protocol
(R4). Do not start 2B.3 before R4 is fixed, and do not consume this evidence in
P4.4b until 2B.4 (validity/`errorMarginMm`/fail-closed) is complete and
ADR-012 is **Accepted**.

## Addendum — Phase Owner Verdict on 2B.2 (2026-09-22)

The phase owner independently re-verified slice 2B.2 and approved commit
`335926e` as **PASS — technical and scientific, manual Procrustes path**, with a
limited reservation on the classification of *near*-collinear degeneracies.

Owner-reported independent evidence: focused Python **30/30**; TS real-worker
**4/4**; `npm run typecheck` clean; `npm run build` clean; Git tree clean.

### Ratified
- **`-32012 REGISTRATION_INVALID` is ratified** (now recorded as **R10** in the
  plan): a scientific refusal distinct from `-32602`/`-32011`, carrying exactly
  `{diagnostic, mode, reason}` and never a transform. Source comments updated
  from "pending" to "ratified 2026-09-22 (2B.0 R10)".

### R6 amended (not fixed)
- **Structural degeneracy is ratified**: `<3` points, coincident points, and
  **every mathematically collinear set must be `degenerate-landmarks`**.
- The candidate `κ = 1e6` **remains a candidate, not fixed**. The QA finding
  (a diagonal exactly-collinear set is refused but classified
  `reflection-required` because `σ₂ ≈ 1e-16 > 0`) is a **diagnostic
  classification** defect, not a safety defect: the worker never returns an
  invalid transform.
- Before ratification, R6 must require a **scale-aware and stable**
  classification (relative to landmark spread / physical mm scale), defined
  matrix, centring/normalisation, near-zero handling and scale dependence,
  justified by a degeneracy sensitivity test. A **diagonal-collinear regression
  test** is added **after** ratification.
- The algorithm must **not** be silently changed to force the reason.

### R4 — next operational block
- The deterministic MI protocol must be **defined and ratified before 2B.3**.
  A concrete proposal is recorded in the plan §2B.0 (`SimpleITK` pinned `2.5.6`;
  `Euler3DTransform`; geometry-based `CenteredTransformInitializer`; Mattes MI;
  `MetricSamplingStrategy = NONE` for the phantom (no RNG); linear interpolator;
  RegularStepGradientDescent; fixed iteration budget + convergence window;
  `SetGlobalDefaultNumberOfThreads(1)`; bitwise-identical acceptance). All values
  are proposals pending ratification.

### Standing constraints
- P4.4b stays blocked until **2B.4** is complete and **ADR-012 is Accepted**.
- No push without explicit instruction.
