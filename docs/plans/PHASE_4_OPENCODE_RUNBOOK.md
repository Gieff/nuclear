# Phase 4 — OpenCode Orchestration Runbook

> **Phase 4 correctives are COMPLETE (2026-09-22).** The independent review
> reopened P4.0–P4.2; the ratified corrective chain (`C8 → C1 → C2/C5/C6 →
> C3/C7 → C4 → C1b/C4b`) is done and **P4.0–P4.2 are closed** (see the AgentLog
> closure record). **The next slice is P4.3 (shared-state groups)**, which must
> follow the binding ADR-011 addendum contract
> (`private holder → atomic replacement → new projection → frozen published DTO`).

## Start Command

Run one bounded slice at a time:

```text
/phase 4 P4.3: implement shared-state groups via a private holder with atomic replacement that regenerates a frozen published DTO, keeping holder / PreparedViewId / ViewSlot identity stable (ADR-011 §3 + addendum).
```

Before delegation, the orchestrator must read:

- `docs/plans/PHASE_4_VIEW_ENGINE_PLAN.md`;
- `docs/NUCLEAR_ARCHITECTURE_V3.md` §5–§20 and §29.1–§29.3 (workspace,
  slots, surfaces, shared state, link/lock/override, prepared views,
  residency demand);
- `docs/PROJECT_VADEMECUM.md` §4.1 (view-engine ownership, acyclic graph);
- `docs/decisions/ADR-010-view-engine-workspace-and-surface-ownership.md`
  (including its §7 reopened-corrections addendum);
- `docs/decisions/ADR-011-prepared-view-immutability-and-shared-state-mutation.md`;
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

### P4.0 — Baseline and Contracts Audit — CLOSED

- Delivered plan/runbook/ADR-010; co-reference contract corrected by ADR-010 §7.

### P4.1 — Workspace Core — CLOSED

- Keep the model serializable and pure. No `import` of React, DOM or
  `@cornerstonejs/*`.
- **Slot rule (ADR-010 §7.1): 1–4 groups of exactly four slots (max 16); zero
  groups refused**; refuse a 17th slot, a duplicate id, a foreign role or a
  group-membership mismatch.
- `ViewSlot.status` transitions (`empty` → `bound` → `prepared`, and
  `unavailable`) must be explicit; an illegal transition fails closed.

### P4.2 — PreparedView and Provenance — CLOSED

- `PreparedView` carries `MedicalViewState`, links, locks, provenance and an
  optional cached-preview reference; it is not a raster.
- Assembly never calls `ResourceManager.retain`. Only P4.7 declares demand.
- **Published DTOs are immutable (ADR-011 §1/§4).** `PreparedView`, provenance,
  links, locks and cached-preview references are validated against the
  serializable domain and deep-frozen at publication; external mutation throws.
- **Provenance is validated, positionally one-to-one (ADR-010 §7.3).**
- **A prepared view may exist without a slot (ADR-010 §7).** Slot→prepared-view
  binding is a separate explicit, fail-closed operation.

### P4.3 — Shared-State Groups (NEXT)

Bind contract (ADR-011 §3 + addendum) — do not reinterpret:

```text
private holder → atomic replacement → new projection → frozen published DTO
```

- **Objective.** Several views reference one shared `SpatialState`/
  `CameraState` (architecture §2.5, §16) with **object identity observable** and
  no imperative notify chain.
- **Identity vs regeneration.** P4.3 must **define and test** which identity
  stays stable (holder identity, `PreparedViewId`, `ViewSlot`) and which
  published value is **regenerated** after an update.
- **Replacement discipline.** Every replacement payload passes
  `assertSerializableValue` → `deepFreeze`; never mutate frozen state in place
  (it throws), never clone shared state (it would break identity
  observability), never hand out a mutable object. A spread/merge of prior
  state can introduce `{ field: undefined }` and will be refused.
- **Fail-closed negatives.** A non-plain/`undefined`/non-finite replacement
  value is refused with a typed error and leaves the holder and all bound views
  unchanged; an update that cannot be published atomically is refused.
- **Owner/scoping.** `@nuclear/view-engine` only; pure Node tests; ≤300-line
  source files. Do not add P4.4 linking, P4.5 locks/overrides, P4.6 surfaces or
  P4.7 demand in P4.3.
- Suggested paths: `packages/view-engine/src/shared-state/*` and
  `tests/view-engine/shared-state.test.ts`.

### P4.4 — Link Semantics

- Intra-study co-reference requires the same worker-verified
  `FrameOfReferenceUID` plus one-to-one snapshot ↔ asset ↔ series ↔ fingerprint
  correlation (use the existing `assertCoReferenceEligibility` **after**
  `isIntraStudyLink`). **Never require an equal `geometricDigest`** — native
  CT/PET in one FoR legitimately differ. Different FoRs without a valid
  transform must be refused.
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
