# NuClear — Agent Directives & System Standards

NuClear is a clinical-grade, publication-ready multimodal medical imaging workstation and scientific figure authoring tool (PET/CT, Figure Composition, Vector Annotations) specialized for nuclear medicine and molecular imaging. This file is the single entry point; opencode loads it automatically.

## Core Philosophy
1. **Clinical Correctness First**: Physical patient geometry, quantitative SUV determination, and validated PACS fusion calibrations strictly override developer convenience or code brevity.
2. **No Invented Clinical Behavior**: If a rendering behavior, calibration, DICOM interpretation, or clinical convention is not documented or validated, agents must NEVER invent it silently. Propose candidates explicitly and document them as open decisions.
3. **No Simplification Without ADR**: Mathematical formulas, transfer functions, coordinate transforms, and geometric alignments defined in [PROJECT_VADEMECUM.md](docs/PROJECT_VADEMECUM.md) and [NUCLEAR_ARCHITECTURE_V3.md](docs/NUCLEAR_ARCHITECTURE_V3.md) must not be simplified or downgraded without an approved Architectural Decision Record (ADR).
4. **Headless-First & Contract-Driven**: The system must be capable of ingesting, reslicing, fusing, composing, and rendering publication figures (300/600 DPI) headless before attaching UI adapters. "Render state, emit intent."
5. **Acyclic Monorepo Boundaries**: The packages are `@nuclear/shared-types`, `@nuclear/rendering-presets`, `@nuclear/medical-engine`, `@nuclear/view-engine`, `@nuclear/figure-engine`, `@nuclear/project-model`, `@nuclear/ui`, `apps/desktop`, `python/`. UI observes state and emits intent; UI never defines clinical or composition domain rules.
6. **NuClear-Owned Evidence**: Clinical algorithms and rendering behaviour are accepted only through NuClear specifications, curated fixtures, declared tolerances, and reproducible tests. No external legacy repository is a dependency or compatibility target.

## Current Baseline — Phase 0 (Foundation & Contracts Setup)
- Strategy: Greenfield repository structured on the v3 Architecture Blueprint ([NUCLEAR_ARCHITECTURE_V3.md](docs/NUCLEAR_ARCHITECTURE_V3.md)), executing the phased implementation plan:
  - **Fase 0**: Freeze, definition, and agent directives setup.
  - **Fase 1**: Clinical data, view, and figure contracts (`shared-types`, validators, fixtures, tests; NO UI).
  - **Fase 2**: Scientific DICOM ingestion & Python worker bridge.
  - **Fase 3**: Headless medical engine (Cornerstone adapter, volume loading, residency manager, offscreen RenderTarget).
  - **Fase 4**: View engine (surfaces, view slots, synchronization, linking, locks).
  - **Fase 5**: Figure engine & publication export (true high-res offscreen rendering, hybrid PDF, TIFF/PNG).
  - **Fase 6**: UI mockup with fake surfaces.
  - **Fase 7**: Production UI, mouse interaction layer, and desktop shell.

## Harness (opencode)
- Model: `deepseek/deepseek-flash` (set in [`opencode.json`](opencode.json)).
- Always-active entry point: this `AGENTS.md`. OpenCode V2 does not resolve the former `instructions` array, so every agent must read the applicable files in [`.agents/rules/`](.agents/rules/) before editing.
- Subagents: [`.opencode/agents/`](.opencode/agents/) — implementers `nuclear-scientific-engineer`, `nuclear-engine-engineer`, `nuclear-ui-engineer`; controls `nuclear-reviewer`, `nuclear-qa`, `nuclear-ux-auditor`.
- Commands: [`.opencode/commands/`](.opencode/commands/) — `/phase <0–7> [goal]` drives one milestone; `/verify [scope]` reports the real verification state; `/review [scope]` runs the independent audit.
- Skills: [`.agents/skills/`](.agents/skills/) — loaded on demand via the `skill` tool.

### Rules (`.agents/rules/`) — Always Active
- [`01-project-core.md`](.agents/rules/01-project-core.md): Mission, principles P1–P8, non-simplification law, no-invented-behavior rule.
- [`02-architecture.md`](.agents/rules/02-architecture.md): Package ownership matrix, acyclic dependency graph, universal file size limit (≤ 250–300 lines).
- [`03-code-quality.md`](.agents/rules/03-code-quality.md): Strict TypeScript, explicit error propagation, pre-commit gates (Changelog, File Length), atomic commits.
- [`04-orchestration.md`](.agents/rules/04-orchestration.md): Orchestrator duties, headless-first milestones, verification-before-acceptance.

### Skills (`.agents/skills/`) — Procedural Runbooks On-Demand
- [`nuclear-dicom`](.agents/skills/nuclear-dicom/SKILL.md): DICOM ingestion, physical patient geometry, FrameOfReferenceUID, quantitative SUV determination, Python IPC bridge.
- [`nuclear-rendering`](.agents/skills/nuclear-rendering/SKILL.md): Cornerstone3D authority, stable viewport surfaces, canonical gamma & transfer functions, temporary high-resolution RenderTargets.
- [`nuclear-testing`](.agents/skills/nuclear-testing/SKILL.md): Headless verification pipeline, typechecking, curated fixture regression tests, production builds.
