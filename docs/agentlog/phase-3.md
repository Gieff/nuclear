# Phase 3 — Headless Medical Engine, Residency & RenderTarget

Status: **IN PROGRESS** — P3.0–P3.1.1 accepted (P3.1 closed via corrective
P3.1.1); P3.2–P3.6 not started. Commit baseline: P3.0 `04bdbaa`, P3.1
`ab0f69b`, P3.1.1 corrective commit recorded below.
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

---

# Handover Report — P3.1: Narrow Cornerstone Adapter Lifecycle

## 1. What Was Implemented

P3.1 added the UI-agnostic Cornerstone adapter lifecycle to
`@nuclear/medical-engine`, behind an injected runtime host, with typed
fail-closed errors and clean, observable teardown.

- **Injected runtime host port** (`src/renderer/host.ts`): the host owns DOM
  container creation/removal and the WebGL 2 probe. The adapter never reaches
  for `document` or a browser window. `RendererCapabilities` is a
  NuClear-owned serializable mirror, mapped field-by-field from
  `detectRenderingCapabilities()` (no foreign-object spread).
- **Typed, actionable errors** (`src/renderer/errors.ts`):
  `RendererUnavailableError` / `RENDERER_UNAVAILABLE`,
  `RendererInitializationError` / `RENDERER_INITIALIZATION_FAILED`,
  `RendererLifecycleError` / `RENDERER_LIFECYCLE_VIOLATION`. Each message
  states the failure and the remediation.
- **Adapter lifecycle** (`src/renderer/adapter.ts`,
  `CornerstoneRendererAdapter`): `static start(host, options?)` runs a
  fail-closed sequence — WebGL 2 probe **before** any init; engine-id-in-use
  guard; `init()` + `isCornerstoneInitialized()`; host container creation;
  `RenderingEngine` + `enableElement(STACK)`. Any failure throws a typed error
  after best-effort release, leaving no registered engine behind. `stop()`
  destroys the engine and removes the container; `stop()` is one-shot.
- **Renderer barrel** (`src/renderer/index.ts`) is deliberately **not**
  re-exported from `src/index.ts`, so Node consumers of the package barrel
  never load a browser-only renderer.
- **Harness made pluggable**: `tests/rendering/fixtures/renderer-harness.mjs`
  gained `options.entryPath` with per-entry memoized bundling; the P3.0 probe
  remains the default.

**Teardown rationale:** `stop()` deliberately does **not** call
`resetInitialization()`. Cornerstone initialization is process-global and
multiple engines may coexist (Phase 4 surfaces), so resetting it on one
engine's teardown would be incorrect. `destroy()` releases that engine's
physical resources; the harness proves the registry is clean.

## 2. Files Changed / Created

Created:
- `packages/medical-engine/src/renderer/host.ts` (49 lines)
- `packages/medical-engine/src/renderer/errors.ts` (63 lines)
- `packages/medical-engine/src/renderer/adapter.ts` (220 lines)
- `packages/medical-engine/src/renderer/index.ts` (12 lines)
- `tests/rendering/fixtures/adapter-entry.ts` (254 lines — browser entry)
- `tests/rendering/adapter-lifecycle.test.ts` (194 lines — node:test)

Modified:
- `tests/rendering/fixtures/renderer-harness.mjs` — pluggable `entryPath`
  (per-entry memoized bundle); default entry unchanged.

Unchanged: `packages/medical-engine/src/index.ts` (verified), all other
packages, `package.json`, `package-lock.json`, `.gitignore`, the plans,
`CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- The runtime host is the **only** DOM gateway; the adapter's public state is
  serializable and host-independent.
- The P2.5 source-integrity gate scans **all** `packages/medical-engine/src`
  for `Math.` and for lowercase `enum `/`namespace ` declarations. The new
  renderer sources contain none, so the adapter computes no arithmetic and
  uses string unions / `as const` objects instead of enums.
- `enableElement` requires an attached non-zero `HTMLDivElement`; the host
  supplies it. Viewport **content** binding (images/volumes) is P3.2, not
  P3.1 — the STACK viewport here is lifecycle plumbing only.
- Multiple engines may coexist, so per-engine teardown must not reset global
  Cornerstone initialization.

## 4. Tests Added & Executed

Added: `tests/rendering/adapter-lifecycle.test.ts` (5 tests, real harness).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean |
| `npx tsc -b --force` | clean (genuine full rebuild) |
| `npm run build` | clean |
| `npm test` | **60 pass / 0 fail** (55 prior + 5 adapter) |
| `npm run test:renderer` | **7 pass / 0 fail** (5 P3.1 + 2 P3.0) |
| `npm run test:python` | **166 passed** |
| `npm run typecheck:python` | clean over 43 source files |

Positive evidence (real SwiftShader WebGL 2): start → `state:'started'`,
`registered:true`, `initialized:true`, `capabilities.webgl2:true`,
`maxTextureSize:8192`; stop → `registeredAfter:false`, `state:'idle'`;
restart → registered; stop → unregistered; `pageErrors`/`consoleErrors`
empty.

Fail-closed negatives: WebGL disabled →
`RendererUnavailableError`/`RENDERER_UNAVAILABLE`; failing container →
`RendererInitializationError`/`RENDERER_INITIALIZATION_FAILED` with
`registeredAfter:false` (no leak); double start and double stop →
`RendererLifecycleError`/`RENDERER_LIFECYCLE_VIOLATION`.

## 5. Documentation, Agentlog & ADR Status

- No new ADR required: P3.1 implements the runtime-host/harness decisions
  already recorded in ADR-003.
- This report satisfies the AgentLog Gate for P3.1.
- `CHANGELOG.md` untouched.
- Reviewer verdict: **PASS** (no blocking findings). QA verdict: **PASS**
  (all executable gates PASS; AgentLog row NOT YET APPLICABLE at QA time).

## 6. Project Model Impact

- None. No `.ncp` schema, shared contract, residency vocabulary or fixture
  semantics changed. The only new public surface is the in-package renderer
  barrel, which is intentionally excluded from the package barrel and has no
  cross-package consumer yet.

## 7. Known Limitations & Technical Debt

- **`stop()` sets `idle` before `destroy()`** (`adapter.ts`). If `destroy()`
  throws, the caller gets a raw error, the engine may remain registered and
  the container may not be removed, while the adapter reports `idle`. Loud,
  not silent (a re-start fails closed on the in-use guard), and non-blocking
  for P3.1 — but the reviewer requires hardening **before P3.4**: wrap
  destroy/removal failures in `RendererLifecycleError` with cause +
  remediation, clean the container in `finally`, and add a reproducible test.
- **Test sources remain outside the `tsc` graph** (inherited P3.0 debt). The
  new `adapter-entry.ts`/`adapter-lifecycle.test.ts` are not statically
  typechecked. Carry forward.
- **`stop()` tolerates a vanished engine** via optional chaining; acceptable
  now, worth an explicit assertion when P3.4 hardens teardown.
- **All renderer evidence is the software backend** (SwiftShader). Hardware
  GPU behaviour remains `NOT YET APPLICABLE` until an explicit hardware run
  is required and recorded.

## 8. Exact Next Recommended Task

Proceed to **P3.2 — Explicit series-to-volume loading from an accepted
`ImagingAsset` and Phase 2 evidence**: commit minimal, programmatically
reproducible pixel-bearing CT/PT fixtures under `tests/` (declared pixels,
dimensions, modality, geometry and expected worker evidence), load them
through Cornerstone, and fail closed on wrong locator, unsupported
classification, `missing`/`mismatch` availability and geometry disagreement.
Do not add residency (P3.3), state application (P3.4), `RenderTarget` (P3.5),
UI or view-engine work in P3.2.

---

# Handover Report — P3.1.1: Teardown Hardening (corrective)

## 1. What Was Implemented

The user rejected P3.1 closure: `CornerstoneRendererAdapter.stop()` reported
`idle` after `this.#state = 'idle'` even if `destroy()` or
`removeEngineContainer()` threw, so physical state (a registered engine and/or
a live container) could be retained while the adapter claimed a clean stop.
That violated P3.1's own declared properties (typed fail-closed errors, clean
teardown). `ab0f69b` remains the P3.1 baseline; this slice is a focused
corrective.

- **Independent teardown attempts.** `stop()` now attempts engine destruction
  and container removal independently; a failure in one never prevents the
  other.
- **Container cleanup in `finally`.** `host.removeEngineContainer()` always
  runs, even when `destroy()` throws.
- **Typed fail-closed error with cause and remediation.** Any incomplete
  teardown throws `RendererLifecycleError`
  (`RENDERER_LIFECYCLE_VIOLATION`) whose message names the failed
  operation(s) and instructs the caller to resolve the failure and call
  `stop()` again.
- **Truthful state.** `RendererAdapterState` is now
  `'idle' | 'started' | 'teardown-failed'`. `idle` is set only when no failure
  occurred **and** `getRenderingEngine(engineId) === undefined`. Otherwise the
  adapter enters the retryable `teardown-failed` state before throwing, so it
  can never expose `idle` while an engine remains registered.
- **Retry semantics.** `stop()` is retryable from `'teardown-failed'`, so a
  transient renderer/host failure self-heals; `stop()` from `'idle'` still
  throws as an invalid transition.
- **Structured failure record.** `RendererTeardownOperation`
  (`'engine-destroy' | 'container-removal'`) and `RendererTeardownFailure`
  are exported, and `RendererLifecycleError.failures` carries them (with
  `cause` = first failure).

## 2. Files Changed / Created

Modified:
- `packages/medical-engine/src/renderer/adapter.ts` (264 lines — hardened
  `stop()`)
- `packages/medical-engine/src/renderer/errors.ts` (83 lines — teardown
  failure types + `RendererLifecycleError.failures`)
- `packages/medical-engine/src/renderer/host.ts` (55 lines — adds the
  `'teardown-failed'` state)
- `tests/rendering/fixtures/adapter-entry.ts` (272 lines — failure-injection
  probe methods, enriched stop result)

Created:
- `tests/rendering/fixtures/adapter-host.ts` (93 lines — browser host +
  destroy/removal failure injection, extracted to respect the 300-line limit)
- `tests/rendering/adapter-teardown.test.ts` (166 lines — 3 real-harness
  tests)

Unchanged: `packages/medical-engine/src/index.ts` (renderer barrel still not
re-exported), all other packages, `package.json`, `package-lock.json`,
`.gitignore`, ADR-003, the plans, `CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- `'teardown-failed'` is a truthful, retryable state rather than a silent
  no-op; partial cleanup must be observable by the caller.
- `resetInitialization()` remains deliberately excluded from per-engine
  teardown (process-global; multiple engines may coexist).
- Failure injection in tests narrows the registered engine with a structural
  `EngineDestructible` interface (no `any`); it is test infrastructure only
  and never reachable from product code.
- The P2.5 source-integrity constraint still holds: no `Math.`, no
  `enum`/`namespace` declarations anywhere under `packages/medical-engine/src`.

## 4. Tests Added & Executed

Added: `tests/rendering/adapter-teardown.test.ts` (3 tests, real WebGL 2
harness).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean |
| `npx tsc -b --force` | clean |
| `npm run build` | clean |
| `npm test` | **63 pass / 0 fail** (60 prior + 3 new) |
| `npm run test:renderer` | **10 pass / 0 fail** (3 P3.1.1 + 5 P3.1 + 2 P3.0) |
| `npm run test:python` | **166 passed** |
| `npm run typecheck:python` | clean over 43 source files |

Corrective evidence: permanent `destroy()` failure → `teardown-failed`, never
`idle`, engine still registered, `failures === ['engine-destroy']`; throwing
`removeEngineContainer()` → `teardown-failed`, engine unregistered
(`registeredAfter:false`, proving destroy was still attempted),
`failures` includes `'container-removal'`; one-shot `destroy()` failure then
retry → second `stop()` reaches `idle` with the engine unregistered.

## 5. Documentation, Agentlog & ADR Status

- No new ADR: this enforces the teardown/typed-error properties already
  declared for P3.1 and recorded in ADR-003.
- This report satisfies the AgentLog Gate for P3.1.1.
- `CHANGELOG.md` untouched.
- Reviewer verdict: **PASS**, original defect fully fixed. QA verdict: **PASS**
  on every executable gate (AgentLog row NOT YET APPLICABLE at QA time).

## 6. Project Model Impact

- None. No `.ncp` schema, shared contract, residency vocabulary or fixture
  semantics changed. The adapter's public state vocabulary gained the
  `'teardown-failed'` member, which is in-package and has no cross-package
  consumer yet.

## 7. Known Limitations & Technical Debt

- `cause` carries only the first failure's cause; the full set is available
  through the typed `failures` array (non-blocking, by design).
- Test sources remain outside the `tsc` graph (inherited debt).
- All renderer evidence is the software backend (SwiftShader); hardware GPU
  remains `NOT YET APPLICABLE`.
- `opencode-rag.json` is modified in the working tree by RAG tooling; it is
  **not** part of this slice and was intentionally excluded from the commit.

## 8. Exact Next Recommended Task

Proceed to **P3.2 — Explicit series-to-volume loading from an accepted
`ImagingAsset` and Phase 2 evidence**, with committed programmatically
reproducible pixel-bearing CT/PT fixtures. Keep the P3.1.1 retryable
`'teardown-failed'` semantics when P3.2/P3.3 add real resource teardown. Do not
add residency, state application, `RenderTarget`, UI or view-engine work.
