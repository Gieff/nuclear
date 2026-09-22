# Phase 2B — Scientific Registration: `SpatialTransform` Generation & Verification

Status: **In progress.** Slice **2B.1 (worker operation registration + evidence
schema + TypeScript bridge types)** is **complete** — commit `1dbe540`; the
worker raises `-32011 OPERATION_NOT_IMPLEMENTED` for a schema-valid request and
fabricates no transform. Slice **2B.2 (manual-landmark Procrustes)** is also
**complete** — commit `335926e`. **2B.0 is partially ratified** (R1, R2, R3, R5,
R7, R8, R9, R10); the numeric degeneracy bound (R6) remains `[TO RATIFY]`, and
the MI determinism protocol (R4) is **finalized but awaits final ratification**
before 2B.3. Addendum to
`docs/plans/PHASE_2_SCIENTIFIC_INGESTION_PLAN.md` (ADR-002 worker bridge) and a
prerequisite for view-engine slice **P4.4b** (`docs/decisions/ADR-012-inter-study-link-propagation.md`).

> This document fixes the inputs, outputs and **evidence** the scientific worker
> must produce for an inter-study `SpatialTransform`. It does not implement the
> algorithm. Numeric tolerances marked **[TO RATIFY]** are candidate values, not
> accepted clinical constants; nothing may be silently hard-coded.

## Objective

Give NuClear a headless, worker-owned way to produce a **verifiable
`SpatialTransform`** that maps one study's Frame of Reference to another's, so
the view engine can apply an `InterStudyLink` (`transformed`) or a declared
relative differential. Two paths:

- **Automatic (voxel) registration** — Mutual Information / cross-correlation via
  SimpleITK (already a declared dependency: `python/pyproject.toml`,
  `SimpleITK>=2.3.0`, resolved 2.5.6).
- **Manual (landmarks) registration** — Procrustes analysis over N≥3
  corresponding 3-D landmark pairs.

The worker returns the accepted `SpatialTransform` contract (matrix, FoRs,
`units: 'mm'`, provenance, validity, `outOfDomainBehavior`) plus a declared
residual; `view-engine` consumes it and never recomputes geometry.

## Entry Conditions

- Phase 2 accepted: the stdio JSON-RPC worker bridge (ADR-002) and the operation
  registry in `python/worker/dispatch.py` (`build_dispatcher`) are operational.
- Phase 3 accepted: worker-verified geometry evidence and `ImagingAsset`
  geometry (`FrameOfReferenceUID`, direction, spacing, origin, bounds).
- `SpatialTransform` / `TransformValidity` contracts exist in
  `packages/shared-types/src/spatial-transform.ts` (no new shape expected).
- A curated synthetic fixture pair exists **inside NuClear** (no external legacy
  repository, no patient data).

## In Scope

- **Worker operation(s)** registered alongside the existing `geometry`,
  `compatibility` and `suvbw` operations (names **[TO RATIFY]**, e.g.
  `nuclear.registration`), each returning `success_response`/`error_response`
  envelopes from `python/worker/protocol.py`.
- **Automatic rigid registration** (`rigid`, optional `affine` **[TO RATIFY]**)
  using SimpleITK Mutual Information, with explicit convergence settings and a
  deterministic initialisation.
- **Manual landmark registration** via Procrustes: N≥3 corresponding points →
  optimal rigid (and, if ratified, similarity/affine) transform.
- **Evidence output**: the `SpatialTransform` plus a declared residual
  (`validity.errorMarginMm`) and the operational metadata
  (`TransformProvenance`: method, workerVersion, timestamp).
- **Independent Python tests** (pytest) over synthetic phantoms with a known
  ground-truth transform, and a TypeScript bridge test that round-trips the
  evidence without reinterpretation.
- **Versioned TS bridge surface** in `packages/medical-engine/src/worker/`
  (typed request/response), with no `view-engine` coupling.

## Explicitly Excluded

- `view-engine` propagation, causality, cycles, tolerance policy and
  `outOfDomainBehavior` (that is **P4.4b** + ADR-012).
- UI landmark placement / interaction (Fase 6–7).
- Any DICOM parsing/geometry reinterpretation: geometry arrives from the
  Phase 2/3 evidence, not from this slice.
- Non-rigid / deformable registration (would change the `SpatialTransform`
  vocabulary and require a superseding ADR).
- Any second renderer, WebGL or figure/export work.

## Scientific Contracts (inputs, outputs, evidence)

### Inputs

- **Automatic**: two registered assets (fixed/moving) with their
  geometry evidence and pixel/volume data handles; optional metric,
  sampling and convergence parameters.
- **Manual**: two ordered lists of ≥3 corresponding 3-D landmark points
  (patient LPS mm) with their `FrameOfReferenceUID`s.

### Output (reuses the accepted contract)

One `SpatialTransform`:

- `matrix4x4` — homogeneous 4×4, `P_target = M · P_source`, LPS mm;
- `sourceFrameOfReferenceUID` / `targetFrameOfReferenceUID` — the two studies;
- `transformType` — `identity` | `rigid` | `affine`;
- `units: 'mm'`;
- `provenance` — method (`dicom-registration` | `rigid-coregistration` |
  `manual-alignment` | `identity`), `workerVersion`, timestamp;
- `validity` — `isValid`, `errorMarginMm` (**the worker's advisory registration
  residual — evidence, not an acceptance decision**) and `outOfDomainBehavior`.

No new cross-package shape is introduced unless a genuine gap is found; if one
appears it is added to `shared-types` with a validator and a fixture (ADR-010 §1).

### Verification evidence

- **Synthetic ground truth**: apply a known transform to a curated phantom,
  register, and require the recovered matrix to match within an explicit
  tolerance (see below).
- **Procrustes exactness**: on exactly corresponding points with no noise, the
  recovered transform reproduces the points to machine precision.
- **Fail-closed**: a degenerate landmark set (collinear/coincident points),
  a singular/failed optimisation, or mismatched FoRs returns a typed error, never
  a fabricated transform.

## Tolerances — candidates **[TO RATIFY]**

### 2B.0 Ratification Record (phase owner, 2026-09-22 — partial)

Slice 2B.1 is complete (commit `1dbe540`). The phase owner ratified the
architectural decisions and the fixture criteria below; the MI determinism
protocol and the numeric degeneracy bound remain open.

**Ratified architectural decisions.**

- **R1** — one operation `nuclear.registration` with `mode: 'rigid' | 'landmarks'`
  (`affine` remains TBD).
- **R2** — output is the accepted `SpatialTransform`; `validity.errorMarginMm` is
  advisory worker evidence; `transformId` and `outOfDomainBehavior` are
  caller-declared and echoed; no `shared-types` extension.
- **R7** — a landmark request whose source and target `FrameOfReferenceUID` are
  equal is refused in **scientific validation** (2B.2/2B.4) with a typed error,
  not necessarily at the IPC schema level.
- **R8** — the `mapRegistrationResult` semantic checks (`validity.isValid === true`,
  `errorMarginMm >= 0` when present, distinct source/target FoR,
  `transformType`↔matrix coherence, homogeneous last matrix row) are a
  **blocking 2B.4 gate** before any consumer (P4.4b) may use the evidence.
- **R9** — lockstep `protocolVersion "1.0"`; `nuclear.registration` is a required
  handshake operation; pre-2B.1 workers are incompatible. This is a recorded
  **compatibility decision** to surface in the release changelog.
- **R10 — reserved code `-32012` (ratified 2026-09-22).** `REGISTRATION_INVALID`
  (`-32012`, "Registration invalid") is ratified as the reserved scientific
  refusal for `nuclear.registration`, distinct from `-32602` (schema) and `-32011`
  (unimplemented). Its `data` carries exactly `{diagnostic, mode, reason}` with
  `reason ∈ {same-frame-of-reference, degenerate-landmarks, reflection-required}`
  and **never** a transform/matrix. Documented in Python and TypeScript.

**Ratified fixture criteria — NOT universal clinical tolerances.**

- **2B-T1 [RATIFIED — fixture criterion]** — rigid recovery on the curated
  phantom: RMS point error ≤ 0.5 mm and rotation error ≤ 0.5°.
- **2B-T3 [RATIFIED — fixture criterion]** — Procrustes on exact
  correspondences: point error ≤ 1e-6 mm and rotation error ≤ 1e-6°.

**Ratified measurement conventions (bind 2B-T1 and 2B-T3).**

- Both the **RMS** and the **maximum** point error across the fixture
  correspondences are computed and asserted. The tabulated bound applies to
  both. `validity.errorMarginMm` carries the **RMS** point error.
- The **rotation error** is the geodesic angle of `R_recovered · R_groundtruthᵀ`,
  expressed in degrees, where `R` is the orthonormal 3×3 rotation block.
- Coordinates are patient **LPS millimetres**; the homogeneous 4×4 is stored
  **row-major** (matching the `shared-types` `Matrix4x4`); points are column
  vectors.
- The convention is strictly **`P_target = M · P_source`**; the last row is
  `[0, 0, 0, 1]` for a rigid transform.

**Still `[TO RATIFY]`.**

- **2B-T4 / R6 — degeneracy classification (amended 2026-09-22).** Structural
  degeneracy is **ratified**: fewer than 3 points, coincident points, and **every
  mathematically collinear set must be refused as `degenerate-landmarks`**. The
  current implementation detects collinearity with an **exact** `σ₂ ≤ 0` test,
  which misses arbitrary (non-axis-aligned) collinear sets — float round-off gives
  `σ₂ ≈ 1e-16`, so they are still refused but mis-classified
  `reflection-required` instead of `degenerate-landmarks` (fail-closed, wrong
  **reason** only). To ratify, the rule must be:
  - **scale-aware** (relative to the landmark spread / physical mm scale) and
    **stable** across orientations;
  - the candidate `κ = 1e6` (or a singular-value-ratio bound) remains a
    **candidate, not fixed** — its matrix, centring/normalisation, near-zero
    handling and scale dependence must be defined and justified by a degeneracy
    sensitivity test;
  - a **diagonal-collinear regression test** is added **after** ratification,
    asserting the stable `degenerate-landmarks` classification.
  - The algorithm must **not** be silently changed to force the reason before
    this is ratified.
- **2B-T2 / R4 — deterministic MI protocol (R4-finalization 2026-09-22; FINAL
  ratification pending).** The environment and every parameter are now fixed
  concretely against the installed SimpleITK **2.5.6** API (verified by
  introspection in that environment); nothing below is left as an undefined
  placeholder.
  - **Reproducibility / pin.** `python/pyproject.toml` pins `SimpleITK==2.5.6`
    and `numpy==2.5.3` (the numerical stack the MI result depends on). A bump of
    either re-runs the determinism fixture and requires a re-ratification.
  - **Reproducibility criterion.** Repeated runs on the **same locked
    environment** (same OS/arch, Python patch, SimpleITK, numpy and thread count)
    must yield a **bitwise-identical** transform and effective parameters. This is
    **not** a cross-platform guarantee; cross-platform comparison requires a
    separately defined explicit numeric tolerance (out of scope for R4).
  - **Threading.** Save and restore `sitk.ProcessObject`'s global default thread
    count around the operation, forcing `SetGlobalDefaultNumberOfThreads(1)`.
  - **Image type / resampling order.** Cast both volumes to `sitk.sitkFloat32`
    before registration; the registration path performs **no** explicit
    `sitk.Resample` of the moving image — the framework interpolates internally
    during metric evaluation and the operation returns the **transform**, never a
    resampled volume.
  - **Transform.** `sitk.Euler3DTransform` (rigid, 6 DOF).
  - **Initialisation.** `sitk.CenteredTransformInitializer(fixed, moving,
    sitk.Euler3DTransform(), sitk.CenteredTransformInitializerFilter.GEOMETRY)` —
    the `GEOMETRY` filter explicitly (never `MOMENTS`).
  - **Metric.** `SetMetricAsMattesMutualInformation(numberOfHistogramBins=50)`.
  - **Sampling.** `SetMetricSamplingStrategy(sitk.ImageRegistrationMethod.NONE)`
    — all voxels, **no RNG**, so determinism is structural. `RANDOM` is excluded
    (its determinism would depend on the RNG; `SetMetricSamplingPercentage(pct,
    seed)` does accept a fixed seed, but that is a **separate future decision**),
    and `REGULAR` is a separate performance/quality decision.
  - **Interpolator.** `SetInterpolator(sitk.sitkLinear)`.
  - **Multi-resolution.** Three levels via the arrays (there is no
    `SetNumberOfLevels` in 2.5.6): `SetShrinkFactorsPerLevel([4, 2, 1])`,
    `SetSmoothingSigmasPerLevel([2.0, 1.0, 0.0])`,
    `SetSmoothingSigmasAreSpecifiedInPhysicalUnits(True)`.
  - **Optimiser.** `SetOptimizerAsRegularStepGradientDescent(learningRate=2.0,
    minStep=1e-4, numberOfIterations=500, relaxationFactor=0.5,
    gradientMagnitudeTolerance=1e-8)` with
    `SetOptimizerScalesFromPhysicalShift(centralRegionRadius=5,
    smallParameterVariation=0.01)`. **No optimizer weights.**
  - **Stopping criterion.** Terminate on `minStep` (1e-4), `numberOfIterations`
    (500) or gradient magnitude `< 1e-8`; record `GetOptimizerIteration()`,
    `GetMetricValue()` and `GetOptimizerStopConditionDescription()`.
  - **Output convention.** SimpleITK's registration transform maps fixed→moving;
    the returned `M` MUST satisfy `P_target = M · P_source` in LPS mm, row-major
    with last row `[0, 0, 0, 1]`, exactly as 2B.2. The conversion from the
    SimpleITK transform (center + Euler angles) is explicit and verified by a
    synthetic known-rotation unit test.
  - **Provenance.** `workerMetadata.parameters` records the SimpleITK and numpy
    versions, metric + bins, sampling strategy, interpolator, optimiser name and
    all its parameters, shrink factors, smoothing sigmas + units flag, pixel type,
    initialiser filter, final metric value, executed iterations and the stop
    condition; `transform.provenance.method = 'rigid-coregistration'`.
  - **Amendment rule.** These values **are** the protocol; if 2B.3's phantom test
    cannot meet R3 within them, the change is a documented **re-ratification**,
    never a silent edit.

### Tolerance candidates (historical — superseded by the record above)

No tolerance is accepted until the phase owner ratifies it. Original candidate
values, retained for traceability:

- **[TO RATIFY] 2B-T1** — rigid recovery on the curated phantom: RMS point error
  ≤ candidate 0.5 mm and rotation error ≤ 0.5°. *(now ratified as a fixture
  criterion.)*
- **[TO RATIFY] 2B-T2** — MI convergence: fixed iteration budget + tolerance,
  deterministic across repeated runs on the same fixture. *(still open.)*
- **[TO RATIFY] 2B-T3** — Procrustes on exact correspondences: ≤ candidate
  1e-6 mm. *(now ratified as a fixture criterion.)*
- **[TO RATIFY] 2B-T4** — degenerate-input refusal: a typed error for <3 points,
  collinear points, or a condition number above a declared bound. *(structural
  refusals ratified; numeric bound still open.)*

`toleranceMm` on a link stays **caller-declared** (P4.4 already enforces finite
`≥ 0`). The worker **never** applies `toleranceMm` and never accepts or rejects a
link: it reports `errorMarginMm` as advisory evidence. The consumer
(`view-engine`) compares `errorMarginMm` to the caller's `toleranceMm` at the
**link-admission gate** (ADR-012 §5, OD-6); tolerance does **not** gate each
propagation step. Until **ADR-012 R-1 / OD-6** are ratified, the admission policy
— including the handling of a transform with no `errorMarginMm` — is provisional.

**[Contract gap — ADR-012 R-2 / OD-4]** The `relative` mode's
`navigationDifferentialMm` has **no defined differential domain** in the accepted
`InterStudyLink` contract. Phase 2B produces a `SpatialTransform` (the
`transformed` mode); it neither defines nor extends the relative vocabulary. Any
relative-domain field would be a `shared-types` extension with its own ADR,
validator and fixture.

## Worker / IPC & Bridge Policy

- New operation handlers live in `python/dicom/` alongside
  `geometry_operations.py` / `quantitation_operations.py`, registered in
  `python/worker/dispatch.py`.
- Request/response stay plain JSON in the ADR-002 envelope; the TS side is typed
  in `packages/medical-engine/src/worker/` (`ScientificWorkerBridge`).
- Errors propagate explicitly (no silent fallback); a missing SimpleITK or fixture
  is `BLOCKED`, never `PASS`.

## Fixture Policy

- A curated synthetic phantom pair + a known transform, stored in-repo and
  versioned (`tests/` / worker fixtures), with a declared tolerance.
- A curated landmark set (exact + noisy variants).
- No external/legacy repository and no patient data.

## Delivery Slices

| Slice | Owner | Deliverable | Acceptance evidence |
| --- | --- | --- | --- |
| 2B.0 | orchestrator | This plan + the operation/evidence schema + ADR-012 cross-reference | Slice boundaries and open tolerances documented |
| 2B.1 | scientific engineer | Worker operation registration + TS bridge types | Handshake lists the new operation; bridge round-trips a stub; pytest/mypy green |
| 2B.2 | scientific engineer | Procrustes (manual landmarks) | Exact-correspondence exactness + degenerate refusal + typed errors |
| 2B.3 | scientific engineer | Automatic rigid MI registration | Synthetic-phantom recovery within the ratified tolerance; deterministic |
| 2B.4 | scientific engineer | Evidence validity / `errorMarginMm` / fail-closed | Failed optimisation and FoR mismatch refused; no fabricated transform |
| 2B.5 | reviewer + QA | Independent verification + handover | Reviewer/QA verdicts, pytest/mypy, fixture regression, eight-point report |

Do not begin a later slice before its predecessor’s review/QA evidence is
recorded.

## Completion Gates

- `npm run test:python` and `npm run typecheck:python` green on the new code.
- Curated-fixture regression with the **ratified** tolerances.
- TypeScript bridge typecheck/build green; `npm test` unaffected.
- Boundary: no `view-engine` propagation logic here; no UI.

## Stop Conditions

Stop as `BLOCKED` (do not guess) when:

- a required tolerance is not yet ratified;
- the `SpatialTransform` contract cannot express the produced registration
  (would need a `shared-types` extension + validator + fixture, i.e. its own ADR);
- the worker cannot run SimpleITK in the configured environment;
- registration would require a second renderer or `view-engine` changes.

## Exact Next Step

Ratify the **[TO RATIFY]** tolerances and the operation names, then execute
**2B.0 → 2B.1** (schema + bridge), followed by **2B.2** (Procrustes), before any
`transformed` inter-study link can be produced. In parallel, ratify **ADR-012**
and its Open Decisions so **P4.4b** can be implemented after P4.6.
