# ADR-010: View-Engine Workspace, Link Semantics & Persistent Surface Ownership

## Status

Accepted

## Date

2026-09-21

## Context

Phase 4 must deliver `@nuclear/view-engine` as a headless orchestration layer
between the accepted Phase 1 contracts and the Phase 3 `medical-engine`.
Several boundary questions had to be settled before P4.1 could depend on them:

1. Which package owns the logical workspace/slot model, and how the package
   boundary stays UI-agnostic.
2. How link semantics distinguish physically co-referenced views from
   longitudinal/inter-study views, and what evidence each requires.
3. Where persistent `ViewportSurface` identity lives, and how placement is
   separated from WebGL context ownership.
4. How resource demand is declared and projected onto the existing
   `ResourceManager` without duplicating residency policy.

The architecture (v3 §5–§20, §29.1–§29.3) and Vademecum §4.1 already assign
`view-engine` the workspace, slots, prepared views, link/lock/override and
resource-demand declaration, and assign `medical-engine` the physical
residency. This ADR fixes the concrete NuClear contracts and invariants.

## Decision

### 1. Package boundary

- `@nuclear/view-engine` depends only on `@nuclear/shared-types`,
  `@nuclear/rendering-presets` and `@nuclear/medical-engine`.
- It imports **no** React, no DOM, no `@cornerstonejs/*` and no browser
  globals. Every Phase 4 behaviour is exercised by pure Node tests.
- The `ImagingWorkspace` model is serializable and describes semantic
  references only; it is never React state, a DOM tree or a Cornerstone
  `RenderingEngine`.
- New public cross-package payloads introduced by Phase 4 are added to
  `@nuclear/shared-types` with a validator and a fixture, not invented as
  ad-hoc `view-engine`-local types.

### 2. ViewSlot / ViewGroup model

- A workspace offers **between one and four `ViewGroup`s, each of exactly
  four `ViewSlot`s** (at most 16 logical slots), in the role order `MIP`,
  `PET`, `GENERIC`, `FUSION`. The default factory allocates four groups
  (16 slots); an empty layout (zero groups) is not a meaningful workspace
  and is refused. *(Corrected by the §7 addendum — previously worded
  “exactly four”.)*
- `ViewSlot.role` describes the slot’s role, not a renderer type. Capacity,
  role and group-membership invariants are enforced fail-closed (a 17th
  slot, a duplicate id, a foreign role or a mismatched group id is refused).
- `ViewSlot.status` (`empty`, `bound`, `prepared`, `unavailable`) follows
  explicit legal transitions; an illegal transition is a typed error.

### 3. Link semantics

- **Intra-study / co-referenced**: two views may share absolute LPS
  `SpatialState` only when their geometry evidence is accepted and
  **verified by the scientific worker** for the **same `FrameOfReferenceUID`**,
  and each evidence snapshot is correlated one-to-one with a registered
  asset, its `seriesInstanceUID` and its `SourceFingerprint`. Co-reference
  does **not** require an equal `geometricDigest`: native CT and PET in one
  Frame of Reference legitimately have different grids, spacing and
  dimensions, therefore different digests. *(Corrected by the §7 addendum —
  the previous “equal `geometricDigest`” wording was clinically wrong and
  would have refused valid PET/CT fusion.)* No numeric tolerance is
  invented; compatibility is the worker's verified assertion.
- **Inter-study / relative or transformed**: different `FrameOfReferenceUID`s
  are never treated as co-referenced. The link must carry either an explicit
  `navigationDifferentialMm` (mode `relative`) or a valid `SpatialTransform`
  (mode `transformed`) whose source/target FoRs match the link, plus an
  explicit `toleranceMm` and an out-of-domain behavior (`clamp`, `hide` or
  `warn`). A missing or invalid transform is refused.
- Registration and transform validity remain `medical-engine`/worker
  concerns; `view-engine` consumes a transform, it does not compute one.

### 4. Lock and override

- `LOCK` protects a named portion of state (`spatial`, `camera`,
  `presentation`, `projection`, `composition`, `binding`). It means “this
  canonical state must not change”, not “disable the mouse”. A mutation
  attempt on locked state is refused by name.
- `OVERRIDE` is a `LocalViewOverride` local to a `ComposerViewInstanceId`,
  serializable, and never mutates the source `PreparedView`.

### 5. Persistent surfaces and placement

- `ViewportSurfaceRegistry` owns stable `surfaceId`/`viewportId` identity and
  lifecycle (`available`, `mounted`, `hidden`, `disposed`). Rebinding a
  surface to another slot/view must not change its identity; a `disposed`
  surface carries no binding.
- The 16-surface limit is **logical**. It is never equated with 16 WebGL
  contexts; the context count is backend-owned (v3 §2.3, §29.1).
- `SurfaceLayoutManager` computes viewer-slot and composer-panel rectangles
  as pure geometry. It does not create, destroy or reparent any DOM node;
  the actual host technique (portal, overlay, reparenting) is a later UI
  concern and must not leak into `view-engine`.
- Viewport→panel framing belongs to `figure-engine` (`PanelFramingState`);
  `view-engine` only provides host rectangles and stable identity.

### 6. Resource demand

- `view-engine` declares `ResourceDemand` and projects slot/view visibility
  into lease-based retentions against the existing `ResourceManager`.
- Lease ids are stable and caller-owned; they are never derived from a DOM
  node or the numeric slot index alone.
- `view-engine` never loads, evicts, measures bytes or implements budget
  policy. `PreparedView`/slot references never pin RAM or VRAM; physical
  residency is reconciled only when demand is declared.

## Consequences

- P4.1 may build the workspace/slot model knowing the exact capacity, role
  and status invariants and the package boundary.
- Phase 4 tests are pure Node; the accepted Phase 3 renderer suite remains
  the only renderer gate and is not duplicated.
- `tests/contracts/view-validators.ts` remains the shared validator source;
  Phase 4 adds behavioural tests (invariants, transitions, link eligibility,
  identity stability, demand reconciliation) rather than new contract shapes
  unless a genuine gap appears.
- A genuine cross-package gap (for example a serializable workspace snapshot)
  is resolved by extending `shared-types` with a validator and fixture, not
  by a `view-engine`-local duplicate.

## Conditions That Might Warrant a Revision

- If the UI host technique required by Fase 6–7 cannot reuse stable surfaces
  without a DOM/React dependency inside `view-engine`.
- If registration produces a transform vocabulary that does not fit the
  accepted `SpatialTransform` contract.
- If the `ResourceManager` lease model must change to express a demand the
  workspace cannot declare (would require a superseding ADR).

## 7. Addendum — P4.0/P4.1 Reopened: Ratified Corrections

**Date:** 2026-09-22 · **Status:** Accepted (corrects §2 and §3 above).

An independent human review reopened P4.0, P4.1 and P4.2. The following
corrections are ratified and supersede contradicted wording above.

### 7.1 Slot/group rule (§2 correction)

- A workspace allocates **1 to 4 `ViewGroup`s**, each with **exactly four
  slots** in role order, for at most 16 slots. The default factory allocates
  four groups.
- Zero groups is refused (`WORKSPACE_SLOT_LAYOUT_INVALID`). More than four
  groups, more than 16 slots, duplicate ids, foreign roles, undeclared groups
  and group-membership mismatches remain refused.
- Rationale: architecture v3 §8 says “up to 16 slots”, so a smaller coherent
  workspace is legitimate; an empty workspace is not.

### 7.2 Co-reference semantics (§3 correction)

- Co-reference eligibility is: **same verified `FrameOfReferenceUID`** +
  **worker-verified geometric compatibility** + **one-to-one correlation**
  between every evidence snapshot and a registered `ImagingAsset`
  (`assetId`, `seriesInstanceUID`, `SourceFingerprint`).
- **Identical `geometricDigest` is explicitly NOT a requirement.** Evidence:
  the accepted Phase 1 fixture `mockIntraStudyLink` models native CT
  (`sha256:aabbcc1122334455`) and PET (`sha256:ccbbaa5544332211`) in the same
  `MOCK_FOR_UID` and is valid; in Phase 3, `pt-axial-coreg` matches the CT
  digest only because it is *resampled onto CT geometry*, while native
  `pt-axial` does not.
- The contract validator `isIntraStudyLink` must enforce the snapshot ↔
  asset ↔ series ↔ fingerprint correlation (it currently does not) and gain
  a negative test (snapshot fingerprint of a different series) **and** a
  positive test locking in that different digests with the same verified FoR
  are accepted.
- Registration/transform validity remain worker/`medical-engine` concerns;
  `view-engine` consumes them.

### 7.3 Provenance association semantics (for C5)

- `ViewProvenance.sourceAssetIds`, `sourceSeriesInstanceUIDs` and
  `sourceFingerprints` are **positionally one-to-one**: equal lengths, index
  `i` describes the same source, and every source asset shares
  `provenance.studyInstanceUID`. Registration must validate this
  fail-closed. A keyed association contract is a possible future revision
  (would change a Phase 1 shape and require its own ADR).

### 7.4 Immutability and shared-state mutation

- See **ADR-011** (`PreparedView` immutability and controlled shared-state
  mutation). §1/§6 of this ADR are refined by it: published DTOs are
  immutable; shared `SpatialState`/`CameraState` are owned by a private
  holder with atomic replacement, never exposed as freely mutable objects.

## 8. Addendum — P4.6 Surface Capacity, Disposal and Binding Scope (2026-09-22)

**Status:** Accepted (clarifies §5; no change to the `ViewportSurface`
contract).

- **Capacity is a lifetime-total logical identity budget.** A workspace
  session allocates at most **16** distinct `ViewportSurface` identities.
  The limit counts logical records only; it is never equated with WebGL
  contexts, canvases or DOM nodes. This restates §5 for the registry API.
- **Disposal is terminal and never reclaims an identity.** `dispose` clears
  the binding (the `isViewportSurface` disposed rule), sets `disposed` and
  is final; there is deliberately **no** purge/remove API in P4.6. A disposed
  surface therefore still occupies the identity budget, and the
  capacity-exceeded remediation is to reuse an already-allocated identity,
  never to dispose-and-retry.
- **Composer binding is not representable in the frozen contract.** §8.1 /
  §29.1 describe a surface bound to a `ComposerViewInstance`, but
  `ViewportSurface` exposes only `boundSlotId` and `boundViewId`. P4.6
  therefore does not implement or invent a Composer binding; representing it
  requires a `shared-types` extension with its own ADR, validator and
  fixture.
- **The registry does not cross-validate references or binding uniqueness.**
  It validates identity, lifecycle and structure only; whether a
  `boundSlotId`/`boundViewId` exists elsewhere, and whether one slot/view is
  bound by more than one surface, are caller-owned in P4.6 (mirroring the low
  level `ViewSlotRegistry`, while `ImagingWorkspace` performs the
  cross-checks).
- **Host placement geometry is view-engine-local and unit-agnostic.**
  `SurfaceHostRect`/`SurfacePlacement` are ephemeral host-placement DTOs in
  caller-supplied units, not physical mm and not persisted. Per §1 they must
  be promoted to `shared-types` (with a validator and fixture) at their first
  cross-package consumption (e.g. Fase 6 UI or `figure-engine`), not before.

