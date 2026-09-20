# Rule 03: Code Quality, Styling & Verification Pipeline

## 1. TypeScript & Typing Directives
- **IF** declaring data structures or function signatures:
- **THEN** use strict contracts from `@nuclear/shared-types`.
- **NEVER** use `any` when a known type exists or can be defined.
- Maintain `noImplicitAny: true` and strict compilation across all packages.

## 2. Asynchronous Boundaries & Error Propagation
- **IF** crossing an asynchronous, WebGL, or IPC boundary:
- **THEN** implement an explicit error propagation or handling strategy (e.g. propagate errors to a centralized error boundary, or capture with actionable user-facing alerts).
- **NEVER** swallow errors silently with empty `catch {}` blocks unless explicitly documented as a benign fallback.

## 3. UI Presentation & Design System Standards
- **IF** styling React components in `@nuclear/ui`:
- **THEN** utilize theme variables and visual tokens defined in the NuClear design system (see `docs/NuClear: studio di identità.html`).
- **NEVER** inject monolithic inline style objects into JSX components.

## 4. Mandatory Pre-Commit Verification Pipeline
- **IF** declaring any feature, refactor, or contract complete:
- **THEN** the agent MUST run and verify the verification gates:
  1. **Agentlog Gate**: For every completed phase, milestone, or task slice, the mandatory 8-point Handover Report (§30.2) MUST be appended to `docs/agentlog/phase-<N>.md` before declaring completion.
  2. **Changelog Gate**: When updating `CHANGELOG.md` (or promoting entries), entries MUST strictly adhere to the Changelog Style Contract (distilled capabilities only; forbidden: internal file paths, line numbers, hashes, task codes, or code identifiers) matching Keep a Changelog 1.1.0 before committing.
  3. **File Length Gate**: Inspect all created or modified source files. If any source file exceeds **300 lines** (excluding pure data tables or static mockups/palettes), the commit/completion is blocked until modular decomposition is performed.
  4. `npm run typecheck` — 0 errors across all configured workspaces.
  5. `npm test` and Python tests — all configured, discovered tests pass.
  6. `npm run build` — production bundles compile cleanly once a production build exists.
- **Phase-aware evidence**: before a runner, fixture, or production bundle exists, report the corresponding gate as `NOT YET APPLICABLE` or `BLOCKED`; never fabricate a pass. A test command must not suppress failures with `|| true`.
- **NEVER** commit, tag, or merge code when an applicable gate fails.

## 5. Atomic Commits Protocol
- **Commit Preconditions**: Create a local Git commit only when Git is initialized, the user has requested a commit or an approved phase explicitly includes it, and every applicable verification gate is green. Do NOT batch multiple distinct tasks into a single commit.
- **Selective Staging**: Stage strictly the files modified for that specific task (`git add <files>`). NEVER run `git add .` or `git commit -a`.
- **Agentlog & Changelog Maintenance**: Append technical handover details to `docs/agentlog/phase-<N>.md`. NEVER dump raw handover reports into `CHANGELOG.md` (see [`ADR-001`](../../docs/decisions/ADR-001-two-tier-changelog-and-agentlog.md)). Maintain `CHANGELOG.md` strictly in distilled form, compiled via `/promote-changelog`.
- **Monorepo Version Synchronization**: When bumping versions or preparing a release, centrally synchronize package versions via `npm run bump <new-version>`.
- **Commit Message Format**: `<type>: <concise description>` (e.g., `feat(contracts): add ImagingAsset and SourceFingerprint`, `fix(worker): correct decay delta in SUV calculation`).
  - Permitted types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`.
- **No Automatic Push**: Commits must remain local until the user explicitly instructs to run `git push`.
- **Splitting Concerns**: If a task touches multiple packages or separate concerns, split the work into smaller, sequential atomic commits.

## 6. Git & Artifact Hygiene
- **IF** preparing files for staging or commit:
- **THEN** inspect `git status` to ensure only intended source files are included.
- **NEVER** commit `.vscode/`, `.DS_Store`, build outputs (`dist/`, `dist-electron/`), compiler cache files (`*.tsbuildinfo`), or Python virtual environments (`.venv/`).
