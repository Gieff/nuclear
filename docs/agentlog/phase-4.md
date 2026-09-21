# Phase 4 — View Engine: Workspace, Link/Lock/Override & Persistent Surfaces

Status: **REOPENED** (2026-09-22). P4.0 (`72fbaee`), P4.1 (`8cdad35`) and
P4.2 (`a70983c`) were accepted locally and then **reopened by an independent
human review**; none of them is an approvable closed slice as committed. The
ratified corrective slices must land before P4.3. See
`docs/plans/PHASE_4_VIEW_ENGINE_PLAN.md` §“Reopened — Ratified Correction
Slices”, `docs/decisions/ADR-010-…md` §7 and
`docs/decisions/ADR-011-prepared-view-immutability-and-shared-state-mutation.md`.
P4.3–P4.8 pending in declared dependency order.
Baseline entry: Phase 3 closed and released (HEAD `30ef205`, annotated tag
`v0.2.0`, monorepo 0.2.0).

---

# Handover Report — P4.0: Baseline, Contract Audit & Phase Plan

## 1. What Was Implemented

P4.0 established the Phase 4 baseline and fixed the slice boundaries before
any view-engine code was written. It is a documentation-and-decision slice;
it changes no `packages/` source.

- **Baseline gates re-verified** on the clean tree at `30ef205` (no staged or
  modified files before this slice).
- **Contract audit performed.** The Phase 1 contracts required by Phase 4
  already exist in `@nuclear/shared-types` and are validated by
  `tests/contracts/view-validators.ts`: `ViewSlot`, `ViewGroup`,
  `ViewportSurface` (+ `ViewportSurfaceLifecycle`), `ViewLink`
  (`IntraStudyLink` / `InterStudyLink`), `GeometryVerificationSnapshot`,
  `StateLock`, `LocalViewOverride`, `PreparedView`,
  `CachedPreviewReference`, `ResourceDemand` and `MedicalViewState`. No
  cross-package contract gap was found that requires a new shape before
  P4.1; P4.2–P4.7 state explicitly what they consume.
- **Phase 4 plan written**
  (`docs/plans/PHASE_4_VIEW_ENGINE_PLAN.md`): objective, entry conditions,
  in-scope, exclusions, eight architectural invariants, the P4.0–P4.8 slice
  table, fixture/test policy and completion gates.
- **Phase 4 runbook written**
  (`docs/plans/PHASE_4_OPENCODE_RUNBOOK.md`): one-slice-at-a-time delegation
  sequence, required brief fields, slice-specific constraints and gate
  commands.
- **ADR-010 recorded** (`docs/decisions/ADR-010-view-engine-workspace-and-surface-ownership.md`),
  Status **Accepted**, fixing: the UI/DOM/renderer-free package boundary; the
  four-groups-of-four-slots model; exact-equality co-reference eligibility
  versus inter-study relative/transformed links; lock/override separation;
  registry-owned stable surface identity decoupled from WebGL context count;
  and declarative lease-based demand that never duplicates `ResourceManager`
  policy.

## 2. Files Changed / Created

Created:
- `docs/plans/PHASE_4_VIEW_ENGINE_PLAN.md`
- `docs/plans/PHASE_4_OPENCODE_RUNBOOK.md`
- `docs/decisions/ADR-010-view-engine-workspace-and-surface-ownership.md`
- `docs/agentlog/phase-4.md` (this report)

Modified: none. `packages/**`, `python/**`, `tests/**`, `package.json`,
`CHANGELOG.md` and the version are untouched.

## 3. Architectural Assumptions Made

- Phase 4 is **pure Node**; no browser harness is added. The accepted Phase 3
  renderer suite remains the only renderer gate.
- The curated Phase 3 volume fixtures are the authoritative geometry
  evidence for link tests: `ct-axial` and `pt-axial-coreg` share
  `FrameOfReferenceUID …5001.4` and `geometricDigest
  sha256:4195de76…c360a70` (positive co-reference); `pt-axial` uses frame
  `…5002.4` (mismatch negative). Co-reference eligibility is exact equality;
  no numeric tolerance is invented.
- `medical-engine`’s `ResourceManager` (`retain`/`release`/`reconcile`/
  `settle`, caller-owned `leaseId`) is the only residency mechanism; P4.7
  declares demand and consumes settlements rather than reimplementing policy.
- A new public cross-package payload introduced by Phase 4 must go to
  `shared-types` with a validator and fixture, per the accepted pattern.

## 4. Tests Added & Executed

P4.0 adds no tests (documentation/decision slice). Baseline gates re-run on
the unmodified tree:

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm test` | **258 pass / 0 fail** (58 suites, 0 skipped/todo) |
| `npm run build` | clean (exit 0, `tsc -b`) |
| `npm run test:python` | **189 passed** |
| `npm run typecheck:python` | clean over 47 source files |
| File-length scan (`packages/`, `apps/`, `python/`) | only the declared Rule 03 pure-data exemption `rendering-presets/src/dicom-palettes.ts` (632 lines) |

Runtime facts: macOS, Node `v24.3.0`, npm `11.6.4`, monorepo `0.2.0`,
`@cornerstonejs/core` pinned `5.10.7` (medical-engine only).

## 5. Documentation, Agentlog & ADR Status

- ADR-010 recorded with Status **Accepted**.
- This report satisfies the AgentLog Gate for P4.0.
- `CHANGELOG.md` untouched; release notes are compiled later via
  `/promote-changelog 4` only on explicit request.
- No independent reviewer/QA verdict is required for a docs-and-decision
  slice, but P4.1 onward requires both before acceptance.

## 6. Project Model Impact

- None to the `.ncp` schema. ADR-010 anticipates that a future serializable
  `ImagingWorkspace` snapshot may be added to `project-model`/`shared-types`;
  no such contract is introduced in P4.0.

## 7. Known Limitations & Technical Debt

- **Carried from Phase 3**: `tests/**` remains outside the `tsc` graph;
  `renderer/adapter.ts` is exactly 300 lines and `renderer/medical-capture.ts`
  299/300 (next edit must decompose); hardware-GPU evidence and a true
  production bundle remain `NOT YET APPLICABLE`; renderer harness startup
  flake class remains.
- **Phase 4 intent**: no UI, figure or export work is included; surface
  identity is proven without DOM/React, so the actual host technique
  (portal/overlay/reparenting) stays a Fase 6–7 concern.
- The 16-slot cap is a logical model constraint; it must never be reported as
  a WebGL-context count.

## 8. Exact Next Recommended Task

Proceed to **P4.1 — `ImagingWorkspace` core**: the study/asset registry plus
`ViewGroup`/`ViewSlot` allocation (four groups × four roles), bind/unbind and
explicit `empty`/`bound`/`prepared`/`unavailable` status transitions, as pure
Node-safe state in `@nuclear/view-engine`, with fail-closed tests for
capacity, duplicate ids, foreign roles and illegal transitions. Do not add
prepared-view assembly (P4.2), shared state (P4.3), linking (P4.4), surfaces
(P4.6) or demand projection (P4.7) in P4.1.

---

# Handover Report — P4.1: `ImagingWorkspace` Core

## 1. What Was Implemented

P4.1 added the pure, Node-safe workspace core to `@nuclear/view-engine`: the
study/asset registry and the logical `ViewGroup`/`ViewSlot` model with
explicit, fail-closed binding and status transitions. No prepared-view
assembly, shared-state identity, linking, lock/override, surface or
demand-projection behaviour was added (those are P4.2–P4.7).

- **Typed errors** (`workspace/errors.ts`): `WorkspaceError` with a stable
  `WorkspaceErrorCode` union (duplicate/unknown study & asset, unknown
  slot/group, invalid layout, illegal slot transition, demand-requires-binding)
  and messages that name the offending id/state plus a remediation clause.
- **Logical slot layout** (`workspace/view-slot-registry.ts`):
  `VIEW_SLOT_ROLES = ['MIP','PET','GENERIC','FUSION']`,
  `MAX_VIEW_GROUPS = 4`, `MAX_VIEW_SLOTS = 16`; `createDefaultViewSlotLayout()`
  builds four groups of four slots in role order; `ViewSlotRegistry.fromLayout`
  validates (group/slot caps, unique ids, declared group per slot, exactly four
  members per group covering each role once) and only then constructs the
  registry through a private constructor. Reads return fresh immutable copies.
- **Transitions**: `bind` (`empty`/`unavailable` → `bound`, clears any stale
  demand), `markPrepared` (`bound` → `prepared`), `markUnavailable`
  (`bound`/`prepared` → `unavailable`), `unbind` (any non-empty → `empty`,
  clearing `preparedViewId` and `resourceDemand`), `setDemand` (`bound`/
  `prepared` only, else `WORKSPACE_DEMAND_REQUIRES_BINDING`). Every other
  transition throws `WORKSPACE_ILLEGAL_SLOT_TRANSITION`.
- **Workspace aggregate** (`workspace/imaging-workspace.ts`):
  `registerStudy`/`registerAsset` (duplicate id and asset-without-registered-
  study fail closed; values are JSON-cloned on registration so caller mutation
  cannot alter internal state), `getStudy`/`getAsset`/`listStudies`/
  `listAssets`, the exposed `slots` registry and a JSON-serializable
  `snapshot()`.
- **Barrel** (`workspace/index.ts`) re-exported from the package entry
  `packages/view-engine/src/index.ts` (previously `export {}`).

## 2. Files Changed / Created

Created:
- `packages/view-engine/src/workspace/errors.ts` (42 lines)
- `packages/view-engine/src/workspace/view-slot-registry.ts` (273 lines)
- `packages/view-engine/src/workspace/imaging-workspace.ts` (128 lines)
- `packages/view-engine/src/workspace/index.ts` (11 lines)
- `tests/view-engine/fixtures/workspace-fixtures.ts` (77 lines)
- `tests/view-engine/workspace-core.test.ts` (311 lines)

Modified:
- `packages/view-engine/src/index.ts` (`export {}` → `export * from './workspace/index.js'`)

Unchanged: `packages/shared-types/**`, every other package, all `package.json`
/ root config, plans/ADRs, `CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- No new `shared-types` contract was required: `ViewSlot`, `ViewGroup`,
  `ResourceDemand` and the branded ids were reused unchanged (ADR-010 §1).
- The registry stores `ViewSlot` values immutably; `ImagingWorkspace` clones
  registered studies/assets JSON-wise. This is sound because every reachable
  Phase 1 contract is a plain JSON value (validator + `deepStrictEqual`
  evidence). **P4.2/P4.3 must not reuse the JSON-clone regime for shared-state
  objects**: P4.3 requires object identity shared across views, so identity-
  preserving references must be used there (reviewer’s carried risk).
- A structurally coherent layout with fewer than four groups is accepted
  (“up to 16 slots”, architecture §8); the default workspace always allocates
  four. The 16-slot cap is logical and is never a WebGL-context count
  (ADR-010 §5).
- Rebinding a slot clears its previously declared `resourceDemand`, so P4.7
  never reconciles demand against a stale asset.

## 4. Tests Added & Executed

Added `tests/view-engine/workspace-core.test.ts` (11 tests, 1 suite).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm run build` | clean (exit 0, `tsc -b`) |
| `npm test` | **269 pass / 0 fail** (59 suites, 0 skipped/todo) = P3.6 baseline 258/58 + 11 tests / +1 suite |
| `node --test tests/view-engine/workspace-core.test.ts` | **11 pass / 0 fail** |
| `npm run test:python` | 189 passed (unchanged) |
| `npm run typecheck:python` | clean over 47 files (unchanged) |

Coverage: default 4×4/16 allocation and role/group invariants; study/asset
registration and JSON snapshot round-trip; the full
`empty → bound → prepared → unavailable → rebind → unbind` chain; demand
visibility, rebind clearing and unbind clearing; fresh-copy isolation;
duplicate study/asset and asset-without-study; five illegal transitions;
`setDemand` guard; unknown slot/group; and invalid layouts (foreign role,
undeclared group, duplicate slot id, duplicate group id, 17 slots, >4 groups,
short group) with valid full and reduced controls. No `skip`/`todo`/`|| true`
and no vacuous assertions.

Independent verdicts: `nuclear-reviewer` **PASS** (zero blocking; 7
non-blocking findings) and `nuclear-qa` **PASS** for the executable scope.

## 5. Documentation, Agentlog & ADR Status

- ADR-010 remains **Accepted**; P4.1 implements its §1 (package boundary), §2
  (slot/group model) and §6 (demand stored, never reconciled) clauses. No ADR
  change was required.
- This report satisfies the AgentLog Gate for P4.1.
- `CHANGELOG.md` untouched; release notes are compiled later via
  `/promote-changelog 4` only on explicit request.

## 6. Project Model Impact

- None. No `.ncp` schema change. `ImagingWorkspaceSnapshot` is an in-package
  serializable shape; making it a persisted `project-model` contract remains a
  future, explicitly-scoped decision (ADR-010).

## 7. Known Limitations & Technical Debt

- **Carried Phase 3 debt**: `tests/**` (now including `tests/view-engine/*`)
  remains outside the `tsc` graph; TypeScript errors in tests surface only at
  runtime. `renderer/adapter.ts` (300) and `renderer/medical-capture.ts`
  (299/300) still have zero headroom; hardware-GPU and true production-bundle
  evidence remain `NOT YET APPLICABLE`.
- `view-slot-registry.ts` is 273/300 and `workspace-core.test.ts` is 311 lines
  (test files are outside the Rule 02 source-length gate). When a later brief
  permits new files, extract layout validation into its own module.
- Reviewer NB-1/NB-2/NB-3/NB-4 were addressed in this slice (added >4-groups,
  short-group and reduced-layout cases; JSON-clone-on-registration; documented
  the JSON-only `cloneValue` invariant; `bind` now clears stale demand). NB-5
  (size headroom), NB-6 (`tests/**` outside `tsc`) and NB-7 (this report)
  remain as noted.
- `@nuclear/view-engine` declares a permitted-but-currently-unused
  `@nuclear/medical-engine` dependency; it is consumed from P4.7.

## 8. Exact Next Recommended Task

Proceed to **P4.2 — `PreparedView` assembly and provenance**: derive a valid
`PreparedView` (frozen `MedicalViewState` + links + locks + `ViewProvenance`,
optional cached-preview reference) from a bound slot/view, with fail-closed
cases for a missing binding or missing provenance. Assembly alone must issue
**no** `ResourceManager` retain (residency stays P4.7), and P4.2 must declare
which payloads are value-cloned versus identity-preserving before P4.3
introduces shared-state objects. Do not add shared state (P4.3), linking
(P4.4), lock/override (P4.5), surfaces (P4.6) or demand projection (P4.7) in
P4.2.

---

# Handover Report — P4.2: `PreparedView` Assembly and Provenance

## 1. What Was Implemented

P4.2 added pure, Node-safe `PreparedView` assembly and registration to
`@nuclear/view-engine`, and made the workspace own the prepared views.
Assembly consumes an already-defined `MedicalViewState` plus `ViewProvenance`
and produces a serializable `PreparedView`; it issues **no** `ResourceManager`
call and pins no RAM/VRAM (residency stays P4.7).

- **Typed errors** (`prepared-view/errors.ts`): `PreparedViewError` with a
  `PreparedViewErrorCode` union (`MISSING_PROVENANCE`, `EMPTY_PROVENANCE`,
  `BINDING_NOT_IN_PROVENANCE`, `DUPLICATE_LOCK`, `DUPLICATE_ID`,
  `UNKNOWN_ID`, plus the reserved `SOURCE_VIEW_MISMATCH`) and messages naming
  the offending view/asset/state id plus a remediation clause.
- **Assembly** (`prepared-view/assemble.ts`): `assemblePreparedView(input)`
  validates fail-closed in a fixed order — missing provenance → empty
  provenance (`sourceAssetIds`/`sourceFingerprints`) → bound asset absent
  from provenance → duplicate lock — then returns a `PreparedView` whose
  `sourceViewId` is **derived** from `MedicalViewState.id`. `boundAssetIds`
  covers the `dataBinding` plus every composition layer (single vs
  fusion/multi-layer) and dedupes in order.
- **Identity rule (deliberate)**: `state` and `provenance` are stored **by
  reference** — no JSON clone — while `links`/`locks` are shallow-copied.
  This is required so P4.3 shared-state groups can observe the same
  `MedicalViewState` object across views. `PreparedViewRegistry` also returns
  the stored object by reference from `get`/`list`/`snapshot`.
- **Registry** (`prepared-view/registry.ts`): register/get/has/list/snapshot
  with `PREPARED_VIEW_DUPLICATE_ID`/`PREPARED_VIEW_UNKNOWN_ID`.
- **Workspace integration**: `ImagingWorkspace` gains `preparedViews`,
  `registerPreparedView` (every `provenance.sourceAssetIds` id must be a
  registered asset, else `WORKSPACE_UNKNOWN_ASSET`, checked before any
  mutation), `getPreparedView`/`listPreparedViews`, and a `preparedViews`
  snapshot field.

## 2. Files Changed / Created

Created:
- `packages/view-engine/src/prepared-view/errors.ts` (49 lines)
- `packages/view-engine/src/prepared-view/assemble.ts` (128 lines)
- `packages/view-engine/src/prepared-view/registry.ts` (54 lines)
- `packages/view-engine/src/prepared-view/index.ts` (11 lines)
- `tests/view-engine/prepared-view.test.ts` (~264 lines)

Modified:
- `packages/view-engine/src/index.ts` (adds the prepared-view barrel)
- `packages/view-engine/src/workspace/imaging-workspace.ts` (~158 lines)

Unchanged: `packages/shared-types/**`, every other package, all `package.json`
/ root config, plans/ADRs, `CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- **Identity over value for shared state.** P4.2 deliberately preserves object
  identity for `state`/`provenance`; the workspace snapshot therefore has a
  documented asymmetry — studies/assets/slots are JSON-cloned, prepared views
  are by reference. P4.3 must not clone shared `SpatialState`/`CameraState`.
- **Fixture seam (carried debt).** `mockMedicalView` binds the literal
  `'asset-ct'` while `mockViewProvenance` lists `'asset-ct-001'`/
  `'asset-pet-001'`; this is a pre-existing Phase 1 fixture incoherence, and
  accepted P3 suites assert the literal. P4.2 does **not** weaken the
  binding-vs-provenance check to accommodate it; it uses internally
  consistent pet/fusion pairs and pins the mismatch as a fail-closed
  regression test (case 13). A dedicated fixture-hygiene slice should fix the
  Phase 1 ids and the P3 assertions together.
- `PREPARED_VIEW_SOURCE_VIEW_MISMATCH` is reserved and currently unreachable
  because `sourceViewId` is derived; it is documented as reserved rather than
  removed.

## 4. Tests Added & Executed

Added `tests/view-engine/prepared-view.test.ts` (14 tests, 1 suite).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm run build` | clean (exit 0, `tsc -b`) |
| `npm test` | **283 pass / 0 fail** (60 suites, 0 skipped/todo) = P4.1 269/59 + 14 tests / +1 suite |
| `node --test tests/view-engine/prepared-view.test.ts` | 14 pass / 0 fail |
| `node --test tests/view-engine/workspace-core.test.ts` | 11 pass / 0 fail |
| `npm run test:python` | 189 passed (unchanged) |
| `npm run typecheck:python` | clean over 47 files (unchanged) |

Coverage: derived `sourceViewId` + strict reference identity of state and
provenance; default/shallow-copied links and locks; registry identity
preservation; workspace registration once provenance assets are registered;
fusion assembly; JSON serializability without masking identity; and
fail-closed negatives for missing/empty provenance, bound-asset-absent,
duplicate locks, duplicate/unknown ids, unregistered provenance asset (no
state mutation) and the pinned fixture seam. A final case pins the validation
order (provenance binding check wins over the lock check). No
`skip`/`todo`/`|| true` and no vacuous assertions.

Independent verdicts: `nuclear-reviewer` **PASS** (zero blocking; 6
non-blocking findings) and `nuclear-qa` **PASS** for the executable scope.

## 5. Documentation, Agentlog & ADR Status

- ADR-010 remains **Accepted**; P4.2 implements §1 (workspace owns prepared
  views; package boundary) and §6 (assembly declares no demand). No ADR change
  was required.
- This report satisfies the AgentLog Gate for P4.2.
- `CHANGELOG.md` untouched; release notes are compiled later via
  `/promote-changelog 4` only on explicit request.

## 6. Project Model Impact

- None. No `.ncp` schema change. The workspace snapshot now carries
  `preparedViews` in memory; persisting them remains a future, explicitly
  scoped `project-model` decision.

## 7. Known Limitations & Technical Debt

- **Carried Phase 3 debt**: `tests/**` remains outside the `tsc` graph;
  `renderer/adapter.ts` (300) and `renderer/medical-capture.ts` (299/300)
  still have zero headroom; hardware-GPU and true production-bundle evidence
  remain `NOT YET APPLICABLE`.
- **Fixture defect to track**: the Phase 1 `mockMedicalView` asset-id
  incoherence (see §3). Recommended as a small dedicated fixture-hygiene
  slice that updates the fixture literal and the P3 view-application
  assertions plus P4.2 case 13 in one change.
- Reviewer non-blocking notes addressed here: reserved-code comment,
  snapshot-asymmetry comment, validation-order pin. Remaining: `boundAssetIds`
  O(n²) dedup (cosmetic), no 1:1 asset↔fingerprint check (not required).
- `@nuclear/view-engine` still declares a permitted-but-unused
  `@nuclear/medical-engine` dependency; consumed from P4.7.

## 8. Exact Next Recommended Task

Proceed to **P4.3 — shared-state groups**: let several views reference the
*same* `SpatialState`/`CameraState` object instead of an imperative notify
chain, with object identity observable and in-place mutation refused so one
view cannot silently change another. P4.3 must preserve the by-reference
identity contract introduced in P4.2 and must not clone shared state objects.
Do not add linking (P4.4), lock/override application (P4.5), surfaces (P4.6)
or demand projection (P4.7) in P4.3.

---

# Reopened — Human Review & Ratified Correction Plan (2026-09-22)

An independent human review inspected the exact checkouts `72fbaee`,
`8cdad35` and `a70983c`. All executable gates were green
(typecheck/build clean, `npm test` 283/283 / 60 suites, pytest 189, mypy 47,
P4.1 11/11, P4.2 14/14, no React/DOM/Cornerstone/residency in `view-engine`),
but the green tests did **not** cover the defects below. P4.0, P4.1 and P4.2
are therefore **reopened**, not closed.

## Confirmed defects

| # | Slice | Defect | Evidence |
| --- | --- | --- | --- |
| 1 | P4.1 | `cloneValue` JSON stringify/parse silently normalises clinical data: `NaN`/`±Infinity` → `null` | `imaging-workspace.ts:39`, applied at `:65`/`:83` (write) and `:108-120` (read); `JSON.stringify(NaN)` → `null` |
| 2 | P4.1 | ADR-010 §2 said “exactly four groups” while `assertValidLayout` accepts 0–4 and a test declares a 2-group layout valid | ADR-010 §2; `view-slot-registry.ts:108-118`; test 10 |
| 3 | P4.1 | `ResourceDemand` mutator landed in P4.1 (scope creep before P4.7) | `view-slot-registry.ts:211-222` |
| 4 | P4.0 | ADR-010 §3 / plan claimed co-reference requires an equal `geometricDigest`, which the shared validator does not (and must not) enforce | `view-validators.ts:78-82`; `mockIntraStudyLink` is same-FoR CT+PET with different digests and is valid evidence |
| 5 | P4.2 | Registered `PreparedView` mutable from outside: registry returns the stored object, no runtime freeze | `prepared-view/registry.ts:22`; `view.state.camera.zoom = 77` alters stored state |
| 6 | P4.2 | Provenance not correlated to registered assets (asset ↔ study ↔ series ↔ fingerprint) | `imaging-workspace.ts:87-97` checks existence only |
| 7 | P4.2 | No slot-binding requirement despite the plan wording; spec/implementation incoherence | `registerPreparedView` never consults `ViewSlot` |
| 8 | P4.2 | `ViewProvenance` shared by reference without an architectural need | `prepared-view/assemble.ts` |

Carried transversal debt: `tests/**` outside the `tsc` graph;
`renderer/adapter.ts` (300) and `renderer/medical-capture.ts` (299/300);
Phase 1 fixture incoherence (`'asset-ct'` vs `'asset-ct-001'`).

## Ratified decisions

- **D1:** slot rule = **1–4 groups, default 4, max 16, lower bound ≥ 1**
  (ADR-010 §7.1).
- **D2:** co-reference = **same worker-verified `FrameOfReferenceUID` +
  verified geometric compatibility + snapshot ↔ asset ↔ series ↔ fingerprint
  correlation**. Identical `geometricDigest` is **not** required and must not
  be enforced (ADR-010 §7.2).
- **D3:** a `PreparedView` may exist **without** a slot; slot→prepared-view
  binding is a separate explicit, fail-closed operation.
- **D4:** published DTOs immutable; shared state in a **private holder with
  controlled, atomically-replacing mutation**; no free in-place mutation and
  no indiscriminate freezing (ADR-011).
- **D5:** runtime integrity validation is **local to `view-engine`**; no new
  package until a real second consumer exists.

## Ratified corrective slices (before P4.3)

`C8 → C1 → C5 → ADR-011 → C4 → C3 → C2 → C6 → C7`

- **C8 (P4.T):** bring `tests/**` into the `tsc` graph.
- **C1 (P4.1.1):** reject non-finite / non-JSON-safe input instead of
  JSON-normalising it.
- **C5 (P4.2.2):** provenance ↔ registered-asset cross-validation (positional
  1:1).
- **C4 (P4.2.1):** published-DTO immutability + private controlled shared-state
  holder.
- **C3 (P4.0.1):** co-reference contract honesty + snapshot ↔ asset ↔ series ↔
  fingerprint check; negative series-mismatch and positive
  different-digest/same-FoR tests.
- **C2 (P4.1.2):** slot/group rule 1–4 with ≥ 1 enforced.
- **C6 (P4.2.3):** explicit fail-closed slot→`PreparedView` binding.
- **C7:** Phase 1 fixture hygiene.

## Process status

- P4.0/P4.1/P4.2 remain committed locally as the historical baseline; they are
  **not** closed slices. Corrections land as **new commits on top** (no local
  history rewrite without explicit request).
- ADR-010 §7 addendum and ADR-011 are **Accepted** and binding.
- `AGENTS.md` remains “Phase 3 Complete” until Phase 4 truly closes.
- **Nothing pushed.** Push remains user-authorized only.

---

# Handover Report — C8 (P4.T): `tests/**` in the `tsc` Type Graph

## 1. What Was Implemented

C8 brought every TypeScript file under `tests/**` into the `tsc` type graph
under the inherited `strict` settings, and made that a **non-optional gate**.
Baseline was **83 errors across 26 files**; the slice fixes all of them without
changing a single test's behaviour, assertion, expected value or name.

- **New `tsconfig.test.json`** (root): extends `tsconfig.base.json`, keeps
  `strict`/`noImplicitAny`/`noUnusedLocals`/`noUnusedParameters`,
  enables `allowImportingTsExtensions` (167 `.ts`-extension imports) and
  `allowJs` (to resolve the harness `.mjs` import) with `noEmit`,
  `composite:false`. `include: ["tests/**/*.ts"]`; `exclude` is exactly
  `node_modules`, `tests/cases` (gitignored real DICOM data, no `.ts`),
  `tests/rendering/.harness` (generated esbuild bundles). No test path was
  excluded to hide an error.
- **Gate wired**: root `npm run typecheck` is now
  `tsc -b && tsc -p tsconfig.test.json`; a `typecheck:tests` script was added.
- **Error families fixed** (type-only): `InstanceType<typeof X>` aliases for
  values imported through destructured dynamic-import consts (`TS2749`);
  union/`unknown` narrowing and proper predicates (`TS2339`/`TS18046`/
  `TS18048`); removal of non-overlapping casts (`TS2352`); removal of unused
  locals/imports (`TS6133`/`TS6196`); a wrong type-only relative path in
  `rendering/fixtures/target-test-support.ts` (`TS2307`); a duplicate ambient
  probe global consolidated into `rendering/fixtures/renderer-probe-global.ts`
  (`TS2403`); localized optional-call/guards (`TS2722`, `TS2488`, `TS2353`,
  `TS2345`, `TS2322`).
- **No weakening**: zero `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`; zero
  added `as unknown as`; `strict` flags untouched.
- **Non-vacuity proven**: an injected `const qaProbe: number = "x"` in a
  test file makes `npx tsc -p tsconfig.test.json` exit non-zero (verified at
  root and in a nested test dir); the probe was removed.

## 2. Files Changed / Created

Created:
- `tsconfig.test.json` (root, 16 lines)
- `tests/rendering/fixtures/renderer-probe-global.ts` (23 lines, ambient types only)

Modified:
- `package.json` (root scripts: `typecheck`, `typecheck:tests`)
- ~31 files under `tests/**` (validators as type predicates, fixtures typing,
  rendering browser entries, focused suites)

No file under `packages/**` or `python/**` changed.

## 3. Architectural Assumptions Made

- Test sources now participate in static type checking; the long-carried
  Phase 3 debt “`tests/**` outside the `tsc` graph” is **closed**.
- Type-only edits are acceptable across accepted Phase 3 test files because
  the runtime suite is unchanged (283/283, identical suite topology).
- `tests/contracts/view-validators.ts` was touched **type-only** (predicates,
  a captured local); `isIntraStudyLink` runtime logic is unchanged, so C3 can
  still add the snapshot↔asset↔series correlation.
- A localized `as FigureAnnotation` bridges a **real frozen-contract defect**
  (see §7); it changes no runtime value.

## 4. Tests Added & Executed

No test was added or removed; the slice makes the existing suite
type-checked.

| Command | Observed result |
| --- | --- |
| `npx tsc -p tsconfig.test.json` | exit 0 (83 → 0 errors) |
| `npm run typecheck` (`tsc -b && tsc -p tsconfig.test.json`) | exit 0 |
| `npm test` | **283 pass / 0 fail / 60 suites** (0 skipped/todo) — unchanged |
| `npm run build` | clean (exit 0) |
| `node --test tests/view-engine/workspace-core.test.ts` | 11/11 |
| `node --test tests/view-engine/prepared-view.test.ts` | 14/14 |
| `npm run test:python` | 189 passed (unchanged) |
| `npm run typecheck:python` | 47 files clean (unchanged) |
| Gate-failure proof | intended test type error → `tsc` exit 2 (root + nested), probe removed |

Independent verdicts: `nuclear-reviewer` **PASS** (zero blocking; 5
non-blocking) and `nuclear-qa` **PASS** for the executable scope.

## 5. Documentation, Agentlog & ADR Status

- No ADR change is required by C8; it implements the C8 row of the ratified
  plan and the testing skill's Gate 3.
- This report satisfies the AgentLog Gate for C8.
- `CHANGELOG.md` untouched; release notes are compiled later via
  `/promote-changelog 4` only on explicit request.

## 6. Project Model Impact

- None. The contract is unchanged; `tests/**` is now type-checked but the
  `.ncp` schema and packages are untouched.

## 7. Known Limitations & Technical Debt

- **Real frozen-contract defect surfaced**: `figure-validators.ts` requires a
  top-level `coordinateSpace` for every annotation kind, but
  `FigureRoiAnnotation` carries it only inside `geometry`
  (`packages/shared-types/src/figure.ts:135-139`). A contract-valid ROI
  annotation would be rejected by the validator. C8 bridges it with one
  localized `as FigureAnnotation` (no runtime change); it must be reconciled
  in a dedicated fixture/contract slice.
- Pre-existing `as unknown as` escapes in tests (47) are now inside the type
  gate; they compile clean but are unreviewed and worth a hygiene pass.
- Non-null `!` additions (6× `worldBounds`, 1× `spatialTransform`) encode test
  invariants; replacing them with `assert.ok` guards would improve failure
  messages (non-blocking).
- `typecheck` now runs two `tsc` invocations (no incremental project for
  tests); acceptable at this scale.

## 8. Exact Next Recommended Task

Proceed to **C1 (P4.1.1) — workspace input integrity**: replace
`ImagingWorkspace.cloneValue`'s JSON normalization with validation that
fails closed on non-finite / non-JSON-safe input, with negative tests that
exercise the **real public workspace API** using freshly constructed
`NaN`/`±Infinity`/`Date`/`Map`/`Set`/`bigint` values and assert a typed,
path-naming error with no mutation on refusal. Do not route the negatives
through the pre-existing `as unknown as` fixture escapes. Do not start C5 or
C4 in the same slice.


