---
description: Run honest NuClear verification gates for a scope or the current baseline.
agent: nuclear-qa
subagent: true
---

Audit and verify this NuClear scope: `$ARGUMENTS`.

Start by inventorying the real repository: Git availability, installed
toolchain, package/tsconfig/test configuration, source files, fixtures
and test discovery. Read the vademecum and `nuclear-testing` first.

Run only gates that are implemented and relevant to this scope. Assess
file length, TypeScript, JavaScript/TypeScript tests, Python tests,
build and fixture-regression evidence independently. Do not infer a build from a
typecheck, and do not infer test success from a command that masks
errors or discovers zero tests.

Return a concise gate matrix with status PASS, FAIL, NOT YET APPLICABLE
or BLOCKED; exact commands/output; evidence used; and one smallest next
action for every non-PASS row. Do not edit, stage or commit.

Always include the harness gate: run `npm run verify:harness` and report
it as a first-class row (BLOCKED, never PASS, if the runner is absent).
The control agents are read-only enforced by the opencode `permission`
schema (singular), not by prompt wording alone.
