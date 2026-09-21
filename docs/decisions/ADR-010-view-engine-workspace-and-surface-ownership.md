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

- A workspace offers exactly **four `ViewGroup`s of four `ViewSlot`s** (16
  logical slots), in the role order `MIP`, `PET`, `GENERIC`, `FUSION`.
- `ViewSlot.role` describes the slot’s role, not a renderer type. Capacity,
  role and group-membership invariants are enforced fail-closed (a 17th
  slot, a duplicate id, a foreign role or a mismatched group id is refused).
- `ViewSlot.status` (`empty`, `bound`, `prepared`, `unavailable`) follows
  explicit legal transitions; an illegal transition is a typed error.

### 3. Link semantics

- **Intra-study / co-referenced**: two views may share absolute LPS
  `SpatialState` only when their geometry evidence is accepted and matches —
  equal `FrameOfReferenceUID` **and** equal `geometricDigest` with a verified
  snapshot set. Co-reference eligibility is an exact equality check; no
  numeric tolerance is invented.
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
