---
description: Synthesize phase agentlog into human-readable CHANGELOG.md via nuclear-changelog-writer.
agent: nuclear-changelog-writer
subagent: true
---

Promote and synthesize release notes for phase: `$ARGUMENTS`.

1. Read `docs/agentlog/phase-$1.md` (or the relevant milestone agentlog file matching `$1`).
2. Synthesize all implemented capabilities, workflows, fixes, and security enhancements into `CHANGELOG.md` under `## [Unreleased]`.
3. Strictly enforce the **Changelog Style Contract** ([`ADR-001`](docs/decisions/ADR-001-two-tier-changelog-and-agentlog.md)):
   - **Prohibited**: internal file paths, line numbers, git commit hashes, internal task/slice codes, or code identifiers (function/variable names).
   - **Required**: one concise bullet per capability.
   - **Consolidated**: intermediate or superseded iterations within the phase window must be unified into a single coherent entry.
   - **Standard categories**: `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed`, `### Security`.
4. Edit only `CHANGELOG.md`. Do not touch any package code or run git commands.
