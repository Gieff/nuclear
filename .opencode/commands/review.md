---
description: Independently review a NuClear diff, package, or contract without editing.
agent: nuclear-reviewer
subagent: true
---

Review this target: `$ARGUMENTS`.

Read the vademecum and v3, inspect the supplied target and the current
diff when available, then report findings in severity order. Check:

- ownership and acyclic dependency direction;
- clinical/geometry/source-provenance invariants;
- separation of scientific worker, medical renderer, figure engine and UI;
- coordinate-space and link/lock semantics;
- offline fail-closed behaviour and high-resolution export path;
- missing tests, untruthful verification claims and files over 300 lines.

Conclude PASS, CONCERNS, or REJECT with exact file/line references. Do
not edit, stage or commit.

When the reviewed scope is the agent harness itself, also run
`npm run verify:harness` and treat the resolved agent permissions as
part of the review surface.
