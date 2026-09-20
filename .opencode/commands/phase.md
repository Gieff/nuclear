---
description: Execute one NuClear Fase 0–7 objective with contracts, review and evidence.
agent: nuclear-orchestrator
subagent: false
---

Execute NuClear Fase `$1`. The optional remaining request is: `$2`.

First validate that `$1` is one integer from 0 through 7. If it is
missing or invalid, stop before editing and request a valid phase plus a
concrete goal.

Read `AGENTS.md`, `docs/PROJECT_VADEMECUM.md`,
`docs/NUCLEAR_ARCHITECTURE_V3.md`, and the applicable rules/runbooks.
Inspect the repository baseline before making a plan. State:

1. the phase objective and deliberately excluded work;
2. owner package(s), affected contracts, fixtures and source of truth;
3. acceptance tests, including negative/fail-closed cases;
4. the exact NuClear fixture and tolerance relevant to the task, if any;
5. the smallest bounded tasks and which specialist, if any, should do
   each one.

Implement only work within the requested phase. For non-trivial edits,
obtain `nuclear-reviewer` and `nuclear-qa` reports, inspect the real
diff, and persist the complete 8-point Handover Report in
`docs/agentlog/phase-$1.md` (ADR-001 / Rule 03 Gate 1). Never dump raw
handover notes into `CHANGELOG.md`; release notes are compiled via
`/promote-changelog $1`. A missing runner or fixture is BLOCKED or
NOT YET APPLICABLE, never PASS. Commit only after a verified task and
only if this repository is actually a Git repository; never push
without the user's explicit instruction.
