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

## Addendum — R4-finalization (2026-09-22)

The phase owner reviewed `a2d1fc9`: `-32012` **ratified**; R6 **correctly amended**
without a hidden numeric threshold; the R4 *direction* approved but **not
ratified as a definitive protocol** (missing parameters, the install pin not yet
real, cross-platform caveat). This addendum delivers the requested
**R4-finalization**; **2B.3 is not started**.

### What was fixed

- **Real dependency pin.** `python/pyproject.toml` now declares
  `SimpleITK==2.5.6` and `numpy==2.5.3` (the MI numerical stack), replacing the
  `>=` floors, so a fresh install is reproducible. A bump of either re-runs the
  determinism fixture and requires a re-ratification. (`pydicom` stays a floor.)
- **Full protocol in the plan** (`PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md`
  §2B.0, R4). Every previously candidate value is now concrete: Mattes MI
  `numberOfHistogramBins=50`; `MetricSamplingStrategy = NONE` (no RNG);
  `sitk.sitkLinear`; `Euler3DTransform` with
  `CenteredTransformInitializerFilter.GEOMETRY`; three levels
  `shrinkFactors=[4,2,1]`, `smoothingSigmas=[2.0,1.0,0.0]` in physical units;
  `RegularStepGradientDescent(learningRate=2.0, minStep=1e-4,
  numberOfIterations=500, relaxationFactor=0.5, gradientMagnitudeTolerance=1e-8)`
  with `OptimizerScalesFromPhysicalShift`; `Float32` casting; no explicit
  `sitk.Resample`; output converted to the 2B.2 `P_target = M · P_source` LPS mm
  row-major convention; provenance field list; amendment rule.
- **API grounding.** Verified by introspection in the installed 2.5.6. Notably
  **absent** in that API: `SetNumberOfLevels` (levels come from the shrink/sigma
  arrays), `SetMetricSamplingSeed` (a seed is passed via
  `SetMetricSamplingPercentage(percentage, seed)`), and
  `SetOptimizerConvergenceWindowSize` (the stopping parameters are `minStep`,
  `numberOfIterations` and `gradientMagnitudeTolerance`). The protocol was
  written against the real API, not assumed names.
- **Reproducibility criterion.** Bitwise-identical on the **same locked
  environment** (OS/arch, Python, SimpleITK, numpy, thread count); explicitly
  **not** a cross-platform guarantee — cross-platform needs a separately defined
  numeric tolerance (left out of R4).
- **Threading.** Save/restore `sitk.ProcessObject` global default threads around
  the operation, forcing 1.

### Worktree note

A parallel **P4.7** change set (`packages/view-engine/src/residency/**`,
`tests/view-engine/residency-projection.test.ts` + fixtures, and
`packages/view-engine/src/index.ts`) is present **uncommitted** in the worktree.
It was **not** touched and is excluded from this documentation-only change; all
staging is by explicit path.

### Status

- **R4: finalized, awaiting final phase-owner ratification.** 2B.3 must not start
  until it is ratified. P4.4b remains blocked until 2B.4 + ADR-012 Accepted.
- No push.

## Addendum — R4 Ratified; P2B.3 Volume-Transport Blocker (2026-09-22)

### R4 ratified

The phase owner **ratified R4** on 2026-09-22, with scope = **same locked
environment** (same OS/arch, Python, SimpleITK, NumPy and thread count); it is
**not** a cross-platform bitwise guarantee. The `pydicom >= 2.4.0` floor is
sufficient for this slice (the MI path uses SimpleITK and prepared volumes, not
DICOM parsing). The plan §2B.0 status now lists R4 as ratified; only **R6**
remains `[TO RATIFY]`.

### P2B.3 is BLOCKED on a missing volume-transport contract

Before implementing 2B.3, the worker's ability to obtain the fixed/moving
volumes was verified. Result: **it cannot.**

- The Python worker has **no voxel ingestion**: no `sitk.ReadImage`,
  `ImageSeriesReader`, `GetArrayFromImage` or `pixel_array` anywhere in
  `python/dicom` / `python/worker` — it reads metadata/geometry only.
- `ADR-004` (Accepted) states explicitly that **"no worker operation transports
  voxel arrays"**; pixel ingestion is **fixture-only and TypeScript-side**
  (`packages/medical-engine/src/renderer/volume-types.ts` `VolumePixelPayload`),
  and the ADR declares that real-source pixel transport requires **its own,
  separate hydration contract + ADR**.
- The 2B.1 `rigid` request carries only `{ locator, seriesInstanceUID }` asset
  references; the worker has no way to turn those into volumes.
- The 2B plan **explicitly excludes** "any DICOM parsing/geometry
  reinterpretation" from this phase, so the worker reading DICOM pixels itself
  (which would also create a second geometry authority) is not permitted.

Consequently the **end-to-end `rigid` IPC path cannot be implemented without
inventing a contract**, which Rule 04 forbids. The **algorithmic part** of 2B.3
(SimpleITK MI core + curated synthetic phantom + bitwise determinism + R3) is
*not* blocked and needs no transport.

**Options put to the phase owner (no code written):**

- **(a)** Define a **Pixel/Volume Transport contract** (`shared-types` + worker)
  via a new ADR, then implement 2B.3 end-to-end.
- **(b)** Deliver **2B.3a** (MI core + synthetic phantom determinism, no IPC
  transport) now, keep the `rigid` IPC path fail-closed, and do **2B.3b** (IPC)
  after the transport ADR.
- **(c)** Introduce a **fixture-only** worker volume ingestion (committed
  synthetic volume files + an explicit request field) under its own ADR — the
  worker-side analogue of ADR-004.

**Recommendation: (b) now, then (a)** for the real path. This preserves the
"no invented behaviour" rule while advancing the ratified scientific core.

### Worktree

A parallel **P4.7** change set (`packages/view-engine/src/residency/**`,
`tests/view-engine/residency-projection.test.ts` + fixtures,
`packages/view-engine/src/index.ts`) is present **uncommitted**. Not touched;
all staging is by explicit path, and global `npm test` counts remain shared.

# Handover Report — Phase 2B.3a: Deterministic MI Rigid Registration Core (no IPC)

## 1. What Was Implemented

The scientific core of automatic rigid registration, implementing the **ratified
R4 protocol exactly** and operating only on `sitk.Image` objects. The IPC path is
deliberately **not** wired.

- `python/dicom/registration_mi.py`: `register_rigid(fixed, moving) -> MiEstimate`
  configured exactly as R4 (Mattes MI bins 50, sampling `NONE`, linear
  interpolator, `Euler3DTransform` + `CenteredTransformInitializerFilter.GEOMETRY`,
  shrink `[4,2,1]`, sigmas `[2.0,1.0,0.0]` in physical units,
  `RegularStepGradientDescent(2.0, 1e-4, 500, 0.5, 1e-8)`,
  `OptimizerScalesFromPhysicalShift(5, 0.01)`, `Float32`, no explicit
  `sitk.Resample`). SimpleITK's global thread count is forced to 1 inside a
  save/restore context manager.
- Convention: `P_target = M · P_source`, LPS mm, row-major 4×4, last row
  `[0,0,0,1]`; **source = fixed / target = moving**, using SimpleITK's native
  fixed→moving transform with **no inversion**; the effective offset is
  `TransformPoint(0) = c + t − R·c` (centre-aware).
- Typed fail-closed `MiRefusal(reason, diagnostic)` for invalid evidence,
  failed/non-finite optimisation, non-rigid transform and invalid residual; the
  rigidity guard is a **pure** helper directly unit-testable with a singular
  matrix. `RIGIDITY_NUMERICAL_GUARD = 1e-9` is documented as a numerical guard,
  **not** a clinical tolerance. No fallback; no transform is fabricated.
- **`errorMarginMm` is not invented**: the MI metric is dimensionless, so no
  millimetre residual is produced; its semantics for this path is **2B.4** scope
  (now stated in the module docstring).

## 2. Files Changed / Created

Created: `python/dicom/registration_mi.py` (250), `python/tests/synthetic_mi_phantom.py` (134),
`python/tests/test_registration_mi.py` (256).
Modified: `python/dicom/__init__.py` (module-list docstring only).
Separate corrective (owner-authorized, **not** part of this slice):
`c2c2556 fix(rendering): align committed volume fixtures with worker 0.3.0`
(5 `expected-*.json`, one `workerVersion` line each).

Not modified: `registration_operations.py`, `registration_schema.py`,
`dispatch.py`, `protocol.py`, `shared-types`, ADR-004, the
`locator + seriesInstanceUID` contract, all TypeScript, `view-engine`.

## 3. Architectural Assumptions Made

- R4 is the authority; every parameter is a ratified value read from named
  constants, so any change is a visible re-ratification.
- Determinism scope = **same locked environment** (OS/arch, Python, SimpleITK
  2.5.6, numpy 2.5.3, threads); not a cross-platform guarantee.
- The fixture makes the ground truth self-consistent:
  `moving = Resample(fixed, truth⁻¹)`, so the truth **is** the fixed→moving map.
- SimpleITK's SWIG bindings are untyped; a single documented `sitk: Any = _sitk`
  alias keeps strict mypy meaningful without scattering `type: ignore`.

## 4. Tests Added & Executed

| Gate | Command | Result |
| --- | --- | --- |
| Python suite | `npm run test:python` | **230 passed / 0 failed** (219 + 11 MI; the 8 release-bump failures fixed by `c2c2556`) |
| Python typecheck | `npm run typecheck:python` | **Success, 57 files** |
| TS typecheck | `npm run typecheck` | **0 errors** |
| Build | `npm run build` | **clean** |
| MI suite | `pytest python/tests/test_registration_mi.py -q` | **11/11** |
| TS suite | `npm test` | **442 / 0** (shared with the parallel P4.7 slice, not attributed here) |

Measured evidence (fixture criterion 2B-T1, **not** a clinical threshold):
**RMS 0.096844 mm**, **max 0.127407 mm**, rotation **0.064102°** (bounds ≤0.5 mm /
≤0.5 mm / ≤0.5°). Two runs are **bitwise identical** (also reproduced across
separate processes: identical `matrix.tobytes()` hash, metric `-1.5008647385741813`,
30 iterations). `det(R)=+1` (|det−1| = 1.1e-16), orthonormality 2.2e-16, last row
exact; the inverse convention hypothesis is worse for every probe (0.106 mm vs
8.55 mm), so the direction is empirically pinned. Effective parameters equal the
ratified R4 values (bins 50, NONE, linear, `[4,2,1]`/`[2.0,1.0,0.0]` physical,
optimizer params, `Float32`, `GEOMETRY`, threads 1, SimpleITK 2.5.6 / numpy 2.5.3).

- **Independent review (`nuclear-reviewer`): PASS**, with C1–C3 resolved here
  (the docstring note was added; the agentlog entry is this report; the module is
  at the 250-line boundary).
- **Independent QA (`nuclear-qa`): PASS**, all 7 gates green, with raw worker
  stdio proving `mode:"rigid"` still returns `-32011` and no transform.

## 5. Documentation, Agentlog & ADR Status

- This eight-point report satisfies the AgentLog Gate for 2B.3a. `CHANGELOG.md`
  untouched (ADR-001).
- No ADR created/modified. ADR-004 is respected (no voxel transport invented);
  the transport contract for the real IPC path requires its **own** ADR (2B.3b).

## 6. Project Model Impact

- None. No `.ncp` schema, `SpatialTransform` contract, manifest or serialized
  state changed; the core is not reachable from the dispatcher.

## 7. Known Limitations & Technical Debt

- **2B.3b (real IPC) remains BLOCKED** pending a Pixel/Volume Transport ADR
  (format, geometry, memory ownership, size limits, hydration/serialization,
  asset/FoR/series correlation, lifecycle, failure modes, independent
  worker→bridge evidence).
- **`errorMarginMm` for MI** is undefined and deferred to **2B.4**.
- A benign zero-iteration / no-movement result is accepted by the core; R4
  ratifies no gate for it — keep it on the **2B.4** validity checklist.
- The stop-condition failure detection is a substring heuristic (fail-closed
  direction only).
- `_require_valid_image` copies the volume to float64 for the finiteness check
  (fine at 48³; revisit memory at clinical scale in 2B.3b).
- `registration_mi.py` is at the **250-line** Rule-02 boundary → the next edit
  should decompose (e.g. extract the pure validation guards).
- Environment-locked determinism: any SimpleITK/numpy bump re-runs the
  determinism fixture and needs re-ratification.

## 8. Exact Next Recommended Task

Implement **slice 2B.4 — evidence validity / `errorMarginMm` / fail-closed**,
defining the MI-path residual semantics (including the zero-iteration case) and
completing R6 (scale-aware collinear classification) as an independent decision.
Do **not** start 2B.3b until the Pixel/Volume Transport ADR is ratified, and do
not consume any registration evidence in P4.4b before 2B.4 and ADR-012
**Accepted**.

## Addendum — Phase 2B.4 implementer handover (2026-09-22)

Authority: `docs/plans/PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md` (2B.0 R8,
slice 2B.4). Owner-set boundaries respected: no voxel transport / DICOM pixels;
`mode:"rigid"` still returns `-32011 OPERATION_NOT_IMPLEMENTED`; no
`shared-types`/ADR-004/`view-engine` change; `errorMarginMm` is never fabricated
and the absent-residual admission policy is **not** encoded (policy-neutral).

### 1. What Was Implemented

- **`python/dicom/registration_validation.py` (new).** Pure fail-closed
  validator raising typed `EvidenceRefusal(reason, diagnostic)`. Checks, in
  order: `validity.isValid is True` (`not-valid`); `units == 'mm'`
  (`invalid-units`); exactly 16 finite numbers and homogeneous last row
  `[0,0,0,1]` (`malformed-matrix`); 3x3 rotation orthonormal with `det ~= +1`
  (`non-rigid-transform`); non-empty (`empty-frame-of-reference`) and distinct
  (`same-frame-of-reference`) FoRs; provenance `method` in the shared-types
  vocabulary, non-empty `workerVersion`, ISO-8601 `timestamp`
  (`incomplete-provenance`); `errorMarginMm` **when present** finite `>= 0`
  (`invalid-error-margin`). `NUMERICAL_GUARD = 1e-9` is a single named
  **numerical guard, not a clinical tolerance**.
- **Self-check.** `registration_operations._landmark_evidence` validates the
  built `transform` with the validator before returning. Valid input is
  byte-identical; same-FoR is still refused earlier with `-32012`.
- **MI zero-iteration formalisation.** `registration_mi.outcome_violation` now
  takes `iterations` and refuses a negative count or an empty/failing stop
  condition. Zero iterations is **not** a failure (the `GEOMETRY` initialiser
  may already be converged); the matrix check delegates to the shared validator.
  **No numeric quality/iteration threshold** is introduced — any such threshold
  is documented as **unratified**. All R4 parameters are unchanged.
- **TS mapper hardening (R8).** New `registration-evidence.ts` (extracted to
  respect the 250-line Rule-02 threshold) holds the pure semantic guard;
  `mapping-registration.mapRegistrationResult` composes it and fails closed with
  `WorkerContractError` for `isValid !== true`, non-`mm` units, non-finite /
  non-homogeneous / non-orthonormal / `det != +1` matrix, empty or equal FoRs,
  and a present negative `errorMarginMm`. No `Math.`/`enum`/`namespace`
  (source-integrity green); no scientific formula duplicated.
- **R8 `transformType` ↔ matrix coherence (ratified, corrective).** Both
  validators now enforce the coherence named by plan §2B.0 R8, fail-closed:
  `identity` → the whole 4x4 is the identity within the single numerical guard
  (rotation ≈ I **and** translation ≈ 0); `rigid` → the proper-orthonormal
  `det = +1` matrix (as before); `affine` → only a finite 16-number matrix with
  a homogeneous last row `[0,0,0,1]` — a legitimate affine scale/shear carries
  **no** orthonormality/determinant requirement and must be accepted. An unknown
  `transformType` is refused with the new Python reason
  `incoherent-transform-type` (TS: `WorkerContractError`); a rigid-typed
  non-orthonormal block keeps the existing `non-rigid-transform` reason, and an
  identity-typed non-identity matrix is `incoherent-transform-type`.
- **TS provenance completeness (corrective).** `mapProvenance` now mirrors the
  Python `_validate_provenance`: an empty `workerVersion` and a `timestamp` that
  is not an ISO-8601 instant are refused `WorkerContractError`, closing the
  earlier Python/TS hardening asymmetry (the method vocabulary was already
  checked there).

### 2. Files Changed / Created

Created: `python/dicom/registration_validation.py`,
`python/dicom/registration_contract.py` (corrective split: shared refusal type,
numerical guard and pure 4x4 coherence primitives),
`python/tests/test_registration_validation.py`,
`packages/medical-engine/src/worker/registration-evidence.ts`,
`tests/medical/worker-registration-validity.test.ts`.
Modified: `python/dicom/registration_mi.py`,
`python/dicom/registration_operations.py`, `python/dicom/__init__.py`,
`packages/medical-engine/src/worker/mapping-registration.ts`,
`python/tests/test_registration_mi.py`, this agentlog.
`registration_validation.py` was split (330 → 206 lines + 171-line
`registration_contract.py`) to stay under the Rule-02/03 file-length gate; the
public `EvidenceRefusal` / `require_valid_matrix4x4` / `rotation_violation` names
remain importable from `dicom.registration_validation`.
Not modified: `@nuclear/shared-types`, `@nuclear/view-engine`, ADR-004,
`CHANGELOG.md`, any ADR.

### 3. Tests Added & Executed

- 30 new pytest cases in `test_registration_validation.py` (positive + one
  defect per negative reason; absent margin accepted / present
  negative-or-non-finite refused; MI zero-iteration; real landmark evidence
  passes the validator; plus 6 coherence cases — identity-typed identity
  accepted, identity-typed translation / unknown `transformType` /
  rigid-typed non-orthonormal refused, affine-typed scale accepted, affine-typed
  non-homogeneous last row refused) + 2 assertions added to
  `test_registration_mi.py`.
- 21 new mapper cases in `worker-registration-validity.test.ts` (inline
  wire-shape only), including a translation-in-last-column acceptance guard and
  8 coherence/provenance cases (identity identity accepted, identity translation
  refused, unknown `transformType` refused, rigid non-orthonormal refused,
  affine scale accepted, affine non-homogeneous refused, empty `workerVersion`
  refused, malformed `timestamp` refused).

### 4. Gates (raw tails, this uncommitted tree)

| Gate | Command | Result |
| --- | --- | --- |
| Python | `npm run test:python` | **260 passed** (254 → +6 coherence) |
| Python types | `npm run typecheck:python` | **Success: no issues found in 60 source files** (59 → +1 `registration_contract`) |
| TS types | `npm run typecheck` | clean (0 errors) |
| Build | `npm run build` | clean |
| Registration | `node --test tests/medical/worker-registration.test.ts` | **4/4** (real worker) |
| Mapper | `node --test tests/medical/worker-registration-validity.test.ts` | **21/21** (13 → +8) |
| Suite | `npm test` | **463 pass / 0 fail / 81 suites** (455 → +8, shared with the committed P4.7 slice) |

Raw worker stdio (rigid): `{"code":-32011,"message":"Operation not implemented",
"data":{"diagnostic":"...","mode":"rigid","phaseSlice":"2B.1"}}` — no transform.
File length: `registration_validation.py` 206, `registration_contract.py` 171,
`registration_mi.py` 249, `registration-evidence.ts` 162,
`mapping-registration.ts` 213 (all ≤ 250/300).

### 5. Documentation, Agentlog & ADR Status

- This addendum satisfies the AgentLog Gate for 2B.4. No ADR created/modified;
  ADR-012 stays **Proposed** (read-only OD-6/R-1 reference). `CHANGELOG.md`
  untouched (ADR-001).

### 6. Project Model Impact

- None. No `.ncp` schema, `SpatialTransform` contract, manifest or serialized
  state changed.

### 7. Known Limitations & Technical Debt

- The **absent `errorMarginMm` admission policy** remains an open architect
  decision (ADR-012 OD-6); the code validates only when present.
- **R6** (scale-aware collinear classification) remains pending ratification.
- **2B.3b (real IPC) remains BLOCKED** pending the Pixel/Volume Transport ADR.
- **R8 coherence and TS provenance completeness are now implemented
  (corrective).** The earlier note that a transform-type-specific coherence rule
  "was not added because it is not part of the R8 list" was **wrong**: plan
  §2B.0 R8 explicitly names `transformType` ↔ matrix coherence. Both validators
  now enforce it fail-closed (`identity` / `rigid` / `affine`; new
  `incoherent-transform-type` refusal reason) and the TS gate now mirrors the
  Python provenance completeness (`workerVersion` non-empty, ISO-8601
  `timestamp`). No voxel transport, `shared-types`, ADR-004, locator-contract or
  `view-engine` change; all R4 parameters unchanged.

### 8. Exact Next Recommended Task

Independent verification/QA of 2B.4 (2B.5), together with ratifying R6 and the
ADR-012 R-1..R-4 checklist. Do not wire `mode:"rigid"` to success and do not
consume the evidence in P4.4b until ADR-012 is **Accepted**.

## Addendum — 2B.4 R11 decision request: absent `errorMarginMm`

Per the phase owner's instruction that 2B.4 must produce the explicit decision on
a missing `errorMarginMm` (required before P4.4b can be accepted), the architect
records the proposal in plan §2B.0 **R11**:

- **(A) permissive** — a residual-less `SpatialTransform` is admissible under a
  caller-declared, recorded policy;
- **(B) fail-closed (recommended)** — a residual-less transform is **not
  admissible** to a `transformed` inter-study link; the link-admission gate
  refuses it.

Rationale for **(B)**: without a residual there is nothing to compare against
the caller's `toleranceMm`, and the clinical-correctness principle favours
refusing unquantified evidence over a silent default. Consequence: the **MI**
path cannot produce an admissible `transformed` link until a mm-denominated MI
residual is defined; the **landmarks** path (measured RMS) is unaffected.

The 2B.4 code is **policy-neutral** and encodes neither option (it validates the
residual only when present). **Awaiting phase-owner ratification** — this is the
local half of ADR-012 **R-1 / OD-6**; ADR-012 stays **Proposed**.

## Addendum — R11-B Ratified (phase owner, 2026-09-22)

The phase owner ratified **R11-B (fail-closed)**. The rule:

> A `SpatialTransform` with **no** `errorMarginMm` may be retained as
> structurally valid evidence but is **not admissible** to a `transformed`
> `InterStudyLink`, is **not** comparable to `toleranceMm`, must **not** receive
> a default, and must **not** be promoted to a link with an implicit warning.
> **Valid evidence ≠ automatically admissible inter-study evidence.**

Consequence: the **MI** path produces validated transform evidence that stays
**non-admissible to P4.4b `transformed`** until a mm-denominated MI residual with
ratified semantics exists. The **landmarks** path stays admissible (measured
geometric RMS). This is recorded in plan §2B.0 **R11** and must be carried into
ADR-012's final R-1/OD-6 ratification. The 2B.4 code already encodes neither
option (policy-neutral).

# Handover Report — Phase 2B.5: Phase 2B Closure (Independent Verification & Handover)

## 1. What Was Delivered

Phase 2B is closed to the extent the ratified decisions allow:

- **2B.1** — `nuclear.registration` registered with a fail-closed request/evidence
  schema and typed TS bridge; schema-valid requests raised `-32011`.
- **2B.2** — deterministic **Procrustes** landmarks path returning a rigid
  `SpatialTransform` (`P_target = M · P_source`, LPS mm, row-major) with a
  **measured RMS** `errorMarginMm`; typed `-32012` refusals.
- **2B.3a** — deterministic **MI rigid core** (R4-exact) on `sitk.Image`, **not**
  IPC-wired; bitwise-reproducible, R3-verified.
- **2B.4** — fail-closed **evidence validity** in Python and TS, including the
  ratified **R8 `transformType`↔matrix coherence** and TS provenance completeness;
  **MI zero-iteration** formalised; `errorMarginMm` policy-neutral.
- The **release-bump fixture regression** was fixed in a separate corrective.

## 2. Commits (selective, explicit paths; no push)

`1dbe540` (2B.1) · `335926e` (2B.2) · `6872ab1` (2B.3a) · `9c75386` (2B.4) ·
`c2c2556` (release fixture corrective). Per-slice file lists are in the handovers
above.

## 3. Architectural Assumptions

- ADR-002 is the transport authority; the worker owns every scientific formula and
  TypeScript only validates/maps (verified by the engine no-`Math` scan).
- The accepted `SpatialTransform`/`TransformValidity` contract was reused with **no
  `shared-types` extension**; `errorMarginMm` stays advisory worker evidence.
- Determinism is scoped to the **same locked environment** (`SimpleITK==2.5.6`,
  `numpy==2.5.3`, threads=1); cross-platform determinism is explicitly excluded.
- The classic **valid ≠ admissible** distinction (R11-B) is now explicit.

## 4. Tests & Gates (final closure run, 2026-09-22)

| Gate | Result |
| --- | --- |
| `npm run test:python` | **260 passed / 0 failed** |
| `npm run typecheck:python` | **Success, 60 source files** |
| `npm run typecheck` | **0 errors** |
| `npm run build` | **clean** |
| `node --test tests/medical/worker-registration*.test.ts` | **4/4 + 21/21** |
| `npm test` | **463 / 0** (shared with the committed P4.7 view-engine slice) |

Reviewer/QA verdicts: PASS at each slice (2B.1–2B.4); the 2B.4 reviewer CONCERNS
(C-1 TS provenance asymmetry, C-2 R8 coherence omission) were **resolved** before
its commit.

## 5. Documentation, Agentlog & ADR Status

- This report plus the per-slice handovers satisfy the AgentLog Gate.
- `CHANGELOG.md` untouched (ADR-001).
- **No ADR was created or modified.** ADR-012 stays **Proposed**; R11-B must be
  folded into its final R-1/OD-6 ratification.

## 6. Project Model Impact

- None. No `.ncp` schema, shared contract, manifest or serialized state changed.

## 7. Known Limitations & Technical Debt (required distinctions)

- **Procrustes (landmarks):** evidence with a **usable geometric residual**
  (measured RMS) — **admissible** to inter-study linking under the declared
  policy.
- **MI (automatic):** **validated transformative evidence without an admissible
  residual** — valid but **non-admissible** to P4.4b `transformed` (R11-B) until a
  mm-denominated MI residual is defined with ratified semantics.
- **IPC `rigid`:** still **BLOCKED** by the missing **Pixel/Volume Transport
  contract**; `mode:"rigid"` continues to return `-32011`.
- **R6:** the numeric near-degeneracy bound is **deferred**; the candidate
  `κ = 1e6` is **not** referenced by any decision path, and no arbitrary threshold
  was introduced.
- **2B.3b** (real IPC volume transport) requires its own ADR. **ADR-012 remains
  Proposed**, so **P4.4b stays blocked**.

## 8. Exact Next Recommended Task

Open a **Pixel/Volume Transport ADR** (format, geometry, memory ownership, size
limits, hydration/serialization, asset/FoR/series correlation, lifecycle, failure
modes, independent worker→bridge evidence) to unblock **2B.3b**; in parallel
ratify **R6** only if a scale-aware rule can be justified, and carry **R11-B**
into ADR-012's **R-1/OD-6** ratification before **P4.4b**.
