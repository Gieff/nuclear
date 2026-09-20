# Phase 2 — OpenCode Orchestration Runbook

## Start Command

Use the phase command with a bounded slice, never with the entire phase in one
turn:

```text
/phase 2 P2.0: establish the Python runner, fixture manifest and versioned JSON-RPC examples from ADR-002.
```

The orchestrator must read this runbook, ADR-002, the Phase 2 plan,
`nuclear-dicom` and `nuclear-testing` before delegation.

## Delegation Sequence

1. `nuclear-scientific-engineer` implements exactly one P2.x slice. Its brief
   names allowed files, expected fixture outputs, negative cases and states
   that it must not stage or commit.
2. `nuclear-reviewer` reviews the real diff against ADR-002, the plan and the
   worker boundary. It is read-only and reports PASS, CONCERNS or REJECT.
3. `nuclear-qa` runs only configured tests and reports PASS, FAIL, BLOCKED or
   NOT YET APPLICABLE. It must name commands and fixture evidence.
4. The orchestrator resolves every REJECT/FAIL, inspects the final diff, then
   appends the slice evidence to `docs/agentlog/phase-2.md`.
5. The orchestrator creates a selective atomic commit only after applicable
   gates are green. It never pushes unless the user explicitly requests it.

P2.5 additionally delegates the bridge facade to `nuclear-engine-engineer`
only after P2.1 through P2.4 protocol responses are accepted.

## Required Brief Fields

Every subagent brief must state:

1. P2.x objective and exclusions;
2. owner package and allowed files;
3. authoritative contract and protocol version;
4. synthetic fixture inputs and exact expected outputs or declared tolerance;
5. positive and fail-closed negative cases;
6. commands to run and evidence to report;
7. no staging, committing or pushing.

## Stop Conditions

Stop the active slice and record `BLOCKED` when any of these is unresolved:

- Python dependencies or runner cannot be provisioned;
- no reproducible synthetic fixture can exercise the requested behaviour;
- the DICOM interpretation requires an undocumented clinical convention;
- a result would require resampling, registration or a renderer owned by a
  later phase;
- a proposed tolerance is not traceable to the fixture/specification.

## Final Phase Handover

After P2.6, complete all eight sections in `docs/agentlog/phase-2.md` and run
`/promote-changelog 2` only when preparing a release-facing changelog update.

