# ADR-001: Two-Tier Changelog & AgentLog Architecture

## Status
Accepted

## Date
2026-09-20

## Context & Problem Statement
In NuClear (and inherited from MedCanvas development), AI coding agents are required by Vademecum §30.2 to produce an exhaustive 8-point **Mandatory Handover Report** (implemented features, files changed, architectural assumptions, tests executed, documentation/ADRs, project model impacts, technical debt, and next steps) to guarantee repository self-sufficiency (§30.1.8).

However, previously no dedicated, persistent storage location was allocated for this technical handover report. Concurrently, Rule 03 enforced a pre-commit "Changelog Gate" requiring updates under `## [Unreleased]` in `CHANGELOG.md`. As a result, agents systematically dumped raw, fine-grained handover reports (including internal file paths, commit hashes, line number changes, private type names, and internal milestone task codes) into `CHANGELOG.md`.

In MedCanvas, this caused `CHANGELOG.md` to explode into over 1,000 lines (240 KB) of dense, unreadable prose, rendering it unusable for clinicians, external developers, and human stakeholders. NuClear began exhibiting this exact antipattern during Phase 1.

## Alternatives Considered

1. **Status Quo (Monolithic Dump in `CHANGELOG.md`)**:
   - *Pros*: Single file to check in pre-commit gates.
   - *Cons*: Destroys usability for humans; violates Keep a Changelog principles; mixes public product capabilities with internal AI scratchpads.

2. **Single Monolithic `AGENTLOG.md` in Repository Root**:
   - *Pros*: Separates human changelog from agent reports.
   - *Cons*: Quickly becomes thousands of lines; creates huge context token overhead whenever agents inspect repository status; prone to git merge conflicts during parallel subagent branches.

3. **Two-Tier Model: Segmented `docs/agentlog/phase-<N>.md` + Distilled `CHANGELOG.md` with Dedicated Subagent**:
   - *Pros*: Clean separation of concerns. AI handovers remain 100% lossless, detailed, and modularly bounded per phase/milestone. `CHANGELOG.md` remains strictly human-readable, adhering to Keep a Changelog 1.1.0. A dedicated subagent handles synthesis pre-release without polluting source code.
   - *Cons*: Requires an extra compilation step before release.

## Decision
We adopt the **Two-Tier Changelog & AgentLog Architecture**:

1. **Tier 1 — AI & Technical Handover Truth (`docs/agentlog/phase-<N>.md`)**:
   - Each phase/milestone maintains its own handover record (e.g., `docs/agentlog/phase-0.md`, `phase-1.md`).
   - The agent appends the complete 8-point Handover Report (§30.2) upon concluding any phase slice or milestone.
   - Exact file paths, mathematical formulas, commit references, test outputs, and technical debt are explicitly welcomed and required here.

2. **Tier 2 — Human-Facing Semantic Changelog (`CHANGELOG.md`)**:
   - Root `CHANGELOG.md` strictly adheres to [Keep a Changelog 1.1.0](https://keepachangelog.com/) and SemVer.
   - **Changelog Style Contract**:
     - **Prohibited**: internal file paths, line numbers, git commit hashes, internal task codes (`M5-04`, `Phase 1.1` in bullets), and internal variable/function names.
     - **Required**: one concise bullet per user-facing or architectural capability.
     - **Consolidation**: intermediate, superseded changes within the same release window must be synthesized into a single final statement.
     - **Categories**: standard Keep a Changelog headings (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`).

3. **Dedicated Subagent (`nuclear-changelog-writer`) & Promotion Protocol**:
   - Pre-release compilation of `CHANGELOG.md` is delegated to `.opencode/agents/nuclear-changelog-writer.md`.
   - The subagent has read access exclusively to `docs/agentlog/` and `CHANGELOG.md`, and write access strictly to `CHANGELOG.md`.
   - The orchestrator verifies the resulting diff and stages the commit.

4. **Split Verification Gates in Rule 03**:
   - **Agentlog Gate**: Enforces that `docs/agentlog/phase-<N>.md` is populated before task completion.
   - **Changelog Gate**: Enforces style contract compliance when `CHANGELOG.md` is updated.

## Rationale
This architecture eliminates documentation pollution, preserves full technical auditability for AI agents across context resets, and provides a clean, publication-grade changelog for human readers.

## Consequences & Trade-offs
- AI agents must write handover reports to `docs/agentlog/phase-<N>.md` rather than editing `CHANGELOG.md` during feature development.
- Releases require invoking `/promote-changelog` or running the `nuclear-changelog-writer` subagent to compile the release notes.
- Historical entries in `CHANGELOG.md` are migrated into `docs/agentlog/phase-0.md` and `docs/agentlog/phase-1.md`, and `CHANGELOG.md` is re-distilled.

## Conditions That Might Warrant a Revision
- If NuClear moves away from the phased delivery model (`Fase 0–7`) to continuous rolling micro-releases where phase boundaries do not exist.
- If automated toolchains (e.g., semantic-release with automated AST parsing) replace the LLM-assisted changelog consolidation.
