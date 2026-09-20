# AgentLog — Phase 0: Foundation & Contracts Setup

## 1. What Was Implemented
- Initialized greenfield NuClear repository structure with 7 decoupled domain packages:
  - `@nuclear/shared-types`
  - `@nuclear/rendering-presets`
  - `@nuclear/medical-engine`
  - `@nuclear/view-engine`
  - `@nuclear/figure-engine`
  - `@nuclear/project-model`
  - `@nuclear/ui`
- Adopted Master Architecture Blueprint v3 (`docs/NUCLEAR_ARCHITECTURE_V3.md`) establishing explicit coordinate chains, persistent `ViewportSurface` abstractions, and offline-safe `.ncp` project state.
- Adapted Project Vademecum (`docs/PROJECT_VADEMECUM.md`) codifying core clinical principles P1–P8 (Clinical Correctness First, No Invented Clinical Behavior, Cornerstone3D Authority, Python Scientific Worker, Figure Engine Isolation, Explicit Coordinate Systems, Offline-Safe Reproducibility, No Simplification Without ADR).
- Integrated NuClear Visual Identity & Design System specification (`docs/NuClear: studio di identità.html`).
- Established OpenCode harness and agent directives:
  - Entry point: `AGENTS.md`
  - Rules: `01-project-core.md`, `02-architecture.md`, `03-code-quality.md`, `04-orchestration.md`
  - Skills: `nuclear-dicom`, `nuclear-rendering`, `nuclear-testing`
  - Commands: `/phase`, `/verify`, `/review`, `/ux-audit`
  - Subagent definitions for orchestrator, scientific engineer, engine engineer, ui engineer, reviewer, qa, and ux auditor.
- Reconciled vademecum with v3 architecture and established `.ncp` (NuClearProject) as the sole native project serialization format.

## 2. Files Changed / Created
- `AGENTS.md`
- `opencode.json`
- `package.json`
- `tsconfig.base.json`
- `docs/NUCLEAR_ARCHITECTURE_V3.md`
- `docs/PROJECT_VADEMECUM.md`
- `docs/NuClear: studio di identità.html`
- `.agents/rules/01-project-core.md`
- `.agents/rules/02-architecture.md`
- `.agents/rules/03-code-quality.md`
- `.agents/rules/04-orchestration.md`
- `.agents/skills/nuclear-dicom/SKILL.md`
- `.agents/skills/nuclear-rendering/SKILL.md`
- `.agents/skills/nuclear-testing/SKILL.md`
- `.opencode/agents/*`
- `.opencode/commands/*`
- Packages: `packages/*/package.json`, `packages/*/tsconfig.json`

## 3. Architectural Assumptions Made
- Monorepo package boundaries are strictly acyclic: `shared-types` has zero internal or external runtime dependencies; `ui` depends on domain engines, never the reverse.
- UI components observe state and emit intent; UI never defines clinical or spatial domain rules.
- Local DICOM test cases in `tests/cases/` are excluded from git version control.

## 4. Tests Added & Executed
- Monorepo package dependency structure verified.
- Pre-commit file length and configuration gates confirmed.
- Verification command: `npm run typecheck` (scaffold baseline).

## 5. Documentation, Agentlog & ADR Status
- Vademecum §§1–32 complete and normative.
- Master Architecture Blueprint v3 in force.
- Agent rules 01–04 active and enforced.

## 6. Project Model Impact
- Adopted `.ncp` format as the sole persistence container for project serialization. Legacy project formats are explicitly out of scope.

## 7. Known Limitations & Technical Debt
- No runtime rendering or DICOM ingestion in Phase 0; focus was strictly foundation and governance contracts.

## 8. Exact Next Recommended Task
- Proceed to Phase 1: Clinical data contracts, validators, curated fixtures, and view/figure contract definitions in `@nuclear/shared-types`.
