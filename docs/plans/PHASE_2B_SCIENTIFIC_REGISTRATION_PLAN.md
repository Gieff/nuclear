# Phase 2B — Scientific Registration: `SpatialTransform` Generation & Verification

Status: **Plan only — NOT YET IMPLEMENTED.** Addendum to
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

No tolerance is accepted until the phase owner ratifies it. Candidate values to
start the discussion (declared, versioned, tested) — not final:

- **[TO RATIFY] 2B-T1** — rigid recovery on the curated phantom: RMS point error
  ≤ candidate 0.5 mm and rotation error ≤ candidate 0.5°.
- **[TO RATIFY] 2B-T2** — MI convergence: fixed iteration budget + tolerance,
  deterministic across repeated runs on the same fixture.
- **[TO RATIFY] 2B-T3** — Procrustes on exact correspondences: ≤ candidate
  1e-6 mm.
- **[TO RATIFY] 2B-T4** — degenerate-input refusal: a typed error for <3 points,
  collinear points, or a condition number above a declared bound.

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
