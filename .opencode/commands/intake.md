---
description: Open Plannotator on an externally authored plan file.
agent: nuclear-orchestrator
subagent: false
---

Open Plannotator on this plan target: `$ARGUMENTS`.

Run `plannotator annotate $ARGUMENTS` in the foreground and wait for it
to finish. Relay its stdout. Apply the returned annotations directly to
the plan file and iterate until the plan is clean.

When the plan is clean, submit it for formal approval with
`submit_plan` (the orchestrator holds that permission via
`planningAgents`). Do not begin implementation until the plan is
approved; then extract one slice and delegate it with a bounded brief.
Do not ask the user to run the command themselves.
