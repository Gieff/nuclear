# Rule 04: Agent Orchestration & Subagent Delegation (opencode)

## 1. Role of the Main Agent (Orchestrator)
The Main Agent is the lead architect and pair programmer:
- Enforces [PROJECT_VADEMECUM.md](docs/PROJECT_VADEMECUM.md), [NUCLEAR_ARCHITECTURE_V3.md](docs/NUCLEAR_ARCHITECTURE_V3.md), and Rules 01–03 across all operations.
- Structures complex milestone phases into modular, actionable steps before touching code.
- Synthesizes and audits subagent outputs before merging or presenting them to the user.
- Owns all git staging and atomic commits (Rule 03). Subagents never commit.

## 2. Harness Topology (opencode)
- The role→model topology is normative in [`ADR-017`](../../docs/decisions/ADR-017-agent-harness-topology-and-context-budget.md) and [`WORKFLOW_OPERATING_MODEL.md`](../../docs/plans/WORKFLOW_OPERATING_MODEL.md). Summarised: orchestrator on `openrouter/openai/gpt-6-luna`; write-bound implementers on `openrouter/deepseek/deepseek-v4.1-flash`; read-bound `nuclear-scientific-engineer` on `deepseek/deepseek-flash`; enforced read-only controls `nuclear-reviewer`, `nuclear-qa`, `nuclear-changelog-writer` on `openrouter/z-ai/glm-5.3-flash` (`nuclear-ux-auditor` on `deepseek/deepseek-flash`); one-shot planner external GPT-6 Sol with `nuclear-architect` as the quota fallback.
- Agent permissions MUST use the opencode `permission:` schema (singular). The legacy `permissions:` list is invalid and silently ignored; never reintroduce it. `npm run verify:harness` enforces this.
- Built-in subagents available through the `task` tool: `explore` (fast read-only search) and `general` (multi-step work). The orchestrator's `task` permission allowlists `nuclear-*` and `explore`.
- Implementer subagents: `nuclear-scientific-engineer` (`python/`, IPC), `nuclear-engine-engineer` (`@nuclear/medical-engine`, `@nuclear/view-engine`, `@nuclear/figure-engine`), `nuclear-ui-engineer` (`@nuclear/ui`).
- Control subagents (read-only, enforced): `nuclear-reviewer`, `nuclear-qa`, `nuclear-ux-auditor`.
- Project commands: `/phase <N>` drives one milestone phase; `/verify` runs the full verification pipeline; `/intake <file>` opens Plannotator on an external plan.
- Context budget: one slice = one session = one agentlog entry; token zones green < 100k, yellow 100–180k, red 180–272k, black > 272k (never reached). Close the slice before yellow ends and hand off on disk.
- Procedural runbooks live in `.agents/skills/` and are loaded on demand with the `skill` tool (`nuclear-dicom`, `nuclear-rendering`, `nuclear-testing`).

## 3. Delegation Boundaries & Contract Protection
- **IF** delegating tasks to subagents:
- **THEN** define precise roles, input contracts, and clear success criteria.
- **NEVER** delegate architecture-defining decisions without explicitly reviewing and validating the result.
- **NEVER** allow subagents to silently redefine project contracts, shared types, clinical standards, or to create a parallel implementation. Subagents must return explicit findings and recommendations.
- Give every subagent an explicit, self-contained brief: exact files, required change, acceptance criteria, and the exact verification command. Subagents do NOT see the parent conversation history.

## 4. Orchestrator Directives: Manage, Don't Execute
Your comparative advantage is decomposition, judgment, verification, and integration.

### Act directly (without a subagent) when:
- Understanding and exploration: direct questions, architectural explanations, focused reads and greps.
- Small changes: edits of roughly <= 30 lines across 1–2 files, or quick follow-ups inside an active review loop.
- High briefing overhead: if writing a self-contained brief costs more than the implementation.
- Git operations: the parent orchestrator owns all staging and atomic commits.

### Delegate via the `task` tool when:
- Implementation spans 3+ files, is mechanical/repetitive, or partitions cleanly into independent modules.
- Independent review is required (use `nuclear-reviewer` for diffs, `nuclear-qa` for acceptance gates).
- Briefing standard: exact file paths, specific changes, acceptance criteria, verification command, and the instruction *"Do NOT stage or commit git changes; the parent session owns all git operations."*

### Rigorous verification before acceptance:
- **NEVER** accept a subagent's self-report as verified.
- Always inspect the actual diff (`git diff`), run the relevant gate from `nuclear-testing`, and only then stage and create the atomic commit.

## 5. Milestone Completion Protocol
- **IF** concluding any milestone phase, feature, or contract set:
- **THEN** delegate acceptance to `nuclear-qa` (or run `nuclear-testing` directly) and confirm all clinical parameters against NuClear-owned curated fixtures and declared tolerances.
- **NEVER** declare a task done based on assumptions or mocks without terminal verification.
- **Context budget**: run one slice per session and hand off on disk before the session reaches 180k tokens; never cross 272k (GPT-6 pricing doubles above it). `docs/plans/WORKFLOW_OPERATING_MODEL.md` is the normative runbook.
- Persist the complete 8-point Handover Report in `docs/agentlog/phase-<N>.md` (Gate 1: Agentlog Gate).
- When promoting or tagging a release, delegate `CHANGELOG.md` compilation to `nuclear-changelog-writer` (or invoke `/promote-changelog`), verify the distilled diff, and stage the commit. Never dump raw handover notes into `CHANGELOG.md`.
