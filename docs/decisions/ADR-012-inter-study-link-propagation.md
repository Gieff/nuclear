# ADR-012: Inter-Study Link Propagation — Causality, Cycles, Tolerance & Out-of-Domain

## Status

**Accepted** — phase-owner sign-off recorded 2026-09-23 (Ratification Record,
below). R-1..R-4 are **met** and OD-1..OD-6 are **resolved** exactly as written
here; no candidate language remains operative. R11-B (Phase 2B, 2026-09-22) is
folded into R-1/OD-6. Slice **P4.4b** may be implemented **strictly within this
record**: `transformed` mode only, admission requires a present
`errorMarginMm <= toleranceMm`, `relative` application fails closed, and no code
in `packages/**` or `python/**` may assume anything beyond what is stated below.

## Date

2026-09-22 (proposed) — 2026-09-23 (accepted)

## Ratification record

2026-09-23 — phase-owner sign-off recorded; Status promoted to **Accepted**
(full record at the end of this document).

## Context

Phase 4 delivered intra-study co-reference: two views in the same
`FrameOfReferenceUID` share one absolute `SpatialState`/`CameraState` pair through
a `SharedStateGroup` (`ADR-011`, `applyCoReferencedLink`). Inter-study views are
acquisitions in **different** `FrameOfReferenceUID`s (e.g. baseline vs follow-up
PET/CT), so their absolute coordinates diverge and a `SharedStateGroup` would be
clinically wrong. `applyCoReferencedLink` therefore (correctly) refuses to apply a
`kind: 'inter-study'` link.

What is still missing is the **application/propagation** of an inter-study link: an
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

Sections 1–8 are **operative as ratified** by the phase owner on 2026-09-23
(full record at the end of this document). P4.4b may implement them within that
recorded scope only; anything not recorded there remains out of scope and may
not be assumed by `packages/**` or `python/**`.

### 1. Topology: Directed Acyclic Graph (DAG) — ratified (R-3)

- An `InterStudyLink` is a **directed edge** `sourceViewId → targetViewId`
  (`direction: 'source-to-target'`).
- Registering/applying a link whose edge would close a directed cycle is refused
  with a typed `LinkError` (`LINK_PROPAGATION_CYCLE`). Chains of 3–4 views are
  supported **only** as a DAG (e.g. `A → B → C`, never `A → B → A`).
- Multiple incoming edges are allowed as **static topology** (a view may be a
  target of more than one link), but a single propagation that would reach one
  target through **distinct paths** is refused as a convergent-path conflict
  before any publication (`LINK_PROPAGATION_CONFLICT`): “visited once” does not
  choose which transformed value wins — no value is published instead.

> **Ratified (R-3, 2026-09-23).** A mandatory DAG **forbids bidirectional
> links**: two views that must scroll each other (A ↔ B) cannot be expressed as
> two opposite links. This deliberate limitation is now the ratified product
> capability boundary: a cycle-closing edge is refused with
> `LINK_PROPAGATION_CYCLE`, a self-edge with `LINK_SELF_REFERENCE`, and a
> convergent-path conflict within one propagation with
> `LINK_PROPAGATION_CONFLICT` — every refusal leaves all views and groups
> unchanged. The bidirectional-causality-guard alternative was **not** selected.

### 2. Propagation is explicit, never an observer/notify chain

- There is **no** subscription/observer/event chain (consistent with
  architecture v3 §2.5 and ADR-011). The engine exposes an explicit operation
  that, given an origin view and its new `SpatialState`, walks the DAG forward and
  recomputes the affected targets.
- Every target change is an **atomic replacement** through the ADR-011 §3 path:
  a new frozen `PreparedView` projection is generated and published; the previous
  frozen value is never mutated. A hard refusal leaves every canonical view
  unchanged. `clamp` / `hide` / `warn` out-of-domain outcomes are typed
  propagation-result diagnostics under the ratified OD-5 below; `hide`/`warn`
  never publish anything (they do not change the target state).
- The operation is **workspace-level** with **complete staging and atomic
  publication** (OD-1, Candidate A ratified): origin plus every reachable target
  projection is computed and staged first; only then is the staged set published
  in one step — either all staged targets appear updated, or nothing is
  published and every view keeps its previous frozen projection. The two-step
  (replace-then-propagate) alternative was **not** selected.
- Inter-study links **never** attach views to a `SharedStateGroup`.

### 3. Causality token guarantees termination

- Each propagation call carries an **origin token**
  `{ originViewId, linkId, epoch }`.
- Traversal is directed and each view is reached **at most once per
  propagation**; a view that received a propagated update does **not**
  re-propagate back toward the origin. A second arrival within the same
  propagation is the convergent-path conflict of R-3/OD-5 — refused with
  `LINK_PROPAGATION_CONFLICT` **before** any publication, not silently skipped.
  Termination is therefore structural on a DAG and echo loops are impossible.
- The token/epoch is part of the propagation result so a UI can render exactly
  one frame per user intent.

### 4. Mapping — ratified (R-2, R-4)

- `transformed`: `targetSpatial = applySpatialTransform(M, sourceSpatial)`, where
  `M = link.spatialTransform.matrix4x4` and the transform's source/target FoRs and
  `outOfDomainBehavior` already match the link (enforced by P4.4).
- `relative` has **no** application mapping and is **deferred (R-2/OD-4,
  ratified)**: P4.4b applies `transformed` links only; any `relative`
  application fails closed until a contract extension is separately ratified.
- Transform application has **one owner (R-4/OD-2, ratified)**: a pure helper in
  `@nuclear/medical-engine`, consumed by `view-engine`. `view-engine` must not
  re-implement matrix or geometry science.
- A missing/invalid transform or unsupported relative mode is refused; neither
  is silently treated as co-referenced.

### 5. Tolerance — a link-admission gate, not per-step propagation

`toleranceMm` and `errorMarginMm` are **different values owned by different
parties** and must not be conflated:

- `SpatialTransform.validity.errorMarginMm` is the **scientific worker's advisory
  registration residual** (evidence). The worker neither accepts nor rejects any
  link; it reports an estimate.
- `InterStudyLink.toleranceMm` is the **caller-declared acceptance threshold**
  for that link (P4.4 already validates it as finite and `≥ 0`). No default is
  invented.

**Ratified admission gate (evaluated once, at link registration — R-1/OD-6,
2026-09-23, folding R11-B).** A `transformed` link admission **requires** a
present `errorMarginMm`:

- `errorMarginMm` absent → refused with `LINK_TRANSFORM_ERROR_MARGIN_MISSING`
  (R11-B fail-closed: no default, no accept-with-warning path; the evidence may
  remain structurally valid, but it is never admissible to a link).
- `errorMarginMm > toleranceMm` → refused with
  `LINK_REGISTRATION_ERROR_EXCEEDS_TOLERANCE`.
- `errorMarginMm <= toleranceMm` → admitted.

No default tolerance is invented. This check is performed once at registration;
it is the **only** place `toleranceMm` can block.

Evidence eligibility follows R11-B: Procrustes/landmark registration with a
measured geometric RMS in `errorMarginMm` is admissible subject to the declared
threshold. The current MI path, which does not provide a ratified mm-denominated
residual, is excluded from `transformed` link admission even when its transform
is otherwise structurally valid. MI requires separately ratified residual
semantics before it can become admissible.

Propagation itself is deterministic and does **not** re-evaluate `toleranceMm`
per step: now that ADR-012 is Accepted, once a link is admitted, each target update
must follow the mapping ratified in this ADR. The per-step out-of-domain decision
(section 6) concerns the target domain, not the registration error.

> This preserves the distinction between the worker's advisory evidence and the
> caller's acceptance threshold. The fail-closed missing-residual rule is the
> Phase 2B R11-B decision, **ratified here as part of R-1/OD-6** (2026-09-23).
> Phase 2B's plan and its 2B.5 closeout remain consistent with this wording.

### 6. Out-of-domain behaviour

Applied when the mapped target coordinate falls outside the target volume bounds
for `transformed`. The domain evidence is **ratified under OD-3**: the
worker-verified registered target geometry (`dimensions`, `spacing`, `origin`,
`direction`) correlated with the target view and Frame of Reference, consumed
through the single owned medical-engine primitive; an axis-aligned bounding box
is never treated as the exact oblique/resliced-domain test (conservative outer
bound only), and the domain is never inferred from viewport state. For
`relative` the boundary is **not defined by the current contract** (mode
deferred, R-2/OD-4):

- `clamp`: the target is updated to its nearest in-domain location and the
  propagation result carries a typed **clamped** diagnostic (OD-5).
- `hide`: the target does **not** move; the result records a typed,
  **non-mutating** out-of-domain outcome — no visibility flag is written to any
  published DTO, because no canonical visibility contract exists (OD-5). No
  fabricated slice is produced.
- `warn`: the target does **not** move; the result records a typed,
  **non-mutating** outcome (OD-5) — never a silent change.

The link declares the policy; there is no implicit default (P4.4 already refuses
an unknown value). The target domain must be **consumed** from correlated,
registered geometry evidence, not inferred from the viewport or recomputed in
`view-engine`.

> **Ratified (R-2/OD-4, 2026-09-23): `relative` mode is deferred.**
> `navigationDifferentialMm` is a bare mm vector; the accepted `InterStudyLink`
> contract defines **neither** a "differential domain" **nor** the frame
> (source LPS vs target LPS) in which the offset is expressed. Its out-of-domain
> boundary is therefore undefined today, and this ADR claims **no** relative
> out-of-domain behaviour: **P4.4b applies `transformed` only** and `relative`
> application fails closed. Supporting `relative` later requires a separate ADR,
> contract field, validator and curated fixture before implementation.

### 7. Locks win

A `StateLock` on the target's `spatial` refuses propagation (`P4.5` semantics: a
lock means the canonical state must not change) with
`LINK_TARGET_SPATIAL_LOCKED`. A propagation that would change a locked target
fails closed and leaves every view unchanged.

### 8. Determinism, idempotency and round-trip

- Re-running the same propagation (same origin state + same epoch) yields
  structurally equal target `SpatialState`s.
- The `InterStudyLink` and the propagation result are serializable and
  round-trip losslessly.
- Published intermediates remain deep-frozen; a consumer re-reads by the stable
  `PreparedViewId` (no push/notify).

## Consequences

- **P4.4b** (now unblocked, within this record) implements the ratified link
  admission rule and the explicit, workspace-level staged propagation operation,
  all pure Node and reusing the ADR-011 atomic replacement path — `transformed`
  mode only.
- **Phase 2B** must supply an admissible `SpatialTransform` before a
  `transformed` link can be produced in production. Under R11-B, measured
  Procrustes/landmark RMS evidence is eligible; current MI evidence without a
  ratified mm-denominated residual is not. The DICOM/worker evidence is owned by
  `python/` + `medical-engine`.
- ADR-011 is unchanged; P4.4 validation is unchanged. P4.4b adds `transformed`
  application only; it does not add relative application.
- The UI (Fase 6–7) observes the regenerated projections; it does not own the
  causality or the topology.

## Resolved Decisions — OD-1..OD-6 (ratified 2026-09-23)

Each open decision below is resolved with the phase-owner selection recorded.
Unselected alternatives are closed unless a revision condition (final section)
is met.

### OD-1 — Trigger API (atomicity, ADR-011 §3) — RATIFIED: Candidate A

One explicit workspace-level
`applySpatialIntent({ originViewId, nextSpatialState, causalityToken })`
operation accepts the origin view's proposed `SpatialState` and causality token,
stages origin plus all reachable target projections, validates the complete
update, then publishes all replacements atomically. Any refusal leaves every
affected view unchanged. There is no observer/notify chain. Candidate B
(separate replace-then-propagate calls) is **rejected**: it would permit a
partially published intent. The exact name/signature may vary in implementation
only if staging-completeness and atomic-publication semantics hold.

### OD-2 — Math ownership (R-4) — RATIFIED: Candidate A

One pure `applySpatialTransform` helper lives in `@nuclear/medical-engine` and
is consumed by `view-engine`; the existing package edge is permitted and
`shared-types` remains zero-runtime. A runtime helper in `shared-types` is not
viable under its zero-runtime boundary. `view-engine`-local matrix/geometry math
remains rejected by invariant 7 unless it only composes an already-owned
primitive and does not re-derive it.

### OD-3 — Target-domain evidence — RATIFIED

Consume the registered target `ImagingAsset.geometry` correlated with the target
view and Frame of Reference, through the single owned medical-engine primitive.
Its oriented worker-verified geometry (`dimensions`, `spacing`, `origin`,
`direction`) is the exact native-grid domain evidence; the contract's
`bounds`/`boundsLpsMm` LPS axis-aligned enclosure is **not** exact membership
evidence for an oblique grid (at most a conservative outer bound) and must never
be presented as such. The current contract does not establish a distinct
resliced-domain evidence field, so P4.4b scope is the registered native target
asset domain; if the actual target is resliced/derived without correlated exact
domain evidence, refuse closed (`LINK_TARGET_DOMAIN_UNAVAILABLE`). Domain is
never inferred from viewport extent. Supporting another domain requires a
ratified contract/fixture.

### OD-4 — Relative semantics and differential domain (R-2) — RATIFIED: Candidate A

`relative` is deferred entirely: P4.4b applies `transformed` only and `relative`
application fails closed. Candidate B (differential frame, sign convention and
valid domain through a separate ADR plus a `shared-types` contract extension,
validator and curated fixture) remains the only path to ever implementing it.

### OD-5 — `LinkError` taxonomy — RATIFIED

Refusal codes accepted:

- `LINK_ORIGIN_UNKNOWN` — propagation origin not found among prepared views.
- `LINK_PROPAGATION_CYCLE` — edge would close a directed cycle (§1).
- `LINK_PROPAGATION_CONFLICT` — **added by this ratification (R-3):** one
  propagation would reach one view through more than one path (convergent-path
  conflict), refused before publication with every view unchanged (§1, §3).
- `LINK_TARGET_SPATIAL_LOCKED` — target `spatial` is locked (§7).
- `LINK_TRANSFORM_INVALID` — missing/invalid transform or unsupported mode.
- `LINK_TRANSFORM_ERROR_MARGIN_MISSING` — admission: no `errorMarginMm` (§5).
- `LINK_REGISTRATION_ERROR_EXCEEDS_TOLERANCE` — admission: residual above
  `toleranceMm` (§5).
- `LINK_RELATIVE_MODE_UNSUPPORTED` — `relative` application fails closed (§4).
- `LINK_TARGET_DOMAIN_UNAVAILABLE` — no exact domain evidence (OD-3).
- `LINK_TARGET_OUT_OF_DOMAIN` — identifier for a fail-closed `hide`/`warn`
  outcome.

Out-of-domain policy handling: `clamp` is a **successful** propagation outcome
carrying an explicit typed clamped-target diagnostic; `hide` and `warn` do not
change the target `SpatialState` and return explicit typed **non-mutating**
result diagnostics identifying the declared behavior. These diagnostics are
propagation **result metadata, not published view status**: the canonical view
contract has no out-of-domain status field and no visibility contract exists, so
nothing is written to any published DTO; hard refusals leave canonical views
unchanged. No UI-side inference is allowed. Refusal outcomes use the codes
above; `clamp` is not a `LinkError`.

### OD-6 — Missing `errorMarginMm` admission (R-1) — RATIFIED: refuse admission

Fixed by R11-B (Phase 2B, 2026-09-22, option B, fail-closed) and folded into §5
here: a transform with no `errorMarginMm` is refused at admission
(`LINK_TRANSFORM_ERROR_MARGIN_MISSING`); no default and no accept-with-warning
path. Evidence validation stays presence-tolerant: valid evidence without a
residual remains structurally valid but never becomes an admissible link. This
must not be reopened as an unselected policy.

## Ratification Record — all items met (phase owner, 2026-09-23)

- **R-1 — MET.** `errorMarginMm` is advisory scientific evidence; `toleranceMm`
  is the caller-declared threshold; admission is evaluated once, accepts only a
  present residual `<= toleranceMm`, and refuses a missing residual
  (`LINK_TRANSFORM_ERROR_MARGIN_MISSING`) or one above tolerance
  (`LINK_REGISTRATION_ERROR_EXCEEDS_TOLERANCE`). No default or warning
  fallback. Procrustes/landmark measured RMS is admissible; MI without a
  ratified mm-denominated residual is excluded (folds Phase 2B R11-B).
- **R-2 — MET (Candidate A).** `relative` deferred; P4.4b applies only
  `transformed`, and `relative` fails closed until a separate contract ADR,
  validator and fixture ratify its domain.
- **R-3 — MET (Candidate A, mandatory DAG).** Every edge that closes a cycle is
  refused (`LINK_PROPAGATION_CYCLE`); bidirectional A ↔ B is inexpressible; a
  propagation reaching one view through more than one path is refused as a
  convergent-path conflict (`LINK_PROPAGATION_CONFLICT`) with canonical state
  unchanged — ambiguity is never resolved by silently picking a winner.
- **R-4 — MET (OD-2 Candidate A).** The one pure transform application helper
  belongs to `@nuclear/medical-engine` and is consumed by `view-engine`; no math
  in zero-runtime `shared-types` and no duplicate local geometry math.

**Status promoted to Accepted:** phase owner, 2026-09-23. OD-1..OD-6 are
resolved as recorded above. Slice **P4.4b** is unblocked strictly within this
record; no `packages/**` or `python/**` code may assume anything beyond it.

## Conditions That Might Warrant a Revision

- If propagation must be incremental under a hard interactive latency budget that
  a DAG-walk cannot meet.
- If non-rigid / affine / deformable transforms must propagate (would change the
  `SpatialTransform` vocabulary and likely require a new contract + ADR).
- If Phase 2B produces registration evidence that does not fit the accepted
  `SpatialTransform` contract (would require extending `shared-types` with a
  validator and fixture).
