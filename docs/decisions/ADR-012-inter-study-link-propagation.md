# ADR-012: Inter-Study Link Propagation — Causality, Cycles, Tolerance & Out-of-Domain

## Status

**Proposed** — must be ratified (or revised) before slice **P4.4b** is implemented.
No code in `packages/**` may depend on this ADR until its Status is **Accepted**.

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

### 5. Tolerance

- `toleranceMm` (validated in P4.4 as finite and `≥ 0`) is the **declared
  registration error margin**. No default is invented.
- When the computed residual/offset exceeds `toleranceMm`, the engine refuses to
  assert an anatomical correspondence and the outcome is governed by
  `outOfDomainBehavior` (section 6). Tolerance is never used as a silent fudge
  factor.

### 6. Out-of-domain behaviour

Applied when the mapped target coordinate falls outside the target volume bounds
(for `transformed`) or beyond the declared differential domain (for `relative`):

- `clamp`: clamp the target to its nearest in-domain location; the target still
  moves and the result is flagged as clamped.
- `hide`: the target does **not** move and is marked out-of-domain; no fabricated
  slice is produced.
- `warn`: the target does not silently change; a warning/refusal is recorded.

The link declares the policy; there is no implicit default (P4.4 already refuses
an unknown value). The target volume bounds used here are **consumed** from the
registered asset geometry evidence, not recomputed.

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
- **OD-2 — Math ownership.** Where the single `applySpatialTransform(matrix,
  SpatialState)` / differential-offset implementation lives. Candidate:
  `@nuclear/medical-engine` (pure helper), consumed by `view-engine`.
  `@nuclear/shared-types` is zero-runtime and cannot host it. This must not
  duplicate geometry science (invariant 7 / non-simplification law).
- **OD-3 — Out-of-domain bounds source.** The exact evidence field used for the
  target volume bounds (from the registered `ImagingAsset.geometry`), and whether
  a resliced domain differs from the axis-aligned bounds.
- **OD-4 — Relative-mode semantics.** The precise frame of
  `navigationDifferentialMm` (source LPS vs target LPS) and its sign convention.
- **OD-5 — Error taxonomy.** Final `LinkError` codes for cycle, locked target,
  out-of-domain clamp/hide/warn, tolerance exceeded, and unknown origin.

## Conditions That Might Warrant a Revision

- If propagation must be incremental under a hard interactive latency budget that
  a DAG-walk cannot meet.
- If non-rigid / affine / deformable transforms must propagate (would change the
  `SpatialTransform` vocabulary and likely require a new contract + ADR).
- If Phase 2B produces registration evidence that does not fit the accepted
  `SpatialTransform` contract (would require extending `shared-types` with a
  validator and fixture).
