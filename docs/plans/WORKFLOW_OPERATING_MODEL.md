# NuClear — Agent Workflow Operating Model

Operative runbook for the NuClear agent harness. This document is normative for
*how agents are used*; it does not replace the Vademecum, Architecture v3, or
`AGENTS.md`. Ratified by [ADR-017](../decisions/ADR-017-agent-harness-topology-and-context-budget.md).

## 1. Roles

| Role | Agent | Model | Writes code? |
| :--- | :--- | :--- | :--- |
| Planner (one-shot) | external ChatGPT / `plan` / `nuclear-architect` | GPT-6 Sol (`high`) | no |
| Orchestrator | `nuclear-orchestrator` | GPT-6 Luna | config only, owns git |
| Implementer (write-bound) | `nuclear-engine-engineer`, `nuclear-ui-engineer` | DeepSeek V4.1 Flash (OpenRouter) | yes |
| Implementer (read-bound) | `nuclear-scientific-engineer` | `deepseek/deepseek-flash` (native) | yes |
| Reviewer | `nuclear-reviewer` | GLM 5.3 Flash | no (enforced) |
| QA | `nuclear-qa` | GLM 5.3 Flash | no (enforced) |
| UX auditor | `nuclear-ux-auditor` | `deepseek/deepseek-flash` | no (enforced) |
| Changelog | `nuclear-changelog-writer` | GLM 5.3 Flash | `CHANGELOG.md` only |

The orchestrator never plans and never writes product code; it decomposes an
approved plan and integrates verified results.

## 2. The ten stages

| # | Stage | Actor | Gate to pass |
| :-: | :--- | :--- | :--- |
| 1 | Idea / requirement | human | — |
| 2 | Plan (external) | GPT-6 Sol in the ChatGPT app | plan matches the template §4 |
| 3 | Plan review | human + Plannotator | explicit Approve |
| 4 | Orchestration | orchestrator | bounded brief + `steps` cap |
| 5 | Implementation | engineer | slice tests green |
| 6 | Independent review | reviewer | not REJECT |
| 7 | QA | QA | applicable gates PASS or NOT YET APPLICABLE |
| 8 | Human diff review | human + `plannotator review` | Approve |
| 9 | Atomic commit | orchestrator | Rule 03 §5 |
| 10 | Handover + release notes | orchestrator → changelog writer | Agentlog + Changelog Gate |

## 3. Context budget

Rule: **one slice = one session = one agentlog entry.** Do not continue a
session past its slice.

| Zone | Session tokens | Action |
| :--- | :--- | :--- |
| Green | < 100k | continue the slice |
| Yellow | 100–180k | close the slice, `/compact`, then decide |
| Red | 180–272k | forbidden to start a new step: hand off, open a new session |
| Black | > 272k | never reached — GPT-6 pricing doubles above 272k |

Mechanisms: `compaction.prune` removes stale tool output; per-agent `steps`
caps agentic iterations; hand-offs always land on disk (plan, agentlog, brief),
so a new session resumes from the filesystem, never from chat history.

## 4. Plan template (produced externally, reviewed in Plannotator)

Every plan must open with these headings:

```
Obiettivo
Esclusioni (deliberately excluded work)
Package/contratti toccati
Test di accettazione (positivi + negativi/fail-closed)
Fixture e tolleranze
Task bounded (one line each, with owner)
Rischi
```

## 5. External planner hand-off (ChatGPT → opencode)

1. In ChatGPT, use GPT-6 Sol with high reasoning and the §4 template; save the
   result as `docs/plans/<slug>.md` in the repository.
2. In opencode run `/plannotator-annotate docs/plans/<slug>.md`. Annotate in the
   browser; the annotations return to the active agent on stdout and the agent
   applies them to the file. Repeat until clean.
3. Obtain formal approval with `submit_plan` — the orchestrator now holds
   `submit_plan: allow` via `planningAgents`.
   `annotate` is iterative file review; `submit_plan` is formal approval. Use
   them in sequence, not as alternatives.
4. The orchestrator extracts exactly one slice and emits a bounded brief. It
   does not reopen the plan in chat.

### Quota fallback ladder
1. `nuclear-architect` on `openrouter/openai/gpt-6-sol`, `reasoningEffort: high`
   (one-shot).
2. `openrouter/anthropic/claude-opus-5.5` (one-shot).
3. Never plan inside the interactive loop with Luna or DeepSeek.

## 6. Bounded brief template (orchestrator → implementer)

```
Task: <one sentence>
Files: <exact paths>
Change: <exact required change>
Acceptance: <observable criteria>
Verify with: <exact command>
Constraints: <= 300 lines; no new deps; do NOT stage or commit.
```

## 7. Commands

- `/phase <0-7> [goal]` — drive one milestone with the gates above.
- `/verify [scope]` — QA gate matrix (PASS / FAIL / NOT YET APPLICABLE / BLOCKED).
- `/review [scope]` — independent read-only review.
- `/intake <file>` — open Plannotator annotation on an externally authored plan.
- `/promote-changelog <phase>` — distil agentlog into `CHANGELOG.md`.

## 8. Cost discipline (verified figures, 2026-09-24)

- The upstream provider is the primary lever: `deepseek/deepseek-v4.1-flash`
  spans $0.0400–$0.3750 input and $0.1860–$1.5000 output across 26 endpoints.
- Prompt caching is the second lever: `cache_read` is 33× cheaper than input
  on DeepSeek ($0.003/M native).
- Keep the orchestrator under 272k tokens; above it GPT-6 Luna doubles
  ($0.20/$0.75) and Sol jumps to $4/$15.
- Never run the expensive planner in a loop; it is one-shot by definition.
- The upstream provider actually used is *measured* via the OpenRouter
  generation/activity API, not assumed.

## 9. Harness verification

`npm run verify:harness` resolves the opencode config and asserts the ADR-017
invariants (read-only agents are `edit: deny`, the orchestrator can
`submit_plan`, compaction/prune enabled, no `permissions:` plural remains).
A missing runner or an unreadable config is BLOCKED, never PASS.
