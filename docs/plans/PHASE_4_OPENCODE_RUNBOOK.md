# Phase 4 — OpenCode Orchestration Runbook

## Start Command

Run one bounded slice at a time:

```text
/phase 4 P4.1: implement the ImagingWorkspace core (studies/assets, ViewGroup and ViewSlot allocation, bind/unbind/status) as pure Node-safe state in @nuclear/view-engine.
```

Before delegation, the orchestrator must read:

- `docs/plans/PHASE_4_VIEW_ENGINE_PLAN.md`;
- `docs/NUCLEAR_ARCHITECTURE_V3.md` §5–§20 and §29.1–§29.3 (workspace,
  slots, surfaces, shared state, link/lock/override, prepared views,
  residency demand);
- `docs/PROJECT_VADEMECUM.md` §4.1 (view-engine ownership, acyclic graph);
- `docs/decisions/ADR-010-view-engine-workspace-and-surface-ownership.md`;
- the accepted Phase 1 contracts in `packages/shared-types/src/` and their
  validators in `tests/contracts/view-validators.ts`;
- the accepted Phase 3 `ResourceManager` contracts
  (`packages/medical-engine/src/residency/`).

## Delegation Sequence

1. The orchestrator validates the exact P4.x slice and its entry conditions.
   It must not delegate all of Phase 4 in one request.
2. `nuclear-engine-engineer` implements exactly the bounded workspace,
   linking, lock/override, surface or demand work of that slice. It must
   not stage, commit or push.
3. `nuclear-reviewer` performs a read-only review against the Phase 4 plan,
   the architecture sections above, the package graph and Rule 02 limits.
   It reports PASS, CONCERNS or REJECT with concrete evidence.
4. `nuclear-qa` runs the configured gates and the slice acceptance cases. It
   reports PASS, FAIL, BLOCKED or NOT YET APPLICABLE, never a fabricated
   pass and never a vacuous zero-test run.
5. The orchestrator resolves every REJECT/FAIL, examines the final diff and
   records the eight-point handover in `docs/agentlog/phase-4.md`.
6. Only after every applicable gate is green may the orchestrator make a
   selective atomic local commit. Push remains user-authorized only.

Use `nuclear-scientific-engineer` only if a P4 slice is genuinely blocked on
a new Python worker operation. It must not be used to duplicate geometry,
registration or SUVbw science in view-engine.

## Required Brief Fields

Every delegation brief must include:

1. exact P4.x objective, explicit exclusions and stop condition;
2. owner package and an allowlist of editable paths;
3. authoritative contracts, architecture sections and ADR-010 clauses;
4. whether the slice is pure Node (always for Phase 4) and the exact test
   command;
5. fixture/evidence provenance and the exact expected result, or an
   explicit `NOT YET APPLICABLE` statement;
6. positive and fail-closed negative cases;
7. all commands to execute;
8. no staging, commit, push, UI, React, DOM, Cornerstone, figure-engine or
   project-model expansion.

## Slice-specific Constraints

### P4.0 — Baseline and Contracts Audit

- Record the current gate state (typecheck, `npm test`, build, Python gates)
  without modifying `packages/`.
- Audit Phase 1 view contracts for gaps; any new cross-package contract
  requires validation, a fixture and an ADR when it changes a boundary.
- Deliver plan + runbook + ADR-010 only. Do not implement workspace code.

### P4.1 — Workspace Core

- Keep the model serializable and pure. No `import` of React, DOM or
  `@cornerstonejs/*`.
- Enforce exactly four groups of four roles; refuse a 17th slot, a duplicate
  id, a foreign role or a group id mismatch.
- `ViewSlot.status` transitions (`empty` → `bound` → `prepared`, and
  `unavailable`) must be explicit; an illegal transition fails closed.

### P4.2–P4.3 — PreparedView and Shared State

- `PreparedView` carries `MedicalViewState`, links, locks, provenance and an
  optional cached-preview reference; it is not a raster.
- Assembly alone must not call `ResourceManager.retain`. Only P4.7 declares
  demand.
- Shared state is object identity shared across views, never an event chain
  that prevents recursion.

### P4.4 — Link Semantics

- Intra-study co-reference requires an accepted geometry-evidence snapshot
  set: matching `FrameOfReferenceUID`, matching `geometricDigest` and a
  verified flag. Different FoRs without a valid transform must be refused.
- Inter-study relative links carry a `navigationDifferentialMm`; transformed
  links carry a valid `SpatialTransform` whose source/target FoRs match the
  link and whose `outOfDomainBehavior` matches. An invalid transform is
  refused, never silently treated as co-referenced.
- Use only the curated fixtures for positive/negative geometry evidence.

### P4.5 — Lock and Override

- A `StateLock` protects a named state; mutation attempts on locked state
  must be refused with a typed error naming the state.
- A `LocalViewOverride` is local to a `ComposerViewInstanceId`; applying it
  must not mutate the source `PreparedView` (assert deep equality before and
  after).

### P4.6 — Surfaces and Layout

- `ViewportSurfaceRegistry` owns stable `surfaceId`/`viewportId`; rebinding
  a surface to a different slot or view must not change its identity.
- The registry is pure and WebGL-agnostic; the 16-surface cap is logical and
  must never be reported as a WebGL-context count.
- `SurfaceLayoutManager` computes viewer slot and composer panel rectangles
  as pure geometry and preserves identity across re-layout.

### P4.7 — Demand and Residency

- Project slot/view visibility into `ResourceDemand[]` and reconcile it
  against the real `ResourceManager` with a deterministic backend in tests.
- Shared assets must be retained once per lease and released exactly once;
  eviction must preserve semantic view identity and reload must restore
  residency.
- Do not reimplement ResourceManager policy; declare demand and consume
  settlements/snapshots.

## Required Gate Commands

At minimum, each applicable slice runs:

```text
npm run typecheck
npm test
npm run build
npm run test:python
npm run typecheck:python
```

Phase 4 adds no renderer requirement, but `npm test` must still include the
accepted renderer suite. Run `npm run docs` at P4.8. A missing runner or
fixture is reported `BLOCKED`/`NOT YET APPLICABLE`, never PASS.

## Final Phase Handover

P4.8 appends the final eight-point report to `docs/agentlog/phase-4.md` and
records: runtime/package facts, workspace/link/lock/override/surface/demand
evidence, remaining risks, reviewer/QA verdicts and the Phase 5 entry
conditions. Do not promote the changelog or create a tag unless the user
explicitly requests a release.
