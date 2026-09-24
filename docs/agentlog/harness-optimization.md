# Agentlog — Harness Optimization (Percorso B, non-Fase)

Track: agent harness / workflow optimization. **Not** a Fase 0–7 objective and
not a product milestone. Authorized by the Plannotator-approved plan
`~/.plannotator/plans/nuclear-progetto-di-ottimizzaz-2026-09-24-approved.md`.

## 1. Implemented capabilities

1. **Fail-closed agent permissions.** All `.opencode/agents/*.md` migrated from
   the non-functional `permissions:` (plural) list to the opencode `permission:`
   (singular) schema. Read-only controls (`nuclear-reviewer`, `nuclear-qa`,
   `nuclear-ux-auditor`, `nuclear-changelog-writer`) now resolve to
   `edit: deny` (changelog scoped to `CHANGELOG.md` only); `bash` is
   whitelisted per role; `task` blocks unintended delegation.
2. **Plannotator integration for the orchestrator.** `opencode.json` configures
   `"planningAgents": ["plan", "nuclear-orchestrator", "nuclear-architect"]`,
   so the primary agent now resolves `submit_plan: allow` instead of the
   previous explicit `deny`.
3. **Role→model topology** ratified: orchestrator `openrouter/openai/gpt-6-luna`;
   write-bound implementers `openrouter/deepseek/deepseek-v4.1-flash`; read-bound
   `nuclear-scientific-engineer` on `deepseek/deepseek-flash`; controls on
   `openrouter/z-ai/glm-5.3-flash`; `nuclear-ux-auditor` on
   `deepseek/deepseek-flash`; one-shot fallback planner `nuclear-architect` on
   `openrouter/openai/gpt-6-sol`.
4. **Context discipline.** `compaction = { auto, prune: true, reserved: 12000 }`,
   `subagent_depth: 1`, per-agent `steps` caps, and the 100k/180k/272k token
   zones (one slice = one session = one agentlog entry).
5. **Objective harness gate.** `scripts/verify-harness.mjs`
   (`npm run verify:harness`) asserts 46 invariants against the resolved
   opencode config; exit 0 PASS / 1 FAIL / 2 BLOCKED.
6. **New `/intake` command** plus context-budget and harness-gate instructions
   in `/phase`, `/verify`, `/review`.

## 2. Files changed

New:
- `docs/decisions/ADR-017-agent-harness-topology-and-context-budget.md`
- `docs/plans/WORKFLOW_OPERATING_MODEL.md`
- `scripts/verify-harness.mjs`
- `.opencode/agents/nuclear-architect.md`
- `.opencode/commands/intake.md`

Modified:
- `opencode.json`, `package.json`, `AGENTS.md`
- `.agents/rules/03-code-quality.md`, `.agents/rules/04-orchestration.md`
- `.opencode/agents/` (orchestrator, engine-engineer, scientific-engineer,
  ui-engineer, reviewer, qa, ux-auditor, changelog-writer)
- `.opencode/commands/{phase,review,verify}.md`

No file under `packages/`, `apps/`, or `python/` was touched.

## 3. Architectural assumptions

- opencode uses `permission` (singular); the legacy plural list is ignored.
  Verified against `opencode debug config` before and after.
- Plannotator `workflow: plan-agent` grants `submit_plan` to `plan` +
  `planningAgents`, and merges `edit: {"*.md": "allow"}` into planning agents.
  The orchestrator retains full edit (`edit["*"] === "allow"`); `nuclear-architect`
  is denied all source writes (`edit["*"] === "deny"`) and may only write plans.
- OpenRouter cost depends on the upstream endpoint, not the model brand
  (26 endpoints for DeepSeek V4.1 Flash, 31 for GLM 5.3 Flash). Endpoint pinning
  was **not** verified, so the conservative no-pin branch is used.

## 4. Tests executed (real output)

| Gate | Command | Result |
| :--- | :--- | :--- |
| Harness | `npm run verify:harness` | **PASS** 46/46, exit 0 (negative probe N1 produced FAIL, 45/46) |
| TS typecheck | `npm run typecheck` | exit 0 |
| TS tests | `npm test` | 674 pass / 674, 0 fail |
| Build | `npm run build` | exit 0 |
| Python tests | `npm run test:python` | 411 passed |
| Python typecheck | `npm run typecheck:python` | Success, 77 files |

Independent control reports:
- `nuclear-reviewer`: **CONCERNS** (C1–C4); all addressed before commit — runbook
  model names corrected, gate strengthened (46 invariants), Rule 04 summary
  clarified, ADR planningAgents quote aligned. No REJECT.
- `nuclear-qa`: **6 PASS / 0 FAIL / 0 BLOCKED**, tree hygiene confirmed.

## 5. Documentation / ADRs

- `ADR-017` ratified (Accepted). Records the permission correction, topology,
  provider-economics policy, context budget, `small_model` decision, and gate.
- `WORKFLOW_OPERATING_MODEL.md` is the operative ten-stage runbook.
- `AGENTS.md` harness section and Rules 03/04 rewritten; the pre-existing
  untruthful claim ("`deepseek/deepseek-flash` for orchestrator and every
  subagent") is removed.

## 6. Project model impacts

None. No `.ncp` schema, project-model contract, or product API changed.

## 7. Technical debt and deviations from the approved plan

- **`small_model` left at the opencode default** (deviation). T2b found no
  credentialed `ollama` provider and confirmed the built-in default
  (`gpt-5-nano`, Zen) is already free; setting Ollama or Luna would be a cost
  regression. Documented in ADR-017 §6.
- **T7 authored directly by the orchestrator** (deviation). The engineer's
  `bash: "*": ask` would stall a `node`/`opencode` run; Rule 04 permits direct
  small single-file changes. The script was still reviewed and QA-gated.
- **Endpoint pinning unproven.** `extraBody`/per-model options passthrough
  exists, but `order`/`only`/`ignore` was not verified end-to-end. Open item:
  measure the actual provider via the OpenRouter generation API on the first
  slices, then revise ADR-017 §4 if pinning is viable.
- **QA bash breadth.** `nuclear-qa` may run any `npm run *` script (including
  `bump`, which writes). Deliberate trade-off; the edit layer remains denied.
- **Plannotator `.md` allowance.** Planning agents may edit markdown by design
  of `plan-agent`; the gate asserts only the `"*"` deny for the architect.

## 8. Next steps

1. Measure real per-provider cost via the OpenRouter generation API over the
   next 2–3 slices; revise ADR-017 §4 if endpoint pinning becomes viable.
2. Optionally configure a local Ollama provider for `small_model` if
   privacy/offline outweighs the added runtime dependency.
3. Resume product work: **Fase 6** (UI mockup with fake surfaces) under the new
   workflow, planning externally with GPT-6 Sol and reviewing via Plannotator.
