# NuClear — Agent Directives & System Standards

NuClear is a clinical-grade, publication-ready multimodal medical imaging workstation and scientific figure authoring tool (PET/CT, Figure Composition, Vector Annotations) specialized for nuclear medicine and molecular imaging. This file is the single entry point; opencode loads it automatically.

## Core Philosophy
1. **Clinical Correctness First**: Physical patient geometry, quantitative SUV determination, and validated PACS fusion calibrations strictly override developer convenience or code brevity.
2. **No Invented Clinical Behavior**: If a rendering behavior, calibration, DICOM interpretation, or clinical convention is not documented or validated, agents must NEVER invent it silently. Propose candidates explicitly and document them as open decisions.
3. **No Simplification Without ADR**: Mathematical formulas, transfer functions, coordinate transforms, and geometric alignments defined in [PROJECT_VADEMECUM.md](docs/PROJECT_VADEMECUM.md) and [NUCLEAR_ARCHITECTURE_V3.md](docs/NUCLEAR_ARCHITECTURE_V3.md) must not be simplified or downgraded without an approved Architectural Decision Record (ADR).
4. **Headless-First & Contract-Driven**: The system must be capable of ingesting, reslicing, fusing, composing, and rendering publication figures (300/600 DPI) headless before attaching UI adapters. "Render state, emit intent."
5. **Acyclic Monorepo Boundaries**: The packages are `@nuclear/shared-types`, `@nuclear/rendering-presets`, `@nuclear/medical-engine`, `@nuclear/view-engine`, `@nuclear/figure-engine`, `@nuclear/project-model`, `@nuclear/ui`, `apps/desktop`, `python/`. UI observes state and emits intent; UI never defines clinical or composition domain rules.
6. **NuClear-Owned Evidence**: Clinical algorithms and rendering behaviour are accepted only through NuClear specifications, curated fixtures, declared tolerances, and reproducible tests. No external legacy repository is a dependency or compatibility target.

## Current Baseline — Phase 4 Complete (P4.0–P4.8, incl. P4.4b)
- Strategy: Greenfield repository structured on the v3 Architecture Blueprint ([NUCLEAR_ARCHITECTURE_V3.md](docs/NUCLEAR_ARCHITECTURE_V3.md)), executing the phased implementation plan:
  - **Fase 0**: Freeze, definition, and agent directives setup.
  - **Fase 1**: Clinical data, view, and figure contracts (`shared-types`, validators, fixtures, tests; NO UI).
  - **Fase 2**: Scientific DICOM ingestion & Python worker bridge (P2.0–P2.6 complete; see `docs/plans/PHASE_2_SCIENTIFIC_INGESTION_PLAN.md` and `docs/agentlog/phase-2.md`).
  - **Fase 3**: Headless medical engine (P3.0–P3.6 complete; see `docs/plans/PHASE_3_MEDICAL_ENGINE_PLAN.md`, `docs/agentlog/phase-3.md`, ADR-003–ADR-009). Real Cornerstone3D adapter/harness, explicit series-to-volume loading from accepted worker evidence, resource residency manager, `MedicalViewState` application with the pet/ct fusion radiometry spec, ordinary medical raster capture, and a temporary high-resolution `RenderTarget`. Evidence is software WebGL 2 (SwiftShader); hardware-GPU and a true production bundle remain `NOT YET APPLICABLE`.
  - **Fase 4**: View engine (**P4.0–P4.8 complete**, incl. correctives C5a, P4.6-N3, P4.7a and **P4.4b**; see `docs/plans/PHASE_4_VIEW_ENGINE_PLAN.md`, `docs/agentlog/phase-4.md`, ADR-010/ADR-011/ADR-012). `@nuclear/view-engine` delivers the headless `ImagingWorkspace` (1–4 groups × 4 slots), `PreparedView` assembly with immutable published DTOs and fail-closed provenance correlation, shared-state groups (atomic replacement regenerating a frozen projection), intra-study co-referenced and inter-study link **eligibility**, `StateLock` enforcement and local (non-canonical) `LocalViewOverride`, the persistent `ViewportSurfaceRegistry` with pure `SurfaceLayoutManager` host geometry, and declarative `ResourceDemand` projection into the Phase 3 `ResourceManager` via a caller-supplied retention builder seam. **`P4.4b` (inter-study link application/propagation) is complete (2026-09-23)** within the ratified ADR-012 record (Accepted, R-1..R-4 + OD-1..OD-6): `transformed`-only admission (`errorMarginMm <= toleranceMm`, Procrustes/landmark only, MI excluded under R11-B), mandatory DAG with cycle/convergence/lock refusals, workspace-level staged atomic `applySpatialIntent` with causality token, and native-grid domain outcomes via `@nuclear/medical-engine` `applySpatialTransform`/domain primitives. A workspace-level demand facade is carried as non-blocking debt (the residency fixture split closed in P4.8).
  - **Fase 5**: Figure engine & publication export (true high-res offscreen rendering, hybrid PDF, TIFF/PNG).
  - **Fase 6**: UI mockup with fake surfaces.
  - **Fase 7**: Production UI, mouse interaction layer, and desktop shell.

## Harness (opencode)
- Model: `deepseek/deepseek-flash` (set in [`opencode.json`](opencode.json)).
- Always-active entry point: this `AGENTS.md`. OpenCode V2 does not resolve the former `instructions` array, so every agent must read the applicable files in [`.agents/rules/`](.agents/rules/) before editing.
- Subagents: [`.opencode/agents/`](.opencode/agents/) — implementers `nuclear-scientific-engineer`, `nuclear-engine-engineer`, `nuclear-ui-engineer`; controls `nuclear-reviewer`, `nuclear-qa`, `nuclear-ux-auditor`; release `nuclear-changelog-writer`.
- Commands: [`.opencode/commands/`](.opencode/commands/) — `/phase <0–7> [goal]` drives one milestone; `/verify [scope]` reports the real verification state; `/review [scope]` runs the independent audit; `/promote-changelog [phase]` synthesizes distilled release notes.
- Skills: [`.agents/skills/`](.agents/skills/) — loaded on demand via the `skill` tool.

### Rules (`.agents/rules/`) — Always Active
- [`01-project-core.md`](.agents/rules/01-project-core.md): Mission, principles P1–P8, non-simplification law, no-invented-behavior rule.
- [`02-architecture.md`](.agents/rules/02-architecture.md): Package ownership matrix, acyclic dependency graph, universal file size limit (≤ 250–300 lines).
- [`03-code-quality.md`](.agents/rules/03-code-quality.md): Strict TypeScript, explicit error propagation, pre-commit gates (Agentlog, Changelog, File Length), atomic commits.
- [`04-orchestration.md`](.agents/rules/04-orchestration.md): Orchestrator duties, headless-first milestones, verification-before-acceptance.

### Skills (`.agents/skills/`) — Procedural Runbooks On-Demand
- [`nuclear-dicom`](.agents/skills/nuclear-dicom/SKILL.md): DICOM ingestion, physical patient geometry, FrameOfReferenceUID, quantitative SUV determination, Python IPC bridge.
- [`nuclear-rendering`](.agents/skills/nuclear-rendering/SKILL.md): Cornerstone3D authority, stable viewport surfaces, canonical gamma & transfer functions, temporary high-resolution RenderTargets.
- [`nuclear-testing`](.agents/skills/nuclear-testing/SKILL.md): Headless verification pipeline, typechecking, curated fixture regression tests, production builds.

<!-- BEGIN opencode-rag -->
## Code Navigation

ALWAYS use OpenCodeRAG tools before reading or editing:
- **Search first** — `search_semantic(query)` instead of grep/glob
- **Skeleton before read** — `get_file_skeleton(filePath)` then read specific lines
- **Usages before edit** — `find_usages(symbolName)` before modifying any symbol
- **Images via describe** — `describe_image(filePath, systemPrompt?)` — never read raw bytes
- **Recall quirks** — `recall_quirks(query)` when you hit a known pitfall
- **Add quirks** — `add_quirk(content)` when you discover a non-obvious fact
- **Fix quirks** — `update_quirk(id, ...)` / `delete_quirk(id)` when a stored quirk is outdated or wrong

If no results, run `opencode-rag index`.

### Decision tree — ALWAYS follow this order
1. User mentions code behavior/architecture → `search_semantic(query)`
2. User mentions a file path → `get_file_skeleton(filePath)` THEN `read` on specific lines
3. User mentions a function/class/variable to edit → `find_usages(symbolName)` THEN `search_semantic` THEN `edit`
4. User asks a code question → `search_semantic` to gather context before answering
5. User asks about an image or visual asset → `describe_image(filePath)` (optionally pass `systemPrompt` to focus on specific features) to retrieve its generated description, then optionally `search_semantic` for related code
6. You encounter an error or need to recall a known pitfall → `recall_quirks(query)`
7. You discover a non-obvious fact or workaround → `add_quirk(content)` to persist it for future sessions
8. A recalled quirk is outdated or wrong → `update_quirk(id, ...)` to fix it, or `delete_quirk(id)` if it no longer applies

### Proactive triggers — you MUST call these tools when
- User asks about code behavior, architecture, or implementation details
- User asks to edit, refactor, or fix code — call `find_usages` first
- User references files or functions you haven't read yet
- User says "find", "search", "look up", "where is", "how does"
- User refers to an image, screenshot, diagram, or visual asset
- Before answering ANY code-related question, retrieve context first
- Before reading ANY file, call `get_file_skeleton` to orient first

### Anti-patterns — NEVER do these
- Reading full files without calling `get_file_skeleton` first (wastes tokens)
- Editing a function without calling `find_usages` first (breaks call sites)
- Answering code questions without calling `search_semantic` first (you guess at behavior)
- Using `grep`/`glob` when `search_semantic` would find the answer faster
- Treating image files as text — use `describe_image` instead of reading raw bytes
- Using `npx opencode-rag quirk` shell commands instead of the built-in quirk tools (`add_quirk` / `recall_quirks` / `update_quirk` / `delete_quirk`) (the tools are faster, already loaded in-process, and go through the trust monitor)

### MANDATORY quirk capture rules — you MUST call `add_quirk` when
- A build, test, or type-check command fails and you resolve it
- You discover an undocumented library constraint, peer dep, or workaround
- You learn an environment-specific requirement (OS, tool version, etc.)
- You make a design decision that future sessions should remember
- You resolve a gotcha that cost more than one attempt

### MANDATORY quirk hygiene — you MUST call `update_quirk` or `delete_quirk` when
- A stored quirk is outdated, wrong, or has been fixed — update it or delete it instead of adding a contradicting duplicate
- NEVER finish a coding session without adding quirks for resolved errors.
<!-- END opencode-rag -->
