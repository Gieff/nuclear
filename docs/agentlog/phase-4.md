# Phase 4 — View Engine: Workspace, Link/Lock/Override & Persistent Surfaces

Status: **P4.0–P4.4 CLOSED** (2026-09-22). P4.0–P4.2 were closed after the
independent review reopened them and the ratified corrective chain landed
(final corrective HEAD `a46099d`; `npm test` 348/348, 68 suites, typecheck/build
clean, pytest 189, mypy 47). **P4.3 (shared-state groups)** closed under the
binding ADR-011 addendum contract (`private holder → atomic replacement → new
projection → frozen published DTO`); its test file was split by `8ab08f5`
(361/361, 70 suites). **P4.4 (link semantics) is closed** under ADR-010 §3/§7.2 (co-referenced
application restricted to the exact `{spatial, camera}` synchronized set):
`npm test` **384/384 (72 suites)**, typecheck/build clean. **P4.5–P4.8 pending**;
the next slice is P4.5 (lock and override). Reopened slices closed: P4.0
(co-reference contract honesty),
P4.1 (workspace input integrity, slot rule), P4.2 (`PreparedView` assembly,
provenance correlation, published-DTO immutability).
Corrective commits: `db4ba42` + `f71d609` (C8), `7680acc` (C1), `0c8921e`
(C2+C5+C6), `95a04fb` (C3+C7), `f8a5571` (C4), `a46099d` (C1b+C4b). See
`docs/plans/PHASE_4_VIEW_ENGINE_PLAN.md` §“Reopened — Ratified Correction
Slices”, `docs/decisions/ADR-010-…md` §7 and
`docs/decisions/ADR-011-prepared-view-immutability-and-shared-state-mutation.md`.
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
Baseline was **83 errors across 26 files**; the slice fixes all of them. With
**one explicitly declared exception** (below), the changes are type-only and do
not alter a test's assertion, expected value or name.

**Declared runtime exception (corrected after review).** The original C8 report
claimed “no behaviour changed” while `tests/rendering/fixtures/volume-entry.ts`
had changed a real call from `voxelManager?.getCompleteScalarDataArray()` to
`voxelManager?.getCompleteScalarDataArray?.() ?? new Float32Array(0)`. That is a
runtime change: when `voxelManager` exists but the method is absent, the probe
previously threw and now continued with empty scalar data. The chosen semantics
is **the method is indispensable → explicit failure**: the guard was extracted
to the Node-safe `tests/rendering/fixtures/scalar-data-access.ts`
(`requireCompleteScalarData`), which throws a named error when the source or
method is absent and otherwise calls the method with the source as `this`;
`volume-entry.ts` uses it, and `tests/rendering/scalar-data-access.test.ts`
covers the present/absent/undefined branches. The browser `volume-load` suite
still passes, confirming the real `VoxelManager` exposes the method, so the
observable behaviour on every real path is unchanged.

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
- `tests/rendering/fixtures/scalar-data-access.ts` (corrective; Node-safe fail-closed guard)
- `tests/rendering/scalar-data-access.test.ts` (corrective; 4 tests)

Modified:
- `package.json` (root scripts: `typecheck`, `typecheck:tests`)
- ~31 files under `tests/**` (validators as type predicates, fixtures typing,
  rendering browser entries, focused suites)

No file under `packages/**` or `python/**` changed.

## 3. Architectural Assumptions Made

- Test sources now participate in static type checking; the long-carried
  Phase 3 debt “`tests/**` outside the `tsc` graph” is **closed**.
- With the single declared exception in §1 (`volume-entry.ts` scalar-data
  access, now fail-closed and unit-tested), edits across accepted Phase 3 test
  files are type-only; the runtime suite is otherwise unchanged (identical
  suite topology, 283 pre-existing tests).
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
| `npm test` | **287 pass / 0 fail / 61 suites** (0 skipped/todo): 283/60 baseline + 4 corrective guard tests |
| `npm run build` | clean (exit 0) |
| `node --test tests/view-engine/workspace-core.test.ts` | 11/11 |
| `node --test tests/view-engine/prepared-view.test.ts` | 14/14 |
| `node --test tests/rendering/scalar-data-access.test.ts` | 4/4 (guard: present → data; absent/undefined → throws) |
| `node --test tests/rendering/volume-load.test.ts` | 4/4 browser probe unchanged on the real path |
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

- **C8 review exception (resolved).** The only runtime change in C8 was
  `tests/rendering/fixtures/volume-entry.ts` reading complete scalar data; it
  is now fail-closed through `requireCompleteScalarData` and unit-tested, so
  the “type-only” claim holds except for this declared, tested correction.
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

---

# Handover Report — C1 (P4.1.1): Workspace Input Integrity

## 1. What Was Implemented

C1 removed the silent JSON normalization from `ImagingWorkspace`. Previously
`JSON.parse(JSON.stringify(value))` turned `NaN`/`±Infinity` into `null` and
mangled `Date`/`Map`/`Set`/`bigint`/`symbol`. Registration and reads now use a
**fail-closed validation + safe clone** that refuses invalid input with a
typed error naming the exact path, **before any workspace mutation**.

- **`value-integrity.ts`**: `assertSerializableValue(value, context)` walks the
  graph and throws on the first unsafe node; `cloneSerializableValue` =
  assert then `structuredClone`. Rejects:
  - non-finite numbers (`NaN`, `±Infinity`) → `WORKSPACE_NON_FINITE_NUMBER`;
  - `bigint`, `function`, `symbol`, symbol-keyed properties and non-plain
    objects (`Date`/`Map`/`Set`/class instances) → `WORKSPACE_UNSUPPORTED_VALUE`;
  - true cycles (an object that is its own ancestor) → `WORKSPACE_CYCLIC_VALUE`.
  Allows strings, finite numbers, booleans, `undefined`, `null`, plain
  objects, arrays, `-0`, and **shared non-cyclic references** (cycle detection
  uses an ancestor set, not a global visited set). No `Math.` is used
  (`Number.isFinite`).
- **`errors.ts`**: added the three codes with the existing actionable-message
  style.
- **`imaging-workspace.ts`**: JSON `cloneValue` deleted. `registerStudy` /
  `registerAsset` validate the **caller's original object** before touching
  any `Map`/`Set`, so a refusal leaves the workspace byte-identical. Reads
  return `structuredClone` copies of the already-validated stored value.

## 2. Files Changed / Created

Created:
- `packages/view-engine/src/workspace/value-integrity.ts` (141 lines)
- `tests/view-engine/workspace-integrity.test.ts` (282 lines, 11 tests)

Modified:
- `packages/view-engine/src/workspace/errors.ts` (45 lines, +3 codes)
- `packages/view-engine/src/workspace/imaging-workspace.ts` (162 lines)
- `packages/view-engine/src/workspace/index.ts` (12 lines)

Unchanged: `packages/shared-types/**`, every other package, `python/**`,
plans/ADRs, `CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- **Error precedence: integrity → duplicate/unknown → (future) correlation.**
  Integrity is validated first; a payload that is both invalid and a duplicate
  reports the integrity error. This is deterministic, both outcomes leave
  state identical, and it is now recorded here. C5 must slot its provenance
  correlation into this precedence deliberately (see §8).
- **Published reads remain mutable clones.** C1 only guarantees refusal and
  copy isolation; deep-freezing published DTOs is **C4/ADR-011**, out of scope
  here.
- **Dates must stay ISO strings.** The workspace now refuses `Date`
  instances; contracts already carry timestamps as ISO strings (fixtures
  comply — test 1 proves the JSON round-trip). Future fixture authors must not
  introduce `new Date(...)`.
- `structuredClone` runs only after validation; it is typed through the
  configured DOM lib and is a real global on Node 24 / Chromium-Electron.

## 4. Tests Added & Executed

Added `tests/view-engine/workspace-integrity.test.ts` (11 tests, 2 suites).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npx tsc -p tsconfig.test.json` | exit 0 |
| `npm test` | **298 pass / 0 fail / 63 suites** (0 skipped/todo) = C8-corrective baseline 287/61 + 11 tests / +2 suites |
| `npm run build` | clean (exit 0) |
| `node --test tests/view-engine/workspace-integrity.test.ts` | 11/11 |
| `node --test tests/view-engine/workspace-core.test.ts` | 11/11 (regression intact) |
| `node --test tests/view-engine/prepared-view.test.ts` | 14/14 (regression intact) |
| `npm run test:python` | 189 passed (unchanged) |
| `npm run typecheck:python` | 47 files clean (unchanged) |

Coverage: valid registration + JSON round-trip; copy isolation; `NaN` in
`geometry.origin[0]`; `NaN`/`±Infinity` in metadata/geometry paths; nested
`Date`; `Map`/`Set`/`bigint`/function; true cycle; symbol value and
symbol-keyed property; `-0` preservation; shared-reference preservation; the
study boundary. Every negative asserts the exact `error.code`, a message
naming the path, and that `listAssets()`/`listStudies()`/`snapshot()` are
unchanged after refusal. No `skip`/`todo`/`|| true` and no vacuous assertions.

Independent verdicts: `nuclear-reviewer` **CONCERNS** on the (then-missing)
AgentLog gate, with the code itself **PASS** on all nine checks; `nuclear-qa`
**PASS** for the executable scope. This report resolves the gate.

## 5. Documentation, Agentlog & ADR Status

- No ADR change needed: C1 implements the C1 row of the ratified plan and
  ADR-010 §7.4’s “runtime integrity validation local to `view-engine`”.
- This report satisfies the AgentLog Gate for C1.
- `CHANGELOG.md` untouched; release notes are compiled later via
  `/promote-changelog 4` only on explicit request.

## 6. Project Model Impact

- None. The workspace still stores plain JSON-domain values; the refusal
  boundary is stricter, but no persisted schema changed.

## 7. Known Limitations & Technical Debt

- **Snapshot claim scope (C1 review N2).** `snapshot()` still deep-equals its
  JSON round-trip only for payloads without `-0` or explicit
  `undefined`-valued properties (`JSON.stringify` maps `-0 → 0` and drops
  `undefined` keys). The read path itself is lossless.
- **Residual edge normalizations (N3).** Custom-prototype *arrays*, null-
  prototype objects and getter properties are not covered by the ratified C1
  list; they remain JSON-domain-equivalent.
- **Test escapes disclosed (N5).** The new suite uses two **local**
  `as unknown as` widenings (`invalidAsset`/`invalidStudy`) to construct
  deliberately-invalid values per call; they are not the pre-existing fixture
  escapes C8 forbade reusing. Zero `@ts-ignore`/`@ts-expect-error`.
- **Fingerprint sensitivity (N4).** The no-mutation check uses
  `JSON.stringify(snapshot)`; a structural fingerprint would be stronger.
- **Path rendering (N6).** Non-identifier keys render as `metadata.my key`
  rather than bracket notation (cosmetic).
- `value-integrity.test.ts` is 282 lines (tests are outside the Rule 02
  source gate); all source files are ≤162 lines.

## 8. Exact Next Recommended Task

Proceed to **C5 (P4.2.2) — provenance ↔ registered-asset cross-validation**:
require equal lengths of `sourceAssetIds`/`sourceSeriesInstanceUIDs`/
`sourceFingerprints`, positional one-to-one correspondence, matching
`studyInstanceUID`, matching asset `seriesInstanceUID`, and a deep-equal
`sourceFingerprint`, all against the **stored, validated clones** (never the
caller’s mutable object), mutating nothing before every correlation check
passes. Place its errors explicitly into the C1 precedence
(integrity → duplicate/unknown → correlation) and record it. Do not add C4
freezing or C2 slot-rule changes in C5.

---

# Handover Report — Bundle A (C2 + C5 + C6): Workspace/Slot Integrity & Binding

## 1. What Was Implemented

Three ratified corrective slices were implemented as one bundle (same
workspace/slot integrity boundary; zero unrelated churn). The bundling is an
explicit optimisation authorised by the user, **not** a reorder of the
remaining ratified sequence (`C4 → C3 → C7` still follow).

- **C5 — provenance ↔ registered-asset cross-validation.** `registerPreparedView`
  now runs the existence check (`WORKSPACE_UNKNOWN_ASSET`), then a
  `PREPARED_VIEW_DUPLICATE_ID` pre-check, then positional provenance
  correlation against the **stored validated assets**: equal array lengths,
  then per index `studyInstanceUID` → `seriesInstanceUID` → structurally
  equal `SourceFingerprint`. Check order is fixed: length → study → series →
  fingerprint. Correlation is read-only, so a refusal leaves workspace and
  caller untouched. Extracted to `prepared-view/provenance-correlation.ts`
  with four new `PREPARED_VIEW_PROVENANCE_*` codes.
- **C6 — explicit fail-closed slot → PreparedView binding.**
  `ImagingWorkspace.bindSlotToPreparedView(slotId, preparedViewId)` requires
  the prepared view to be registered (`PREPARED_VIEW_UNKNOWN_ID`) before
  delegating to `ViewSlotRegistry.bind` (`WORKSPACE_UNKNOWN_SLOT` /
  `WORKSPACE_ILLEGAL_SLOT_TRANSITION`). A registered prepared view with zero
  bound slots remains legal.
- **C2 — slot/group rule.** `assertValidLayout` now refuses a zero-group
  layout (`WORKSPACE_SLOT_LAYOUT_INVALID`); a workspace declares 1–4 groups
  of exactly four slots and the default factory still allocates four.
- **Helper**: dependency-free `internal/json-equality.ts` (`structurallyEqual`,
  key-order independent, `Object.is` scalars, no cloning/mutation), imported
  by the correlation module with no `prepared-view → workspace` cycle.

## 2. Files Changed / Created

Created:
- `packages/view-engine/src/internal/json-equality.ts` (61 lines)
- `packages/view-engine/src/prepared-view/provenance-correlation.ts` (132 lines)
- `tests/view-engine/workspace-provenance-binding.test.ts` (264 lines, 13 tests)
- `tests/view-engine/json-equality.test.ts` (9 tests, added during review hardening)

Modified:
- `packages/view-engine/src/prepared-view/errors.ts` (52 lines, +4 codes)
- `packages/view-engine/src/prepared-view/index.ts` (12 lines)
- `packages/view-engine/src/workspace/imaging-workspace.ts` (197 lines)
- `packages/view-engine/src/workspace/view-slot-registry.ts` (277 lines)
- `tests/view-engine/workspace-core.test.ts` (C2 zero-group negative + message pin)

Unchanged: `packages/shared-types/**`, every other package, `python/**`,
plans/ADRs, `CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- **Error precedence (recorded): integrity/existence → duplicate → correlation.**
  The duplicate-id pre-check was added *before* correlation during review
  hardening so a payload that is both a duplicate and incoherent reports the
  duplicate, matching the C1 handover rule.
- Correlation reads the **stored `structuredClone` assets**, never the
  caller's mutable object.
- C6 does **not** make slot binding a prerequisite for registration/assembly
  (ADR-010 §7.3 / D3); slot binding is a separate explicit operation.
- `structurallyEqual` uses `Object.is`, so `-0 ≠ 0` and `NaN = NaN`; object
  key order is irrelevant.
- The bundle order deviates from the ratified `C5 → ADR-011 → C4 → C3 → C2 →
  C6 → C7` sequence by explicit user instruction to optimise; C4/C3/C7 keep
  their order.

## 4. Tests Added & Executed

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npx tsc -p tsconfig.test.json` | exit 0 |
| `npm test` | **320 pass / 0 fail / 66 suites** (0 skipped/todo) = C1 baseline 298/63 + 22 tests / +3 suites |
| `npm run build` | clean (exit 0) |
| `node --test tests/view-engine/workspace-provenance-binding.test.ts` | 13/13 |
| `node --test tests/view-engine/json-equality.test.ts` | 9/9 |
| `node --test tests/view-engine/workspace-core.test.ts` | 11/11 |
| `node --test tests/view-engine/workspace-integrity.test.ts` | 11/11 |
| `node --test tests/view-engine/prepared-view.test.ts` | 14/14 |
| `npm run test:python` | 189 passed (unchanged) |
| `npm run typecheck:python` | 47 files clean (unchanged) |

Coverage: coherent provenance accepted; PET/CT series and fingerprint
mismatches; length and study mismatches; no mutation on refusal; slot binding
success and all three refusal paths; unbound-view legality; zero-group layout
refusal with a pinned message; and `structurallyEqual` scalar/key-order/array/
missing-vs-undefined cases. No `skip`/`todo`/`|| true` and no vacuous
assertions.

Independent verdicts: `nuclear-reviewer` **PASS** (zero blocking; 7
non-blocking, of which N1/N3/N4 were fixed during hardening) and `nuclear-qa`
**PASS** for the executable scope.

## 5. Documentation, Agentlog & ADR Status

- No ADR change needed: C2 implements ADR-010 §7.1; C5 implements §7.3; C6
  implements D3. `ADR-011` is unchanged.
- This report satisfies the AgentLog Gate for C2, C5 and C6.
- `CHANGELOG.md` untouched; release notes are compiled later via
  `/promote-changelog 4` only on explicit request.

## 6. Project Model Impact

- None. No `.ncp` schema change; the workspace stays a plain-JSON value model.

## 7. Known Limitations & Technical Debt

- **Hand-built `PreparedView` bypass (carried to C4).** `registerPreparedView`
  accepts any `PreparedView` object; a hand-built view with an all-empty
  provenance would pass correlation vacuously (the empty-provenance refusal
  lives at assembly). Pre-existing exposure, not worsened by C5; the
  registration-validation story belongs to C4/ADR-011.
- **Mutability window until C4.** `PreparedViewRegistry` stores the caller's
  object by reference and `snapshot()` returns prepared views by reference, so
  the correlation is only valid at the acceptance instant until C4 deep-freezes
  published DTOs (see §8).
- `view-slot-registry.ts` is 277/300 and `workspace-core.test.ts` is now 329
  lines (tests are outside the Rule 02 source gate). Further edits to the
  registry should extract validation into its own module.
- No hardware-GPU/Python work was touched; those gates remain as previously
  reported.

## 8. Exact Next Recommended Task

Proceed to **C4 (P4.2.1) — published-DTO immutability + private controlled
shared-state holder** per the already-accepted **ADR-011**. The reviewer’s
most important carry-over: deep-freeze `provenance`/`state`/`links`/`locks` at
assembly/registration time and **atomically**, not lazily at snapshot, and add
a regression test proving that mutating the caller’s object *after*
registration cannot change what was validated or what a read returns. The
holder’s controlled replacement must preserve the identity guarantees the C6
tests now pin (`getPreparedView(view.id) === view`). Do not add linking (C3)
or the fixture-hygiene change (C7) in C4.

---

# Handover Report — Bundle B (C3 + C7): Co-Reference Correlation & Fixture Hygiene

## 1. What Was Implemented

Two ratified corrective slices bundled (both touch the co-reference
contract/fixtures; zero unrelated churn), again by explicit user authorisation
to optimise — not a reorder (C4 remains next).

- **C3 — co-reference contract honesty + correlation.** The pure test oracle
  `isIntraStudyLink` gained intra-evidence self-consistency: all snapshots must
  share one `sourceFingerprint.studyInstanceUID`, and each snapshot’s
  `geometricDigest` must agree with its own defined fingerprint digest. A new
  pure, Node-safe engine helper `packages/view-engine/src/linking/co-reference.ts`
  (`assertCoReferenceEligibility`) adds the registry-aware correlation:
  `verified` → known asset → snapshot/asset `FrameOfReferenceUID` → shared
  study → asset series ↔ snapshot fingerprint series → `structurallyEqual`
  fingerprint → snapshot digest ↔ its own fingerprint digest. **No
  cross-snapshot `geometricDigest` equality is required** (ADR-010 §7.2).
- **C7 — Phase 1 fixture hygiene.** `mockMedicalView` now binds
  `mockCtAsset.id` (`'asset-ct-001'`) instead of the literal `'asset-ct'`, and
  every dependent P3/P4 assertion was retargeted in the same change
  (`CT_VOLUME_IDS`, capture input+assert, single-layer assert,
  render-target plan literal, `prepared-view.test.ts` case 13). The fixture
  seam is now cross-referentially coherent and `mockPreparedView` is valid.

## 2. Files Changed / Created

Created:
- `packages/view-engine/src/linking/errors.ts` (40 lines)
- `packages/view-engine/src/linking/co-reference.ts` (123 lines)
- `packages/view-engine/src/linking/index.ts` (9 lines)
- `tests/view-engine/co-reference.test.ts` (163 lines, 8 tests)

Modified:
- `packages/view-engine/src/index.ts` (exports `./linking/index.js`)
- `tests/contracts/view-validators.ts` (`isIntraStudyLink` self-consistency)
- `tests/contracts/view-contracts.test.ts` (C3 oracle tests)
- `tests/fixtures/view-contracts.fixture.ts` (C7 binding id)
- `tests/view-application/fixtures/view-application-fixtures.ts`,
  `tests/view-application/view-application-single-layer.test.ts`,
  `tests/view-application/view-application-capture.test.ts`,
  `tests/view-application/render-target-dimensions.test.ts` (C7 retargets)
- `tests/view-engine/prepared-view.test.ts` (case 13 → positive coherence)

Unchanged: `packages/shared-types/**`, every other package, `python/**`,
plans/ADRs, `CHANGELOG.md`, the version. `tests/residency/resource-manager.test.ts`
was deliberately left untouched (its `'asset-ct'` literals are synthetic
demand-plan ids, not fixture cross-references).

## 3. Architectural Assumptions Made

- **Enforcement locus clarified.** ADR-010 §7.2 says “the contract validator
  `isIntraStudyLink` must enforce the snapshot ↔ asset ↔ series ↔ fingerprint
  correlation”; a pure predicate cannot reach an asset registry, so the
  registry-aware correlation lives in `assertCoReferenceEligibility` while the
  validator enforces intra-evidence self-consistency. This is the only
  coherent reading and is recorded here so §7.2 is not mistaken for
  unimplemented.
- The helper trusts the `isIntraStudyLink` precondition (non-empty,
  one-to-one snapshots); **P4.4 must wire validator → helper in that order.**
- `CO_REFERENCE_NOT_VERIFIED` is only reachable through a cast because the
  contract types `verified` as literal `true`; the test exercises it with a
  single documented `as unknown as`.
- `structurallyEqual` (C5) is reused for fingerprint equality; no digest
  equality across snapshots anywhere.

## 4. Tests Added & Executed

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npx tsc -p tsconfig.test.json` | exit 0 |
| `npm test` | **329 pass / 0 fail / 67 suites** (0 skipped/todo) = Bundle A baseline 320/66 + 9 tests / +1 suite |
| `npm run build` | clean (exit 0) |
| `node --test tests/view-engine/co-reference.test.ts` | 8/8 |
| `node --test tests/contracts/view-contracts.test.ts` | 11/11 |
| `node --test tests/view-engine/prepared-view.test.ts` | 14/14 |
| `node --test tests/view-application/view-application-single-layer.test.ts` | 8/8 |
| `npm run test:python` | 189 passed (unchanged) |
| `npm run typecheck:python` | 47 files clean (unchanged) |

Coverage: the positive different-digest/same-FoR case (asserts two distinct
digests are accepted), and a negative for every `CoReferenceError` code
including the required same-FoR/different-series case; validator
self-consistency negatives plus the positive corrected-rule case. The sole
removed `it(` in the whole diff is the old `prepared-view.test.ts` case 13,
replaced 1:1 by a positive coherence assertion (the old negative pinned the
defect C7 removes; the refusal remains independently covered by cases 9 and
14). No skipped/todo/vacuous assertions.

Independent verdicts: `nuclear-reviewer` **PASS** (zero blocking; 4
non-blocking) and `nuclear-qa` **PASS** for the executable scope.

## 5. Documentation, Agentlog & ADR Status

- ADR-010 §7.2 wording is now accompanied by the enforcement-locus
  clarification in §3 above; no ADR text change was required (the §7 addendum
  already corrected the digest-equality error).
- This report satisfies the AgentLog Gate for C3 and C7.
- `CHANGELOG.md` untouched; release notes are compiled later via
  `/promote-changelog 4` only on explicit request.

## 6. Project Model Impact

- None. No `.ncp` schema change. The co-reference helper is exported but not
  yet wired into P4.1/P4.2 APIs (P4.4 consumes it).

## 7. Known Limitations & Technical Debt

- **Precondition-trusting helper (carried to C4/P4.4).** `assertCoReferenceEligibility`
  relies on `isIntraStudyLink` for shape and 1:1 snapshots, and an empty
  `snapshots` array would pass vacuously; P4.4 must compose validator →
  helper.
- **Aliased mutability until C4.** `mockIntraStudyLink` snapshots alias asset
  fingerprints by reference, so until C4 deep-freezes published DTOs *and*
  registered evidence atomically, a post-validation mutation could silently
  invalidate the correlation. C4’s freeze discipline should explicitly cover
  `IntraStudyLink.geometryEvidence` snapshots.
- `render-target-dimensions.test.ts` keeps a self-contained `'asset-ct-001'`
  literal rather than importing the fixture id (consistent with that file’s
  style; a future id change would not be caught there).
- `CO_REFERENCE_NOT_VERIFIED` requires a cast to exercise (contract literal
  `true`).

## 8. Exact Next Recommended Task

Proceed to **C4 (P4.2.1) — published-DTO immutability + private controlled
shared-state holder** per ADR-011 (the last remaining corrective before P4.3).
Deep-freeze `provenance`/`state`/`links`/`locks` and co-reference evidence at
assembly/registration time, atomically; add a regression test proving
post-registration mutation of the caller’s object cannot change what was
validated or read; and preserve the identity guarantees pinned by the C6 tests
(`getPreparedView(view.id) === view`). Do not wire P4.4 linking or add P4.3
shared-state mutation in C4.

---

# Handover Report — C4 (P4.2.1): Published-DTO Immutability (ADR-011)

## 1. What Was Implemented

C4 made every value published by a `view-engine` API **deep-frozen**, closing
the runtime-mutability defect found in review (a consumer could mutate the
canonical `view.state.camera.zoom` through a returned reference). This is the
last ratified corrective; the shared-state holder is deferred to P4.3 per
ADR-011 §3 (see §3).

- **`internal/deep-freeze.ts`**: `deepFreeze<T>(value): T` — in-place,
  identity-preserving, idempotent, cycle-safe (`WeakSet`); freezes only plain
  objects/arrays; no Node/DOM/Cornerstone/`Math.`.
- **`assemblePreparedView`** publishes a deep-frozen `PreparedView` (container,
  `state`, `provenance`, `links`, `locks`, `cachedPreviewReference`) **without
  cloning**, after all validation, so refusals never freeze the caller.
- **`PreparedViewRegistry.register`** freezes defensively after the duplicate
  check; `get`/`list`/`snapshot` return the stored frozen object by identity.
- **`ImagingWorkspace`** freezes the stored validation clones (never the
  caller’s object); `getStudy`/`getAsset`/`list*`/`snapshot()` return deep-frozen
  values; `getPreparedView(id) === view` identity holds.
- **`ViewSlotRegistry`** stores/returns deep-frozen groups/slots and freezes
  every transition result.

## 2. Files Changed / Created

Created:
- `packages/view-engine/src/internal/deep-freeze.ts` (60 lines)
- `tests/view-engine/immutability.test.ts` (5 tests)

Modified:
- `packages/view-engine/src/prepared-view/assemble.ts` (138 lines)
- `packages/view-engine/src/prepared-view/registry.ts` (62 lines)
- `packages/view-engine/src/workspace/imaging-workspace.ts` (214 lines)
- `packages/view-engine/src/workspace/view-slot-registry.ts` (285 lines)
- `tests/view-engine/workspace-core.test.ts` (case 5 retargeted to frozen semantics)
- `tests/view-engine/workspace-integrity.test.ts` (case 2 retargeted)
- `docs/plans/PHASE_4_VIEW_ENGINE_PLAN.md` (C4 row aligned: holder §3 → P4.3)

Unchanged: `packages/shared-types/**`, other packages, `python/**`, ADRs,
`CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- **Reads now return the stored frozen value by identity, superseding C1’s
  `structuredClone`-on-read.** This is the intended ADR-011 §1 consequence:
  `Object.freeze` replaces cloning as the immutability guarantee and is what
  makes shared `MedicalViewState` identity observable for P4.3. The C1
  handover’s “reads return `structuredClone` copies” statement is thereby
  superseded by C4.
- **Freezing happens after validation** so a refusal leaves the caller and the
  workspace untouched (C1/C5 discipline preserved).
- **`assemblePreparedView` freezes the caller’s `state`/`provenance` in place**
  (no clone) so identity is preserved; P4.3 must update shared state by atomic
  replacement, never in-place mutation (which now throws).
- **The shared-state holder and atomic replacement (ADR-011 §3) are P4.3
  work**, not C4; the plan’s C4 row was aligned accordingly.

## 4. Tests Added & Executed

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npx tsc -p tsconfig.test.json` | exit 0 |
| `npm test` | **334 pass / 0 fail / 68 suites** (0 skipped/todo) = Bundle B baseline 329/67 + 5 tests / +1 suite |
| `npm run build` | clean (exit 0) |
| `node --test tests/view-engine/immutability.test.ts` | 5/5 |
| `node --test tests/view-engine/prepared-view.test.ts` | 14/14 |
| `node --test tests/view-engine/workspace-core.test.ts` | 11/11 |
| `node --test tests/view-engine/workspace-integrity.test.ts` | 11/11 |
| `node --test tests/view-engine/workspace-provenance-binding.test.ts` | 13/13 |
| `npm run test:python` | 189 passed (unchanged) |
| `npm run typecheck:python` | 47 files clean (unchanged) |

Coverage: frozen-ness at every published level including
`cachedPreviewReference`; mutation-attempt `TypeError` with canonical state
unchanged; the carried-over post-registration mutation regression; identity
preservation; idempotent/cycle-safe freeze and JSON round-trip equality. The
two retargeted existing cases are strictly stronger than the old “mutate a
copy” form (frozen + throws + unchanged). No skipped/todo/vacuous assertions.

Independent verdicts: `nuclear-reviewer` **PASS** (zero blocking; 6
non-blocking) and `nuclear-qa` **PASS** for the executable scope.

## 5. Documentation, Agentlog & ADR Status

- ADR-011 remains **Accepted**; C4 implements §1/§2/§4 and defers §3 to P4.3.
  The plan’s C4 row was corrected to match.
- This report satisfies the AgentLog Gate for C4.
- `CHANGELOG.md` untouched; release notes are compiled later via
  `/promote-changelog 4` only on explicit request.

## 6. Project Model Impact

- None. No `.ncp` schema change; frozen values remain JSON-serializable.

## 7. Known Limitations & Technical Debt

- **No-freeze-on-refusal for a hand-built view is code-verified only** (all C5
  refusal tests assemble first, so the input is already frozen). Low risk; a
  focused test would close it.
- **`workspace-core.test.ts` is 359 lines** (tests are outside the Rule 02
  source gate); split it when the file is next touched.
- `deepFreeze` skips symbol-keyed properties and does not traverse into
  non-plain objects; `assemblePreparedView` does not run the C1
  serializability validation, so a hand-supplied non-plain `state` member
  would be only partially frozen. Keep contract DTOs plain; relevant to P4.5
  lock enforceability.
- `workspace-integrity.test.ts` “caller fixture must stay mutable” message
  asserts value equality rather than `!Object.isFrozen` (wording only).

## 8. Exact Next Recommended Task

Resume **P4.3 — shared-state groups** per ADR-011 §3: implement the private
shared-state holder with **atomic replacement** and define how bound views
observe a replacement (read through the holder’s identity, or have the holder
re-publish new frozen views). Never mutate the frozen values in place (it now
throws), never clone shared state (it would break the identity observability
assembled in C4), and never hand out a new mutable object. All eight ratified
correctives (C1–C8) are now complete, so P4.3 may proceed.

---

# Handover Report — C1b + C4b: Publication-Boundary Hardening

## 1. What Was Implemented

An independent review reopened C1 and C4 with two boundary defects that the
P4.3 shared-state holder would otherwise inherit. Both are closed by this
brief integrative slice.

- **C1b — `undefined` is not JSON-lossless.** `assertSerializableValue` now
  refuses explicit `undefined` at the **root**, on **any object property** and
  in **any array element or hole**, with the new typed code
  `WORKSPACE_UNDEFINED_VALUE`, the exact path, and a remediation stating that
  optional properties must be **absent**. Absent optionals still validate.
- **C4b — published DTOs are truly immutable.** `deepFreeze` is now
  fail-closed: a non-plain object (`Date`/`Map`/class instance) or a
  symbol-keyed property throws `DeepFreezeError`/`DEEP_FREEZE_UNSUPPORTED_VALUE`
  instead of being silently left mutable. `assemblePreparedView` runs
  `assertSerializableValue(view, …)` **then** `deepFreeze(view)` after all
  semantic validation, and `PreparedViewRegistry.register` validates before its
  defensive freeze.

## 2. Files Changed / Created

Modified:
- `packages/view-engine/src/workspace/value-integrity.ts` (154 lines)
- `packages/view-engine/src/workspace/errors.ts` (46 lines, +`WORKSPACE_UNDEFINED_VALUE`)
- `packages/view-engine/src/internal/deep-freeze.ts` (98 lines, fail-closed)
- `packages/view-engine/src/prepared-view/assemble.ts` (143 lines)
- `packages/view-engine/src/prepared-view/registry.ts` (69 lines)
- `tests/view-engine/workspace-integrity.test.ts` (19 tests)
- `tests/view-engine/immutability.test.ts` (11 tests)

Unchanged: `packages/shared-types/**`, other packages, `python/**`, ADRs
(amended separately), `CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- **Publication order is `assertSerializableValue` → `deepFreeze`.** `deepFreeze`
  is fail-closed but **non-transactional** (it freezes per node), so a
  freeze-before-validate path could half-freeze shared state; the pairing is now
  the sanctioned discipline.
- **`DeepFreezeError` is an internal invariant guard**, not part of the public
  error contract: with assert→freeze it is unreachable for validated payloads.
  It is not exported from the package barrels by design (recorded for P4.3).
- **The serializable domain is the publication domain**: explicit `undefined`,
  non-finite numbers, `bigint`/`function`/`symbol`/symbol keys, non-plain
  objects and cycles are refused; `-0` and shared non-cyclic references remain
  accepted.
- No `prepared-view → workspace` cycle was introduced (`value-integrity.ts`
  imports only `./errors.js`).

## 4. Tests Added & Executed

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npx tsc -p tsconfig.test.json` | exit 0 |
| `npm test` | **348 pass / 0 fail / 68 suites** (0 skipped/todo) = C4 baseline 334/68 + 14 tests / +0 suites |
| `npm run build` | clean (exit 0) |
| `node --test tests/view-engine/workspace-integrity.test.ts` | 19/19 |
| `node --test tests/view-engine/immutability.test.ts` | 11/11 |
| `node --test tests/view-engine/prepared-view.test.ts` | 14/14 |
| `node --test tests/view-engine/workspace-provenance-binding.test.ts` | 13/13 |
| `node --test tests/view-engine/co-reference.test.ts` | 8/8 |
| `npm run test:python` | 189 passed (unchanged) |
| `npm run typecheck:python` | 47 files clean (unchanged) |

QA independently reproduced both original defects at the pre-slice baseline
and proved them fixed: `{ optional: undefined }` and `[1, undefined]` now throw
`WORKSPACE_UNDEFINED_VALUE`; `deepFreeze({ when: new Date() })` now throws
`DEEP_FREEZE_UNSUPPORTED_VALUE`; plain values remain accepted. Tests cover the
root/property/nested/array/hole paths, absent-optional acceptance, a hand-built
JavaScript `PreparedView` with a non-plain `state`/`provenance` (refused at the
registry), and assembly with a `Date` in `state` (refused before freeze). No
existing assertion was weakened or deleted.

Independent verdicts: `nuclear-reviewer` **PASS** (zero blocking; 6
non-blocking) and `nuclear-qa` **PASS** for the executable scope.

## 5. Documentation, Agentlog & ADR Status

- **ADR-011 gained an addendum**: the publication boundary is validate→freeze;
  `deepFreeze` is fail-closed and non-transactional; `DeepFreezeError` is an
  internal guard; and the binding **P4.3 contract**
  (`private holder → atomic replacement → new projection → frozen published DTO`,
  with identity/value regeneration specified and tested).
- The P4.3 row of `PHASE_4_VIEW_ENGINE_PLAN.md` was updated to that contract.
- This report satisfies the AgentLog Gate for C1b and C4b.
- `CHANGELOG.md` untouched; release notes are compiled later via
  `/promote-changelog 4` only on explicit request.

## 6. Project Model Impact

- None. No `.ncp` schema change; the domain is stricter but values remain
  JSON-serializable.

## 7. Known Limitations & Technical Debt

- **Residual freeze edges (recorded for P4.3/P4.5).** Non-enumerable
  string-keyed properties and getter accessors bypass the `Object.keys` walk;
  subclassed arrays are treated as arrays; standalone `deepFreeze` skips
  function-valued members; a mid-walk throw is non-transactional. All are
  outside the plain-JSON value-domain contract and unreachable on the
  publication paths (assert→freeze).
- Optional **slot-level** `undefined` inputs (`links`/`locks`/`cachedPreviewReference`,
  `ViewGroup.label`) are normalized to absent rather than refused; published
  values stay JSON-clean (contrast with clinical values inside
  `state`/`provenance`, which are refused).
- `DeepFreezeError` is not exported from the package barrels; decide the policy
  in P4.3 if a consumer must name it.
- `workspace-integrity.test.ts` (392) and `immutability.test.ts` (372) exceed
  300 lines; tests are outside the Rule 02 source gate.
- Two new test-local `as unknown as` widenings (disclosed) build
  deliberately-invalid payloads per test; not fixture escapes.

## 8. Exact Next Recommended Task

Proceed to **P4.3 — shared-state groups** under the ADR-011 addendum contract:
implement the private holder with atomic replacement that regenerates a frozen
DTO projection, specify and test which identity stays stable (holder /
`PreparedViewId` / `ViewSlot`) and which value is regenerated, and route every
replacement payload through `assertSerializableValue` → `deepFreeze`. Never
mutate frozen state in place and never clone shared state.

---

# Phase 4 Closure Record — P4.0, P4.1 and P4.2 Accepted (2026-09-22)

The independent review reopened P4.0/P4.1/P4.2 because their committed
implementations had defects not covered by green tests. The ratified
corrective chain has now closed every defect, and the three slices are
**accepted**.

## Corrective chain and what it closed

| Commit | Slice | Closes |
| --- | --- | --- |
| `8bb0978` | docs | ADR-010 §7 addendum (slot rule; co-reference without digest equality), ADR-011, plan/runbook/agentlog reopen |
| `db4ba42` + `f71d609` | C8 / P4.T | `tests/**` brought into the `tsc` graph (83 → 0 errors); the one runtime exception (volume scalar-data access) made fail-closed and unit-tested |
| `7680acc` | C1 / P4.1.1 | silent JSON normalization removed — non-finite / non-JSON-safe input now refused with typed path errors, no mutation on refusal |
| `0c8921e` | C2+C5+C6 | slot rule 1–4 groups (zero refused); provenance ↔ asset positional correlation; explicit fail-closed slot→`PreparedView` binding |
| `95a04fb` | C3+C7 | co-reference eligibility without digest equality; Phase 1 fixture coherence (`asset-ct` → `asset-ct-001`) |
| `f8a5571` | C4 / P4.2.1 | published DTOs deep-frozen; reads identity-stable; external mutation throws |
| `a46099d` | C1b+C4b | explicit `undefined` refused (`WORKSPACE_UNDEFINED_VALUE`); `deepFreeze` fail-closed; validate→freeze at every publication boundary; ADR-011 addendum and the binding P4.3 contract |

## Accepted slice status

- **P4.0 (baseline, plan, runbook, ADR-010)** — accepted with the co-reference
  contract corrected (ADR-010 §7.2) and the enforcement locus documented.
- **P4.1 (`ImagingWorkspace` core)** — accepted with input integrity (C1+C1b),
  the 1–4-group slot rule (C2), provenance correlation and slot binding
  (C5+C6), and published-DTO immutability (C4+C4b).
- **P4.2 (`PreparedView` assembly + provenance)** — accepted with the
  provenance correlation, immutability and validate→freeze boundary.

## Final verified state (HEAD `a46099d`)

`npm run typecheck` exit 0 · `npx tsc -p tsconfig.test.json` exit 0 ·
`npm test` **348 pass / 0 fail / 68 suites** (0 skipped/todo) ·
`npm run build` clean · `npm run test:python` 189 · `npm run typecheck:python`
47 files. The last slice (C1b+C4b) was verified independently: the reviewing
user reproduced both defects at `f8a5571` and confirmed them fixed, with
typecheck/build/pytest/mypy PASS and 348/348. Earlier slices each have
`nuclear-reviewer`/`nuclear-qa` PASS records above.

## Entry conditions for P4.3 (next task)

P4.3 may start. It must implement the **ADR-011 addendum contract**:

```text
private holder → atomic replacement → new projection → frozen published DTO
```

- Define and **test** which identity stays stable (holder identity,
  `PreparedViewId`, `ViewSlot`) and which published value is regenerated after
  an update.
- Route every replacement payload through
  `assertSerializableValue → deepFreeze`; never mutate frozen state in place
  (it throws), never clone shared state, never hand out a mutable object.
- Keep the package boundary and the ≤300-line source rule; no UI/React/DOM.

`AGENTS.md` intentionally still reads “Phase 3 Complete”: it advances only when
Phase 4 as a whole closes (P4.8). Nothing has been pushed.

---

# Handover Report — P4.3: Shared-State Groups

## 1. What Was Implemented

P4.3 added a private shared-state holder and its atomically-replacing update
API to `@nuclear/view-engine`, implementing ADR-011 §2/§3 and the binding
addendum contract exactly:

```text
private holder → atomic replacement → new projection → frozen published DTO
```

- **`SharedStateGroup` (holder)**: owns one `SpatialState`/`CameraState` pair
  (architecture §16) in a module-private `WeakMap`; exposes only `id`,
  `spatial`, `camera` read getters, and is `Object.freeze`d in its constructor.
  No public mutator, no notify chain.
- **`SharedStateGroupRegistry`**: creates/reads groups, tracks membership (one
  group per view) and exposes the controlled APIs `attach`, `detach`, `replace`;
  `snapshot()`/`listMembers()` are deep-frozen plain data.
- **`projectPreparedView`**: regenerates a frozen `PreparedView` from the view’s
  own metadata plus the holder’s pair; only `spatial`/`camera` are overridden,
  referenced by identity (never cloned).
- **`replace` is atomic**: it validates + freezes the replacement wrapper,
  stages every member’s projection, then commits the holder pair and swaps each
  registered entry. A refusal leaves the holder and every bound view
  object-identical.
- **The projection swap is internal-only (F1 fix)**: `#replaceProjection` + a
  module-private `WeakMap` friend closure + `@internal
  replaceRegisteredPreparedView`; `prepared-view/index.ts` uses a named
  `PreparedViewRegistry` re-export so the friend cannot leak, and the public
  `replace` is gone.
- **`ImagingWorkspace`** gains `sharedStateGroups` and a `sharedStateGroups`
  snapshot field.

Ratified identity contract (the slice’s core definition):

- **Stable** across a replacement: the `SharedStateGroup` holder object (and
  its id), every `PreparedViewId` (and its list position), and every `ViewSlot`
  (its binding is untouched).
- **Regenerated**: the published `PreparedView` object and its `state`
  container; `state.spatial`/`state.camera` reference the holder’s new frozen
  pair. A consumer re-reads by the stable `PreparedViewId`; there is no
  push/notify.

## 2. Files Changed / Created

Created:
- `packages/view-engine/src/shared-state/types.ts` (34 lines)
- `packages/view-engine/src/shared-state/errors.ts` (40 lines)
- `packages/view-engine/src/shared-state/group.ts` (75 lines)
- `packages/view-engine/src/shared-state/project.ts` (37 lines)
- `packages/view-engine/src/shared-state/registry.ts` (176 lines)
- `packages/view-engine/src/shared-state/index.ts` (14 lines)
- `tests/view-engine/shared-state.test.ts` (672 lines; tests a–m)

Modified:
- `packages/view-engine/src/index.ts` (+ shared-state barrel)
- `packages/view-engine/src/prepared-view/index.ts` (`export *` → named
  `PreparedViewRegistry` re-export)
- `packages/view-engine/src/prepared-view/registry.ts` (public `replace`
  removed; internal friend swap; 139 lines)
- `packages/view-engine/src/workspace/imaging-workspace.ts`
  (`sharedStateGroups` field + snapshot; 220 lines)

Unchanged: `packages/shared-types/**`, every other package, root/package
config, plans/ADRs, `CHANGELOG.md`, the version. No new cross-package contract
was needed (consistent with the P4.3 owner-scoping: view-engine only).

## 3. Architectural Assumptions Made

- A shared-state group shares the **pair** spatial+camera, matching
  architecture §16; per-view presentation/composition/binding stay local.
  Partial (spatial-only) sharing is deliberately out of scope for P4.3.
- Identity observability is group↔views: the holder’s current
  `spatial`/`camera` are the exact objects placed in every attached view’s
  projection; cloning is forbidden because it would break observability
  (ADR-011 addendum).
- Freezing is in-place at ingestion (`assertSerializableValue` → `deepFreeze`),
  so the group shares the caller’s frozen objects; a refused payload is never
  frozen and never enters the holder. The holder is `Object.freeze`d and the
  `WeakMap` accepts the frozen key.
- `SharedStateGroup` holders are opaque identity tokens intentionally **not**
  deep-frozen (`deepFreeze` fail-closes on class instances); the ADR-011 §1
  exemption applies because the holder exposes no mutable state. `listGroups`
  returns a shallow-frozen array; only plain-data outputs are deep-frozen.
- The projection swap must not be a public capability: a public
  `PreparedViewRegistry.replace` would let a hand-built view bypass the C5 /
  ADR-010 §7.3 provenance correlation on an already-registered id. Hence the
  internal friend pattern. (`register` remains a low-level structural
  primitive; workspace-level correlation is enforced by
  `ImagingWorkspace.registerPreparedView`.)

## 4. Tests Added & Executed

Added `tests/view-engine/shared-state.test.ts` (13 tests, 1 suite, a–m).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `node --test tests/view-engine/shared-state.test.ts` | **13 pass / 0 fail** (1 suite, 0 skipped/todo) |
| `node --test tests/view-engine/prepared-view.test.ts` | 14 pass / 0 fail |
| focused (shared-state + prepared-view + immutability) | 38 pass / 0 fail |
| `npm test` | **361 pass / 0 fail / 69 suites** (0 skipped/todo) = P4.2 baseline 348/68 + 13 tests / +1 suite |
| `npm run build` | clean (exit 0, `tsc -b`) |

Coverage: frozen pair at creation; exact identity shared across two attached
views; holder/id/slot stability vs regenerated projections; old projections
remain frozen; per-view metadata preserved by identity; refusal classes
(`NaN`, explicit `undefined`, `Date`/`Map`, `bigint`/`symbol`/`function`)
leaving holder and views object-identical; duplicate/unknown group; unknown
view; double-attach and cross-group attach; detach/not-attached/re-attach;
zero-member replace; frozen snapshot; `listGroups` frozen + holder-id
corruption refused; internal surfaces absent from all barrels and the public
`replace` gone. No `skip`/`todo`/`|| true`; no vacuous assertions.

Independent verdicts: `nuclear-reviewer` **PASS** (one BLOCKING finding F1
raised, accepted and closed; 3 non-blocking residuals recorded) and
`nuclear-qa` **PASS** for all executable gates (13/13 · 361/361 · typecheck and
build clean), with the P4.3 numeric/visual tolerance declared **NOT YET
APPLICABLE** (the slice compares no geometry).

## 5. Documentation, Agentlog & ADR Status

- ADR-011 remains **Accepted**; P4.3 implements §2/§3 and its P4.3 binding
  addendum. ADR-010 §1/§6 are unaffected. No ADR change was required.
- This report satisfies the AgentLog Gate for P4.3.
- `CHANGELOG.md` untouched; release notes are compiled via
  `/promote-changelog 4` only on explicit request.

## 6. Project Model Impact

- None. No `.ncp` schema change. `SharedStateGroupId` is a view-engine-local
  branded id (derived from `Brand`), not a `shared-types` contract, because no
  cross-package consumer exists yet; promoting it remains a future,
  explicitly-scoped decision.

## 7. Known Limitations & Technical Debt

- `tests/view-engine/shared-state.test.ts` is 672 lines (tests are outside the
  Rule 02 source-length gate; carried test-file debt).
- Residual (accepted, non-blocking): `replaceRegisteredPreparedView` remains
  reachable by deep-importing the internal module, the same trust tier as
  `commitSharedStatePair`/`pairByGroup`; nothing in the toolchain forbids deep
  imports (a package `exports` map or lint rule would be needed).
- The forged-registry guard reuses `PREPARED_VIEW_UNKNOWN_ID` for the
  “no replacer” condition (minor diagnostic nit).
- Partial (spatial-only) sharing is not modelled; a group shares the pair.
- Carried Phase 3 debt unchanged (renderer size headroom; hardware-GPU and a
  true production bundle remain `NOT YET APPLICABLE`).

## 8. Exact Next Recommended Task

Proceed to **P4.4 — link semantics**: compose `isIntraStudyLink` with the
existing `assertCoReferenceEligibility` (same worker-verified
`FrameOfReferenceUID` + one-to-one snapshot ↔ asset ↔ series ↔ fingerprint
correlation; **never** require an equal `geometricDigest`), and enforce
inter-study relative (`navigationDifferentialMm`) and transformed
(`SpatialTransform`, matching source/target FoRs and `outOfDomainBehavior`)
links with an explicit `toleranceMm`; mismatches fail closed. Use only the
curated `ct-axial` / `pt-axial-coreg` (same FoR `…5001.4`) and `pt-axial`
(frame `…5002.4`) fixtures. Do not add P4.5–P4.7.

---

# Handover Report — P4.4: Link Semantics

## 1. What Was Implemented

P4.4 added `ViewLink` validation and co-referenced link application to
`@nuclear/view-engine`. It composes the reused C3 co-reference gate and routes
application through the P4.3 atomic shared-state projection path; it never
mutates published/frozen state.

- **Product `ViewLink` guards** (`linking/guards.ts`):
  `isIntraStudyLink` / `isInterStudyLink` / `isViewLink` (and
  `isSpatialTransformShape`) are deliberately **shape-level** so the semantic
  rules stay reportable as specific codes instead of collapsing into
  `LINK_MALFORMED`. JSDoc notes they mirror the runtime-relevant structure of
  `tests/contracts/view-validators.ts` (still the test-side authority).
- **Eligibility** (`linking/eligibility.ts`): `assertViewLinkEligible` fails
  closed. Co-referenced links compose `assertCoReferenceEligibility` after the
  structural correlation check: same worker-verified `FrameOfReferenceUID`,
  one-to-one snapshot ↔ asset ↔ series ↔ fingerprint; **an equal
  `geometricDigest` across snapshots is never required** (native CT/PET in one
  FoR legitimately differ). `CoReferenceError` codes propagate unchanged.
  Inter-study links require distinct frames, a finite non-negative
  `toleranceMm`, and mode-exclusive `navigationDifferentialMm` (relative) or a
  valid `SpatialTransform` with matching source/target FoRs and matching
  `outOfDomainBehavior` (transformed); an invalid transform is never treated as
  co-referenced.
- **Application** (`linking/apply.ts`): `applyCoReferencedLink` validates
  (including co-reference) **before any registry access**, resolves/reuses/
  creates a `SharedStateGroup`, attaches both views through the P4.3 atomic
  path, and records the link on each view by regenerating a frozen projection
  via the internal `replaceRegisteredPreparedView` (documented as intra-package
  composition, not a validation bypass). It accepts **only** the exact
  synchronized set `{spatial, camera}` (any order, no duplicates) — the
  indivisible pair the P4.3 `SharedStateGroup` models — and every other
  `synchronizedState` (`[]`, partial, `presentation`-only, duplicates) fails
  closed with `LINK_APPLICATION_UNSUPPORTED_SYNCHRONIZED_STATE` **before any
  registry access**, so it never applies an undeclared mutation. It is
  idempotent and returns a deep-frozen `AppliedCoReferencedLink` whose `link`
  is the canonical stored instance.
- **Workspace delegate**: `ImagingWorkspace.applyCoReferencedLink` wires the
  workspace's prepared-view/shared-state registries and asset lookup.
- **Registry read**: `SharedStateGroupRegistry.groupOf` exposes the attached
  group (or `undefined`) without mutating membership.

## 2. Files Changed / Created

Created:
- `packages/view-engine/src/linking/guards.ts` (177 lines)
- `packages/view-engine/src/linking/eligibility.ts` (214 lines)
- `packages/view-engine/src/linking/apply.ts` (223 lines)
- `tests/view-engine/link-eligibility.test.ts` (263 lines; 13 tests)
- `tests/view-engine/link-application.test.ts` (316 lines; 10 tests)

Modified:
- `packages/view-engine/src/linking/errors.ts` (87 lines; +`LinkError` /
  `LinkErrorCode`, incl. `LINK_APPLICATION_UNSUPPORTED_SYNCHRONIZED_STATE`;
  `CoReferenceError` unchanged)
- `packages/view-engine/src/linking/index.ts` (14 lines; barrel)
- `packages/view-engine/src/shared-state/registry.ts` (188 lines; +`groupOf`)
- `packages/view-engine/src/workspace/imaging-workspace.ts` (241 lines;
  +`applyCoReferencedLink`)

Unchanged: `packages/shared-types/**`, every other package, plans/ADRs,
`CHANGELOG.md`, the version. No new cross-package contract was required.

Preparatory commit (same phase): `8ab08f5` split the 672-line P4.3 test file
into `shared-state-fixtures.ts` + `shared-state-identity.test.ts` /
`shared-state-invariants.test.ts` with zero behaviour change (same 13 tests,
suites 69→70), as the phase owner requested before P4.4–P4.5 add cases.

## 3. Architectural Assumptions Made

- Co-reference compatibility is the worker's verified assertion, never an
  invented numeric tolerance; `toleranceMm` is a caller-declared inter-study
  field validated only as finite ≥ 0.
- A co-referenced link is applied by making the two views share one frozen
  `spatial`/`camera` pair; the group is seeded from the **source view's current
  frozen pair** (existing data, not new geometry). Existing groups win over the
  caller's proposed id; a view already in a different group is a conflict, not
  a silent move.
- `SharedStateGroup` models the indivisible `{spatial, camera}` pair, so
  co-referenced application accepts exactly that `synchronizedState` set (any
  order, no duplicates). Eligibility may validate every `LinkableState`, but
  application must never pretend to apply states the group does not model:
  `[]`, partial, `presentation`-only and duplicate sets fail closed.
- Link recording reuses `assemblePreparedView` (re-validate + freeze) and the
  internal P4.3 projection swap. The guards are shape-only by design so every
  semantic refusal keeps its own typed code.
- Inter-study application is intentionally **not** implemented: an inter-study
  relative/transformed link is validated but never shares absolute state;
  `applyCoReferencedLink` refuses any non-co-referenced kind.

## 4. Tests Added & Executed

Added `tests/view-engine/link-eligibility.test.ts` (13 tests) and
`tests/view-engine/link-application.test.ts` (10 tests).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `node --test tests/view-engine/link-eligibility.test.ts` | **13 pass / 0 fail** |
| `node --test tests/view-engine/link-application.test.ts` | **10 pass / 0 fail** |
| `npm test` | **384 pass / 0 fail / 72 suites** (0 skipped/todo) = P4.3 361/70 + 23 tests / +2 suites |
| `npm run build` | clean (exit 0, `tsc -b`) |

Coverage: two distinct digests in one verified FoR accepted; transformed and
relative inter-study accepted; malformed values → `LINK_MALFORMED`; intra
evidence frame / one-to-one / single-study refusals; composition proof that an
unverified link surfaces `CoReferenceError CO_REFERENCE_NOT_VERIFIED`; every
`LINK_INTER_STUDY_*` code (same frame, tolerance, differential, transform
shape/validity/frames/out-of-domain, mode inconsistency); **fail-closed
robustness** that malformed runtime payloads (non-record transform, missing
`validity`, non-array/wrong-length differential, null/primitive link) raise
typed `LinkError`, never `TypeError`, **and** that a co-referenced application
accepts only the exact `{spatial, camera}` set (order-agnostic) while `[]`,
partial, `presentation`-only and duplicate sets are refused with
`LINK_APPLICATION_UNSUPPORTED_SYNCHRONIZED_STATE`, leaving no group or view
mutation. Application: shared frozen pair identity,
link recorded once, wrapper frozen, registry matches returned views,
pre-application frozen views unchanged, idempotency incl. a structurally equal
clone, and negatives (`LINK_APPLICATION_REQUIRES_CO_REFERENCE`,
`LINK_VIEW_MISMATCH`, `LINK_SELF_REFERENCE`, `LINK_SHARED_STATE_CONFLICT`,
`CoReferenceError`) all asserting no group/view mutation. No `skip`/`todo`/
`|| true`; no vacuous assertions.

Independent verdicts: `nuclear-reviewer` **PASS** (two `TypeError`-leak defects
found pre-review and fixed; N1–N3 closed; one cosmetic ordering nit fixed;
the phase owner's blocking `synchronizedState` finding closed by the exact-set
guard) and `nuclear-qa` **PASS** for all executable gates (13/13 · 10/10 ·
384/384 · typecheck/build clean), with image tolerance declared **NOT YET
APPLICABLE**
(no image comparison). One full `npm test` run hit the known renderer-harness
flake (`adapter-teardown.test.ts` timeout); the file passed 3/3 alone and the
re-run was green — reported truthfully, not as a P4.4 failure.

## 5. Documentation, Agentlog & ADR Status

- ADR-010 remains **Accepted**; P4.4 implements §3 and §7.2. ADR-011 §3 governs
  the atomic path. No ADR change was required.
- This report satisfies the AgentLog Gate for P4.4.
- `CHANGELOG.md` untouched; release notes are compiled via
  `/promote-changelog 4` only on explicit request.

## 6. Project Model Impact

- None. No `.ncp` schema change. Links are validated and applied in memory;
  persisting a link collection/workspace snapshot remains a future,
  explicitly-scoped decision.

## 7. Known Limitations & Technical Debt

- The three new source files are 177/214/223 lines; the test files 263/316
  (tests are outside the Rule 02 source-length gate; `link-application` is the
  largest P4.4 test file and a candidate for a future split).
- `replaceRegisteredPreparedView` remains reachable by deep-importing the
  internal module (same accepted trust tier as P4.3); a package `exports` map or
  lint rule would make the boundary runtime-verifiable.
- Application atomicity is reasoned-infallibility after validation, not a
  transaction: group resolution/attach/record are individually atomic and every
  post-validation failure mode is pre-excluded.
- Inter-study application (navigation/transform consumption) is not implemented;
  only validation is. `SharedStateGroup` still models only the spatial+camera
  pair.
- Carried Phase 3 debt unchanged (renderer size headroom; hardware-GPU and a
  true production bundle remain `NOT YET APPLICABLE`).

## 8. Exact Next Recommended Task

Proceed to **P4.5 — Lock and Override**: a `StateLock` protects a named state
(`spatial`, `camera`, `presentation`, `projection`, `composition`, `binding`)
and a mutation attempt on locked state is refused with a typed error naming the
state; a `LocalViewOverride` is local to a `ComposerViewInstanceId`, serializable,
and applying it must not mutate the source `PreparedView` (assert deep equality
before and after). It may rely on the P4.4 finding that state changes only via
engine APIs (ADR-011 §4). Do not add P4.6 surfaces or P4.7 demand.







