# ADR-012: Inter-Study Link Propagation — Causality, Cycles, Tolerance & Out-of-Domain

## Status

**Proposed** — must be ratified (or revised) before slice **P4.4b** is implemented.
No code in `packages/**` may depend on this ADR until its Status is **Accepted**.
The ratification checklist (**R-1..R-4**, below) is **not yet met**.

## Date

2026-09-22

## Context

Phase 4 delivered intra-study co-reference: two views in the same
`FrameOfReferenceUID` share one absolute `SpatialState`/`CameraState` pair through
a `SharedStateGroup` (`ADR-011`, `applyCoReferencedLink`). Inter-study views are
acquisitions in **different** `FrameOfReferenceUID`s (e.g. baseline vs follow-up
PET/CT), so their absolute coordinates diverge and a `SharedStateGroup` would be
clinically wrong. `applyCoReferencedLink` therefore (correctly) refuses to apply a
`kind: 'inter-study'` link.

What is still missing is the **relative application** of an inter-study link: an
`InterStudyLink` carries either a `SpatialTransform` (mode `transformed`, matrix
`P_target = M · P_source`) or a `navigationDifferentialMm` (mode `relative`), plus
an explicit `toleranceMm` and an `outOfDomainBehavior`. When one view's
`SpatialState` is updated, the target view's `SpatialState` must be recomputed
along the link so the same anatomical point stays in view.

Two architectural constraints make this non-trivial:

1. **ADR-011 forbids in-place mutation.** Published `PreparedView`/`SpatialState`
   values are deep-frozen and may only change through explicit, atomically
   replacing engine APIs. A cascading inter-study update must therefore
   *regenerate* frozen projections, never mutate them.
2. **Cascades can cycle.** If A links to B and B links back to A (or a 3–4 row
   chain is wired naively), an update can ping-pong forever or silently pollute
   observability. The topology and a causality token must be fixed *before*
   implementation.

The non-simplification law and invariant 7 ("no duplicated clinical science")
also require that the matrix/offset application has **one owned implementation**;
`view-engine` composes transforms, it does not re-derive geometry.

## Decision

The following is the proposed model. Sections 1–8 are the intended decision;
section 9 lists the items that still require explicit ratification.

### 1. Topology is a Directed Acyclic Graph (DAG)

- An `InterStudyLink` is a **directed edge** `sourceViewId → targetViewId`
  (`direction: 'source-to-target'`).
- Registering/applying a link whose edge would close a directed cycle is refused
  with a typed `LinkError` (`LINK_PROPAGATION_CYCLE`). Chains of 3–4 views are
  supported **only** as a DAG (e.g. `A → B → C`, never `A → B → A`).
- Multiple incoming edges are allowed (a view may be a target of more than one
  link), but each propagation traverses forward only.

> **Requires explicit ratification (R-3).** A mandatory DAG **forbids
> bidirectional links**: two views that must scroll each other (A ↔ B) cannot be
> expressed as two opposite links. This is a deliberate limitation, not an
> assumed one; it must be ratified — or replaced by a bidirectional model with a
> causality guard — before P4.4b is implemented. If bidirectional links are
> required, the cycle rule of this section is wrong and must be revised.

### 2. Propagation is explicit, never an observer/notify chain

- There is **no** subscription/observer/event chain (consistent with
  architecture v3 §2.5 and ADR-011). The engine exposes an explicit operation
  that, given an origin view and its new `SpatialState`, walks the DAG forward and
  recomputes the affected targets.
- Every target change is an **atomic replacement** through the ADR-011 §3 path:
  a new frozen `PreparedView` projection is generated and published; the previous
  frozen value is never mutated. A refusal leaves every view unchanged.
- Inter-study links **never** attach views to a `SharedStateGroup`.

### 3. Causality token guarantees termination

- Each propagation call carries an **origin token**
  `{ originViewId, linkId, epoch }`.
- Traversal is directed and each view is visited **at most once per
  propagation**; a view that received a propagated update does **not**
  re-propagate back toward the origin. This makes termination structural on a
  DAG and prevents echo loops.
- The token/epoch is part of the propagation result so a UI can render exactly
  one frame per user intent.

### 4. Normative mapping

- `transformed`: `targetSpatial = applySpatialTransform(M, sourceSpatial)`, where
  `M = link.spatialTransform.matrix4x4` and the transform's source/target FoRs and
  `outOfDomainBehavior` already match the link (enforced by P4.4).
- `relative`: `targetSpatial` = `sourceSpatial` offset by
  `navigationDifferentialMm` in the link's declared direction.
- The transform/offset application itself is a **single owned pure function**
  (see Open Decision OD-2); `view-engine` consumes it and must not re-implement
  matrix or geometry science.
- A missing/invalid transform or a malformed differential is refused; it is
  never silently treated as co-referenced.

### 5. Tolerance — a link-admission gate, not per-step propagation

`toleranceMm` and `errorMarginMm` are **different values owned by different
parties** and must not be conflated:

- `SpatialTransform.validity.errorMarginMm` is the **scientific worker's advisory
  registration residual** (evidence). The worker neither accepts nor rejects any
  link; it reports an estimate.
- `InterStudyLink.toleranceMm` is the **caller-declared acceptance threshold**
  for that link (P4.4 already validates it as finite and `≥ 0`). No default is
  invented.

**Proposed admission gate (evaluated once, at link registration — OD-6).** For a
`transformed` link whose transform carries a defined `errorMarginMm`, the engine
refuses to register the link when `errorMarginMm > toleranceMm`
(`LINK_REGISTRATION_ERROR_EXCEEDS_TOLERANCE`). A transform with **no**
`errorMarginMm` is handled by an explicit policy to ratify (accept with a
recorded warning, or refuse). This admission gate is the **only** place
`toleranceMm` can block.

Propagation itself is deterministic and does **not** re-evaluate `toleranceMm`
per step: once a link is admitted, each target update is the exact mapping of
section 4. The per-step out-of-domain decision (section 6) concerns the target
domain, not the registration error.

> This corrects the earlier draft wording that implied an over-`toleranceMm`
> residual blocks every propagation step. That conflated the worker's advisory
> evidence with the caller's acceptance threshold; PHASE_2B and this ADR are now
> aligned (R-1).

### 6. Out-of-domain behaviour

Applied when the mapped target coordinate falls outside the target volume bounds
(for `transformed`). For `relative` the boundary is **not defined by the current
contract** (see the gap note below):

- `clamp`: clamp the target to its nearest in-domain location; the target still
  moves and the result is flagged as clamped.
- `hide`: the target does **not** move and is marked out-of-domain; no fabricated
  slice is produced.
- `warn`: the target does not silently change; a warning/refusal is recorded.

The link declares the policy; there is no implicit default (P4.4 already refuses
an unknown value). The target volume bounds used here are **consumed** from the
registered asset geometry evidence, not recomputed.

> **Relative mode is under-specified — a contract gap (R-2).**
> `navigationDifferentialMm` is a bare mm vector; the accepted `InterStudyLink`
> contract defines **neither** a "differential domain" **nor** the frame
> (source LPS vs target LPS) in which the offset is expressed. Its out-of-domain
> boundary is therefore undefined today. This ADR does **not** claim a relative
> out-of-domain behaviour: **P4.4b implements `transformed` mode first**, and
> `relative` mode is deferred until OD-4 is ratified — and, if a valid range is
> required, until `shared-types` gains that field with a validator and fixture
> (its own ADR). Until then, applying a `relative` link must fail closed rather
> than guess a domain.

### 7. Locks win

A `StateLock` on the target's `spatial` refuses propagation (`P4.5` semantics: a
lock means the canonical state must not change). A propagation that would change
a locked target fails closed and leaves every view unchanged.

### 8. Determinism, idempotency and round-trip

- Re-running the same propagation (same origin state + same epoch) yields
  structurally equal target `SpatialState`s.
- The `InterStudyLink` and the propagation result are serializable and
  round-trip losslessly.
- Published intermediates remain deep-frozen; a consumer re-reads by the stable
  `PreparedViewId` (no push/notify).

## Consequences

- **P4.4b** implements `applyInterStudyLink` (registration + DAG/cycle
  validation + lock checks) and the explicit propagation operation, all pure
  Node, reusing the ADR-011 atomic replacement path.
- **Phase 2B** must supply a verifiable `SpatialTransform` (automatic voxel
  registration and/or manual Procrustes) before a `transformed` link can be
  produced in production; the DICOM/worker evidence is owned by
  `python/` + `medical-engine`.
- ADR-011 is unchanged; P4.4 validation is unchanged. P4.4b only adds the
  relative application that P4.4 deliberately refuses.
- The UI (Fase 6–7) observes the regenerated projections; it does not own the
  causality or the topology.

## Open Decisions (require ratification before P4.4b implementation)

- **OD-1 — Trigger API.** The exact public operation that mutates a view's
  `SpatialState` and triggers propagation (e.g. a workspace-level
  `setViewSpatial(originViewId, nextSpatial, { epoch })` that both replaces the
  origin projection and propagates, versus a two-step replace-then-propagate).
  Must remain an explicit, atomic API (ADR-011 §3).
- **OD-2 — Math ownership (OPEN, R-4).** Where the single
  `applySpatialTransform(matrix, SpatialState)` (and, when ratified,
  differential-offset) implementation lives. Candidates and their costs:
  - `@nuclear/medical-engine` pure helper, consumed by `view-engine`
    (preferred: keeps coordinate science out of `view-engine`; adds a package
    dependency edge that already exists);
  - a new pure module in `shared-types` — **not viable**, `shared-types` is
    zero-runtime;
  - `view-engine`-local math — **rejected** by invariant 7 unless it provably
    composes an owned primitive rather than re-deriving geometry.
  This must be ratified and must not duplicate geometry science
  (invariant 7 / non-simplification law).
- **OD-3 — Out-of-domain bounds source.** The exact evidence field used for the
  target volume bounds (from the registered `ImagingAsset.geometry`), and whether
  a resliced domain differs from the axis-aligned bounds.
- **OD-4 — Relative-mode semantics + differential domain (R-2).** The precise
  frame of `navigationDifferentialMm` (source LPS vs target LPS), its sign
  convention, and whether a valid/differential domain exists in the contract at
  all (currently it does not). Deferred: `relative` mode is not implemented until
  this is ratified; a contract extension would need its own ADR + validator +
  fixture.
- **OD-5 — Error taxonomy.** Final `LinkError` codes for cycle, locked target,
  out-of-domain clamp/hide/warn, tolerance exceeded, and unknown origin.
- **OD-6 — Missing `errorMarginMm` admission policy.** Whether a `transformed`
  link whose transform carries no `errorMarginMm` is accepted (with a recorded
  warning) or refused, given the admission gate of section 5.

## Ratification Checklist (NOT yet met — Status stays **Proposed**)

- **R-1 — Tolerance semantics.** Ratify the two-gate model of section 5
  (`errorMarginMm` = advisory worker evidence; `toleranceMm` = caller-declared
  admission threshold; tolerance blocks **admission**, not per-step propagation)
  and the OD-6 policy for a missing `errorMarginMm`. PHASE_2B must remain
  consistent with the ratified wording.
- **R-2 — Relative "differential domain".** The current `InterStudyLink`
  contract does not define a differential domain for `relative`. Decide either
  (a) defer `relative` mode entirely (P4.4b ships `transformed` only), or
  (b) add an explicit valid-range field to `shared-types` (own ADR + validator +
  fixture) and only then define its out-of-domain behaviour. Until decided,
  `relative` application fails closed.
- **R-3 — Mandatory DAG.** Ratify the restriction that a link closing a directed
  cycle is refused (this **forbids bidirectional A ↔ B**), or replace it with a
  bidirectional model guarded by the causality token. This is a product
  capability decision, not an implementation detail.
- **R-4 — Math ownership.** Ratify OD-2 (single owner of
  `applySpatialTransform`), so `view-engine` composes rather than re-derives
  geometry (invariant 7).

The phase owner records ratification by promoting this ADR to **Accepted** (or by
revising R-2/R-3 into a superseding decision). No P4.4b code may assume a
resolution to R-1..R-4.

## Conditions That Might Warrant a Revision

- If propagation must be incremental under a hard interactive latency budget that
  a DAG-walk cannot meet.
- If non-rigid / affine / deformable transforms must propagate (would change the
  `SpatialTransform` vocabulary and likely require a new contract + ADR).
- If Phase 2B produces registration evidence that does not fit the accepted
  `SpatialTransform` contract (would require extending `shared-types` with a
  validator and fixture).
