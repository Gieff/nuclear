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

### Gate 1: Changelog Gate
Verify that `CHANGELOG.md` under `## [Unreleased]` documents any notable feature, fix, or contract change.

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
