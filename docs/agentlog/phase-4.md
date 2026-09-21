# Phase 4 — View Engine: Workspace, Link/Lock/Override & Persistent Surfaces

Status: **IN PROGRESS** — P4.0 accepted (baseline, contract audit, plan,
runbook and ADR-010). P4.1–P4.8 pending in declared dependency order.
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
