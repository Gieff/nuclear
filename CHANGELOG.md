# Changelog — NuClear

All notable changes to the NuClear workstation will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Phase 0 (Foundation & Contracts Setup)**:
  - Initialized NuClear repository structure with 7 decoupled domain packages (`shared-types`, `rendering-presets`, `medical-engine`, `view-engine`, `figure-engine`, `project-model`, `ui`).
  - Adopted Master Architecture Blueprint v3 (`docs/NUCLEAR_ARCHITECTURE_V3.md`) with explicit coordinate chains, persistent ViewportSurfaces, and offline-safe project state.
  - Adapted Project Vademecum (`docs/PROJECT_VADEMECUM.md`) establishing principles P1–P8.
  - Included the NuClear Visual Identity & Design System specification (`docs/NuClear: studio di identità.html`).
  - Configured agent directives (`AGENTS.md`), OpenCode profiles/commands, rules (`01-project-core.md`, `02-architecture.md`, `03-code-quality.md`, `04-orchestration.md`), and specialized skills (`nuclear-dicom`, `nuclear-rendering`, `nuclear-testing`).

### Changed
- Reconciled the vademecum with the v3 NuClear architecture: seven package boundaries, headless-first Fase 0–8 delivery, source verification, persistent surfaces, and high-resolution hybrid export are now the governing execution model.
- Migrated OpenCode profiles, commands, permissions, and Playwright MCP configuration to the current V2 project layout; verification now reports unavailable evidence instead of masking it as success.
