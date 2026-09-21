# Phase 4 — View Engine: Workspace, Link/Lock/Override & Persistent Surfaces

Status: **IN PROGRESS** — P4.0 accepted (baseline, contract audit, plan,
runbook and ADR-010); P4.1 accepted (workspace core, review **PASS**, QA
**PASS**). P4.2–P4.8 pending in declared dependency order.
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
