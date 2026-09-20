---
name: nuclear-testing
description: Phase-aware verification runbook for NuClear. Executes configured typechecking, tests, worker assertions, curated-fixture regression checks, and production-build checks without treating absent runners or fixtures as successful. Use before declaring any task complete or committing changes.
---

# NuClear Testing Skill

## 1. When to Activate
Activate this skill when:
- Verifying code changes before declaring completion or staging a commit.
- Running the mandatory Rule 03 pre-commit verification gates.
- Executing regression comparisons against curated NuClear fixtures and declared expected outputs.
- Performing milestone acceptance audits (`nuclear-qa`).

## 2. Verification Gates Pipeline

First inventory the configured scripts, installed tools, test discovery,
fixtures and current phase. Run each applicable gate in sequence and
mark every row `PASS`, `FAIL`, `NOT YET APPLICABLE`, or `BLOCKED`.

### Gate 1: Agentlog & Changelog Gate
1. **Agentlog Verification**: Verify that `docs/agentlog/phase-<N>.md` contains the mandatory 8-point Handover Report (§30.2) for the active phase/slice before declaring completion.
2. **Changelog Verification**: If `CHANGELOG.md` is modified, verify that entries strictly adhere to the Changelog Style Contract (distilled capabilities only; no internal file paths, commit hashes, line numbers, task codes, or code identifiers). Raw handover reports must NEVER be committed to `CHANGELOG.md`.

### Gate 2: File Length Gate
Ensure no source file in `packages/`, `apps/`, or `python/` exceeds **300 lines**.

### Gate 3: Strict Monorepo Typecheck
```bash
npm run typecheck
```
Must pass with 0 errors across configured workspaces. Before a root
solution `tsconfig` and package projects exist, report the state rather
than treating an empty or failing command as a valid typecheck.

### Gate 4: Test Suite & Fixture Regression
```bash
npm test
```
Must pass 100% of tests that are actually configured and discovered.
For numerical algorithms (SUV, reslicing, co-registration), assert
equivalence with a named NuClear fixture and an explicit tolerance.
Zero discovered tests and `|| true` are not a passing gate.

### Gate 5: Production Build Verification
```bash
npm run build
```
Must compile configured production bundles cleanly without warnings or
errors. Before a desktop/bundle configuration exists, mark this gate
`NOT YET APPLICABLE`.

## 3. Changelog Promotion & Consolidation Protocol
When preparing an official release or promoting unreleased phase changes:
1. **Never Promote by Bare Rename**: Do NOT simply rename `## [Unreleased]` to a version tag.
2. **Synthesize via `nuclear-changelog-writer`**: Invoke `/promote-changelog <phase>` or delegate to `nuclear-changelog-writer`.
3. **Consolidate Superseded Changes**: Inspect the phase window in `docs/agentlog/phase-<N>.md`; unify multiple incremental changes into a single capability bullet.
4. **Style Audit**: Confirm the resulting `CHANGELOG.md` diff contains zero file paths, zero commit hashes, zero internal code symbols, and clean Keep a Changelog categories (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`).
5. **Orchestrator Review & Commit**: The orchestrator reviews the diff and stages `CHANGELOG.md`.
