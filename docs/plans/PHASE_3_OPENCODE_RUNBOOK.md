# Phase 3 — OpenCode Orchestration Runbook

## Start Command

Run one bounded slice at a time:

```text
/phase 3 P3.0: establish the real Cornerstone/WebGL harness, dependency decision and pixel-bearing fixture policy required by the Phase 3 medical-engine plan.
```

Before delegation, the orchestrator must read:

- `docs/plans/PHASE_3_MEDICAL_ENGINE_PLAN.md`;
- `docs/plans/PHASE_3_MEDCANVAS_RECOVERY_ADDENDUM.md`; for P3.3–P3.5,
  evaluate only the addendum section scoped to the active slice and record
  the translation from recovered behaviour to NuClear contract/test;
- `docs/NUCLEAR_ARCHITECTURE_V3.md` and `docs/PROJECT_VADEMECUM.md` sections
  on `medical-engine`, residency and temporary RenderTargets;
- `.agents/skills/nuclear-rendering/SKILL.md` and
  `.agents/skills/nuclear-testing/SKILL.md`;
- ADR-002 and the completed Phase 2 AgentLog.

## Delegation Sequence

1. The orchestrator validates the exact P3.x slice and its entry conditions.
   It must not delegate all of Phase 3 in one request. For P3.3–P3.5 it must
   explicitly state whether the MedCanvas recovery addendum contributes a
   behaviour, a test invariant, or no applicable guidance; a source reference
   alone is not an implementation instruction.
2. `nuclear-engine-engineer` implements exactly the bounded adapter,
   residency or target work specified by that slice. It must not stage,
   commit or push.
3. `nuclear-reviewer` performs a read-only review against the Phase 3 plan,
   the rendering skill, package graph and Phase 2 boundary. It reports PASS,
   CONCERNS or REJECT with concrete evidence.
4. `nuclear-qa` runs configured gates and the required controlled-renderer
   evidence. It reports PASS, FAIL, BLOCKED or NOT YET APPLICABLE, never a
   fabricated GPU PASS.
5. The orchestrator resolves every REJECT/FAIL, examines the final diff and
   records the eight-point handover in `docs/agentlog/phase-3.md`.
6. Only after every applicable gate is green may the orchestrator make a
   selective atomic local commit. Push remains user-authorized only.

Use `nuclear-scientific-engineer` only if P3 is genuinely blocked on a new
Python worker operation. It must not be used to duplicate the renderer or
recalculate geometry/SUVbw in response to a TypeScript rendering defect.

## Required Brief Fields

Every delegation brief must include:

1. exact P3.x objective, explicit exclusions and stop condition;
2. owner package and an allowlist of editable paths;
3. authoritative contracts, Cornerstone version decision and applicable
   rendering-skill clauses;
4. whether the slice needs a controlled WebGL harness and how that harness is
   invoked without a product UI;
5. fixture provenance, expected output and named tolerance, or an explicit
   statement that an evidence item is not yet applicable;
6. positive and fail-closed negative cases;
7. all commands to execute, including renderer integration evidence;
8. no staging, commit, push, UI, view-engine or figure-engine expansion.

## Slice-specific Constraints

### P3.0 — Renderer Feasibility

- Record actual package versions and host/runtime requirements. Do not claim
  browser, Electron or GPU compatibility based only on installation success.
- Use a tiny real Cornerstone initialization/teardown probe. If a DOM/WebGL
  harness is absent, make that the blocker; do not substitute a mocked canvas.
- Decide how fixtures are made pixel-bearing and reproducible before volume
  loading begins. Existing Phase 2 metadata fixtures are not implicitly pixel
  evidence.
- Any durable decision about runtime-host ownership or a public renderer port
  needs an ADR before P3.1 depends on it.

### P3.1–P3.2 — Adapter and Volume Loading

- Keep DOM/WebGL host objects behind injected adapter boundaries. Public
  `medical-engine` state must remain serializable and UI-agnostic.
- Require explicit source and accepted Phase 2 evidence. Never rescan a
  folder, guess a series or reinterpret DICOM geometry in TypeScript.
- Treat `missing`, `mismatch` and `offline-cached` as no-live-render states.

### P3.3 — Residency

- Accept `ResourceDemand`; do not import `view-engine` or decide workspace
  priority.
- Prove shared-resource reference handling, deterministic eviction choice and
  reload. Semantic identities and provenance survive physical eviction.
- Keep measurement honest: report unknown VRAM quantities as unknown rather
  than estimated clinical-looking values.

### P3.4–P3.5 — Rendering and Temporary Target

- Apply `MedicalViewState` through the Cornerstone adapter. Do not recreate
  slice, camera, fusion or PET scaling math in a wrapper.
- Use declared presets conforming strictly to [PET_CT_FUSION_RADIOMETRY_SPEC.md](PET_CT_FUSION_RADIOMETRY_SPEC.md). CT Soft Tissue (W400/L40), PET fusion opacity curve ($\alpha = (s/100)^{0.42}$), and transfer modes (`"highlighted"`, `"alpha"`) defined in the specification are approved; unapproved presets or unratified display defaults are prohibited.
- Compute target pixels from physical millimetres and DPI. The temporary
  target must preserve the live target's state and dimensions and be disposed
  after extraction.
- P3 returns a medical raster only. TIFF/PNG flattening and PDF vectors are
  Phase 5 work.

## Required Gate Commands

At minimum, each applicable slice runs:

```text
npm run typecheck
npm test
npm run build
npm run test:python
npm run typecheck:python
```

Add the renderer-harness command as soon as P3.0 creates it; it must become a
configured, non-optional gate for P3.1 onward. Run `npm run docs` at P3.6.
If hardware or sandbox policy blocks the harness, report the exact command,
environment fact and `BLOCKED`/`NOT YET APPLICABLE` state instead of passing a
mock-only test.

## Final Phase Handover

P3.6 appends the final eight-point report to `docs/agentlog/phase-3.md` and
records: runtime/hardware facts, package versions, fixture provenance,
renderer and residency evidence, RenderTarget evidence, remaining platform
risks, reviewer/QA verdicts and the Phase 4 entry conditions. Do not promote
the changelog or create a tag unless the user explicitly requests a release.
