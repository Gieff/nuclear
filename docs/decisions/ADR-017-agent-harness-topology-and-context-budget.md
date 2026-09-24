# ADR-017: Agent Harness Topology, Provider Economics & Context Budget

## Status
Accepted (2026-09-24), approved through the Plannotator plan review for the
Percorso B harness-optimization workstream.

## Date
2026-09-24

## Context & Problem Statement
A read-only audit of the opencode harness (`opencode debug config`, the
official opencode docs, the installed `@plannotator/opencode` bundle, and the
local `~/.cache/opencode/models.json` plus the live OpenRouter catalogue)
surfaced five verified defects and gaps:

1. **Invalid permission schema.** Every agent in `.opencode/agents/` declared
   `permissions:` (plural, a list of `{action, resource, effect}`). opencode
   only understands `permission:` (singular, a map of key to `allow|ask|deny`,
   with glob patterns for `edit`, `bash`, `task`). The resolved config showed
   `permission = None` for `nuclear-qa`, `nuclear-reviewer`,
   `nuclear-changelog-writer`, `nuclear-engine-engineer`,
   `nuclear-scientific-engineer`, `nuclear-ui-engineer` and
   `nuclear-ux-auditor`. As a consequence the claimed "read-only" agents were
   effectively **fail-open** (full write access), and the changelog writer
   could edit any file, not only `CHANGELOG.md`.
2. **Plannotator isolation.** Under the default `plan-agent` workflow,
   `submit_plan` is granted only to the built-in `plan` agent plus the
   `planningAgents` list. The resolved config explicitly set
   `nuclear-orchestrator` (the NuClear primary agent) to `submit_plan: deny`,
   so the orchestrator could not submit or approve a plan.
3. **Documentation drift.** `AGENTS.md` and `.agents/rules/04-orchestration.md`
   asserted that the working model was `deepseek/deepseek-flash` for the
   orchestrator *and every subagent*, while the control agents already ran on
   `openrouter/z-ai/glm-5.3-flash`. The repository's own directives were not
   truthful.
4. **No single model price.** On OpenRouter a model is served by many upstream
   endpoints with very different prices and quantizations (26 endpoints for
   `deepseek/deepseek-v4.1-flash`, 31 for `z-ai/glm-5.3-flash`). The cost of a
   role is therefore a routing decision, not a model property. Both the user's
   and the first-draft figures were endpoint-specific.
5. **Unused cost levers.** `small_model`, `compaction.prune`, per-agent
   `steps`, `permission.task`, `reasoningEffort` and `subagent_depth` were not
   configured at all.

Additionally, long-lived interactive sessions grow cost super-linearly: the
GPT-6 family doubles price above a **272k-token** context tier, so "huge
context window" must never be treated as "cheap context".

## Decision

### 1. Migrate every agent to the `permission` schema (fail-closed)
`permissions:` is removed. Read-only agents receive `edit: deny`; the changelog
writer receives `edit: {"*": "deny", "CHANGELOG.md": "allow"}`; `bash` is
whitelisted per role; `task: deny` blocks unintended delegation. This is a
security correction, not a preference.

### 2. Grant `submit_plan` to the orchestrator
`opencode.json` configures Plannotator with
`"planningAgents": ["plan", "nuclear-orchestrator", "nuclear-architect"]` so the
primary NuClear agent (and the one-shot fallback planner) can submit and
approve plans.

### 3. Role → model topology

| Role | Agent | Model |
| :--- | :--- | :--- |
| Planner (one-shot) | external ChatGPT GPT-6 Sol; fallback `nuclear-architect` | `openrouter/openai/gpt-6-sol` (`reasoningEffort: high`) |
| Orchestrator | `nuclear-orchestrator` | `openrouter/openai/gpt-6-luna` |
| Implementer (write-bound) | `nuclear-engine-engineer`, `nuclear-ui-engineer` | `openrouter/deepseek/deepseek-v4.1-flash` |
| Implementer (read-bound) | `nuclear-scientific-engineer` | `deepseek/deepseek-flash` |
| Reviewer / QA / Changelog | `nuclear-reviewer`, `nuclear-qa`, `nuclear-changelog-writer` | `openrouter/z-ai/glm-5.3-flash` |
| UX auditor | `nuclear-ux-auditor` | `deepseek/deepseek-flash` |

### 4. Provider economics policy
The upstream endpoint, not the model brand, is the primary cost lever.
`extraBody`/per-model `options` passthrough exists in opencode, but endpoint
pinning (`order`/`only`/`ignore`) was **not verified end-to-end**, so this ADR
takes the conservative no-pin branch: write-bound roles use OpenRouter
(default routing) and read-bound roles use the native DeepSeek provider
(lowest `cache_read`, $0.003/M). If endpoint pinning is later proven, a
follow-up revision may split the two DeepSeek profiles by endpoint. Actual
provider selection is to be **measured** via the OpenRouter generation/activity
API over the first slices rather than assumed.

### 5. Context budget and compaction
Operational thresholds: **green < 100k**, **yellow 100–180k**, **red
180–272k**, **black > 272k** (never reached). One slice = one session = one
agentlog entry. `compaction = { auto: true, prune: true, reserved: 12000 }`;
per-agent `steps` caps bound agentic iterations.

### 6. `small_model` is left at the opencode default
The built-in default (`gpt-5-nano`, hosted by Zen) is already the cheapest
viable option for title generation. `ollama` is not currently a credentialed
opencode provider on this machine, and configuring it or using GPT-6 Luna
would be a cost regression. Local Ollama therefore remains a documented,
optional alternative, not a default.

### 7. Objective harness gate
A read-only `scripts/verify-harness.mjs` (`npm run verify:harness`) resolves
the opencode config, filters only safe fields, and asserts the invariants of
this ADR. A missing runner or unreadable config is **BLOCKED**, never PASS.

## Alternatives Considered

1. **Keep the prompt-level "read-only" instruction** (status quo).
   *Cons*: no enforcement; a compromised or confused agent can write at will.
2. **Plannotator `workflow: all-agents`.** Simple, but re-introduces broad
   `submit_plan` exposure and contradicts the intent of least privilege.
3. **Run the changelog writer on local Ollama** (`deepseek-r1:8b`,
   `llama3.1:8b`, `qwen2.5:3b` on a 16 GB M4). *Cons*: agentlogs are large
   (tens of thousands of tokens) — no room in 16 GB shared memory — and the
   available models either lack tool calling (`r1:8b`) or are too weak for the
   strict ADR-001 style contract. Cloud GLM costs < $0.01 per release.
4. **Pin OpenRouter endpoints blindly** using an unverified `extraBody`
   payload. *Cons*: violates the no-invented-behaviour rule; would silently
   fail or mis-route.

## Rationale
Fail-closed permissions and verified config are prerequisites for any claim of
a controlled workflow. Separating the expensive one-shot planning step from
the cheap interactive loop, and bounding context momentum with explicit token
zone limits, addresses the observed super-linear cost growth directly. Leaving
`small_model` at the free default avoids optimising a cost that is already
zero.

## Consequences & Trade-offs
- Agent markdown files change shape from `permissions:` lists to `permission:`
  maps; this is a breaking change for any external tooling that parsed the old
  (non-functional) schema.
- Expensive models (Sol, Opus) are only invoked one-shot; interactive
  orchestration runs on Luna and implementation on DeepSeek.
- Provider/endpoint selection is explicitly left un-pinned and must be measured;
  the gate asserts model *names*, not upstream endpoints.
- `nuclear-architect` is added as a quota-exhaustion fallback for planning; it
  is not the default planner.

## Conditions That Might Warrant a Revision
- If opencode exposes verified OpenRouter endpoint pinning, split the DeepSeek
  profiles by endpoint and update section 4.
- If a local model on this workstation can hold a 100k-token context with
  reliable tool calling, revisit section 6.
- If NuClear moves away from the Fase 0–7 phased model, revisit the one-slice
  session rule in section 5.
