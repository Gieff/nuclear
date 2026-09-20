# Phase 3 — Headless Medical Engine, Residency & RenderTarget

Status: **IN PROGRESS** — P3.0 accepted; P3.1–P3.6 not started.
Baseline entry: Phase 2 closed at `e59e748`; Phase 3 plan/runbook added at
`b793631`.

---

# Handover Report — P3.0: Renderer Feasibility Baseline

## 1. What Was Implemented

P3.0 established the real, reproducible Cornerstone3D/WebGL 2 capability that
Phase 3 depends on, without implementing the medical-engine adapter (P3.1).

- **Renderer dependency decision recorded.** `@cornerstonejs/core@5.10.7`
  is pinned exactly and owned by `@nuclear/medical-engine`, per Rule 02. No
  other package gained a renderer dependency.
- **Runtime-host decision recorded.** DOM/WebGL objects are supplied to the
  engine through a narrow injected host port; public `medical-engine` state
  stays serializable and UI-agnostic (ADR-003).
- **Controlled WebGL 2 harness created** under `tests/rendering/` as test
  infrastructure only: a Playwright-driven headless Chromium page loading an
  esbuild-bundled browser probe, served from an ephemeral `127.0.0.1`
  server. No product UI, no React, no desktop shell.
- **Real feasibility probe executed.** `cornerstone.init()` initializes the
  real `@cornerstonejs/core@5.10.7`; `detectRenderingCapabilities()` reports
  WebGL 2; a `RenderingEngine` with a `STACK` viewport is created, enabled,
  destroyed, initialization is reset, and a second init → engine → teardown
  cycle completes with zero console/page errors.
- **Fail-closed path proven.** Under `--disable-webgl --disable-webgl2` the
  harness rejects with a typed `RendererUnavailableError`
  (`code: 'RENDERER_UNAVAILABLE'`), and the probe reports `ok:false` with a
  reason.
- **Pixel-bearing fixture policy fixed** (ADR-003): committed, programmatically
  reproducible CT/PT fixtures with declared pixels/dimensions/modality/
  geometry/expected worker evidence; gitignored `tests/cases/` is never PASS
  evidence. Fixture creation itself remains P3.2.
- **Renderer gate configured as non-optional.** `npm run test:renderer`
  exists and `npm test` (`node --test`) auto-discovers the renderer suite.

Default backend is deterministic **software WebGL 2** (ANGLE/SwiftShader);
this is reported honestly as `softwareRasterizer: true` and never claimed as
hardware. `NUCLEAR_RENDERER_GL=metal` selects the hardware backend.

## 2. Files Changed / Created

Created:
- `docs/decisions/ADR-003-cornerstone-runtime-host-and-renderer-harness.md`
- `tests/rendering/fixtures/renderer-harness.mjs` (232 lines — esbuild bundle,
  ephemeral HTTP server, Playwright lifecycle, typed unavailability error)
- `tests/rendering/fixtures/harness-entry.ts` (171 lines — browser probe;
  the only new file importing `@cornerstonejs/core`)
- `tests/rendering/renderer-feasibility.test.ts` (201 lines — node:test
  positive + fail-closed negative)

Modified:
- `packages/medical-engine/package.json` — `+ "@cornerstonejs/core": "5.10.7"`
- `package.json` (root) — devDeps `playwright@1.63.0`, `esbuild@0.28.2`,
  `events@3.3.0`, `url@0.11.4` (all exact); script `test:renderer`
- `package-lock.json` — regenerated via `npm install`
- `.gitignore` — ignore `tests/rendering/.harness/` (generated bundle)

Not modified: any `packages/*/src/**`, any other package, the Phase 3 plan,
`CHANGELOG.md`, the version (`0.1.2`).

## 3. Architectural Assumptions Made

- **Cornerstone3D is ESM-only** at 5.10.7 (`./dist/esm/*`, no UMD/IIFE), so a
  browser harness must bundle. Bundling its `@kitware/vtk.js` dependency pulls
  `xmlbuilder2`/`@oozcitak/url`, which require the Node builtins `events` and
  `url`; the browser polyfill packages are therefore devDependencies.
- **A real WebGL 2 harness is required and exists.** Per the Phase 3 plan a
  fake Canvas/CPU renderer is forbidden; software rasterization via
  SwiftShader still executes Cornerstone's own WebGL 2 pipeline and is
  reported as software.
- **Host ownership is injected, not global.** The adapter (P3.1) receives a
  host port; the harness satisfies it in tests and Electron will satisfy it
  in Phase 7. Neither public contracts nor persisted state may depend on which
  host is bound.
- **Direct `@cornerstonejs/core` imports are confined** to the bundle entry
  now and the adapter from P3.1; package code under `src/` still imports
  nothing from Cornerstone.
- Recorded as ADR-003 so P3.1 may depend on these decisions.

## 4. Tests Added & Executed

Added: `tests/rendering/renderer-feasibility.test.ts` (2 tests).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm run build` | clean (exit 0) |
| `npm test` | **55 pass / 0 fail** (53 pre-existing + 2 renderer) |
| `npm run test:renderer` | **2 pass / 0 fail** |
| `npm run test:python` | **166 passed** |
| `npm run typecheck:python` | clean over 43 source files |
| `NUCLEAR_RENDERER_GL=metal npm run test:renderer` | 2 pass (hardware path) |

Measured renderer evidence (default SwiftShader):
`renderer = ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)
(0x0000C0DE)), SwiftShader driver)`, `softwareRasterizer = true`,
`maxTextureSize = 8192`, `max3DTexture = 2048`,
`version = WebGL 2.0 (OpenGL ES 3.0 Chromium)`, `floatLinear = true`.
Hardware (`metal`): `ANGLE (Apple, ANGLE Metal Renderer: Apple M4)`,
`softwareRasterizer = false`, `maxTextureSize = 16384`, `norm16 = true`.

Negative case: `--disable-webgl --disable-webgl2` →
`RendererUnavailableError` / `RENDERER_UNAVAILABLE`; probe
`{ ok:false, reason:'getContext("webgl2") returned null' }`.

No test uses `|| true`. `tests/cases/` (gitignored real DICOM) is not used as
evidence.

## 5. Documentation, Agentlog & ADR Status

- ADR-003 records the renderer dependency, runtime-host ownership, harness
  boundary and fixture policy; Status **Accepted**.
- This report satisfies the AgentLog Gate for P3.0.
- `CHANGELOG.md` untouched (raw handovers never go to the changelog; release
  notes are compiled later via `/promote-changelog 3`).
- Reviewer verdict: **PASS**. QA verdict: **ACCEPTED** (all gates PASS or NOT
  YET APPLICABLE; zero FAIL/BLOCKED).

## 6. Project Model Impact

- None. No `.ncp` schema, shared contract, residency vocabulary, fixture
  semantics, version or package graph changed. P3.0 adds tooling, a decision
  record and test infrastructure only.

## 7. Known Limitations & Technical Debt

- **Test sources are outside the `tsc` graph.** `tsconfig.json` references
  only `packages/*`, so `tests/**/*.ts` (including the new renderer test) is
  not statically typechecked. This matches pre-existing repo practice but
  means the strict-TS guarantee does not yet cover the P3.1-dependent test
  file. Recommended: add a test tsconfig plus a `.d.mts` for the harness
  before P3.1 code lands. (Reviewer concern #9, non-blocking.)
- **Slow failure on a broken bundle.** If the browser bundle fails to load,
  the harness waits up to 120 s for the readiness marker instead of failing
  fast. Behaviour is still fail-closed, only slow. (Reviewer concern #10.)
- **Default evidence is a software rasterizer.** GPU-specific behaviour
  remains `NOT YET APPLICABLE` in CPU-only environments and must be verified
  explicitly.
- No pixel-bearing fixtures exist yet; P3.0 fixed only the policy. This is
  intentional (P3.2).
- Redundant but harmless: `npm test` and `npm run test:renderer` both run the
  renderer suite.

## 8. Exact Next Recommended Task

Proceed to **P3.1 — Narrow Cornerstone adapter lifecycle**: initialization
against an injected runtime host, typed errors and clean teardown inside
`@nuclear/medical-engine`, with real harness starts/stops twice and explicit
fail-closed behaviour when WebGL/initialization is unavailable. Before that
code lands, consider the test-tsconfig debt above. Do not add
`ViewportSurface`, UI or export composition in P3.1.
