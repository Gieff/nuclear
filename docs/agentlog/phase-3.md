# Phase 3 — Headless Medical Engine, Residency & RenderTarget

Status: **IN PROGRESS** — P3.0–P3.2.1 accepted (P3.1 closed via corrective
P3.1.1, P3.2 closed via corrective P3.2.1); P3.3 closed (P3.3-A `16c40b4`,
P3.3-B `3fbc011`, P3.3.1 corrective `9ede6d7`, conclusive P3.3-C review/QA
**PASS**); P3.4-A accepted, P3.4-A.1 accepted (corrective radiometry hardening
under ADR-005), P3.4-A.2 accepted (ADR-006 per-layer fusion `MedicalViewState`
contract), P3.4-A.3 accepted (corrective single-source PET overlay opacity) and
P3.4-A.3bis accepted (representability precision); P3.4-B in progress —
P3.4-B.1 accepted (ADR-007 DICOM palette catalog), P3.4-B.1.1 accepted
(canonical colormap id, whole-LUT digest, registration dedupe), P3.4-B.2.1
accepted (pure `MedicalViewState` → Cornerstone application compiler) and
P3.4-B.2.1.1 accepted (per-asset PET binding map); P3.4-B.2.2–P3.6 not started.
Commit baseline: P3.0 `04bdbaa`, P3.1 `ab0f69b`, P3.1.1 `e9a9f26`,
P3.2 `0cec49e`; P3.2.1, P3.3-A, P3.3-B and P3.3.1 commits recorded below.
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

---

# Handover Report — P3.2: Explicit Series-to-Volume Loading

## 1. What Was Implemented

P3.2 delivers the first real volume load into Cornerstone3D from an accepted
`ImagingAsset` plus Phase 2 worker evidence, via a **fixture-only pixel
ingestion capability** (ADR-004). It is explicitly not generic real-source
pixel ingestion.

- **Pure, fail-closed ingestion planner** (`src/renderer/volume.ts`,
  `volume-types.ts`, `volume-errors.ts`): maps `{ asset, availability,
  classification, WorkerGeometryResult, pixel payload }` to a Cornerstone
  volume-construction plan. Typed `VolumeIngestionError` with six codes:
  `VOLUME_SOURCE_UNAVAILABLE`, `VOLUME_SOURCE_MISMATCH`,
  `VOLUME_UNSUPPORTED_CLASSIFICATION`, `VOLUME_EVIDENCE_UNAVAILABLE`,
  `VOLUME_GEOMETRY_DISAGREEMENT`, `VOLUME_PAYLOAD_INVALID`.
- **Adapter volume capability** (`adapter.ts`): `loadVolume(plan)` uses
  `volumeLoader.createLocalVolume` with worker geometry; `releaseVolume(id)`
  uses `cache.removeVolumeLoadObject`. Loading before `started` and duplicate
  `volumeId` loads fail closed.
- **Worker geometry is copied verbatim.** `dimensions`, `spacing`, `origin`
  are the worker's; the 9-element Cornerstone direction is
  `[...assetGeometry.direction(6), ...sliceNormal(3)]` with no cross product,
  normalization or sign flip. Layout verified against
  `@kitware/vtk.js/Common/DataModel/ImageData.computeTransforms` and
  `@cornerstonejs/core/generateVolumePropsFromImageIds`.
- **Committed pixel-bearing CT and PT fixtures** under
  `tests/rendering/fixtures/volumes/{ct-axial,pt-axial}/`: 3 pixel-bearing
  DICOM instances each (4×4×3), plus a self-describing `pixels.json`
  (encoding, byteOrder, dtype, signedness, SamplesPerPixel, bit layout,
  `scalarDataDomain`, rescale, base64 LE values), `fixture.json` and the real
  `expected-geometry.json`.
- **Reproducible test-only generator + tests**
  (`python/tests/synthetic_pixel_volume.py`,
  `test_rendering_volume_fixtures.py`): byte-identical regeneration, payload ==
  DICOM pixels × declared rescale (with a wrong-rescale negative control), and
  real `nuclear.dicom.geometry`/`inspect` results equal to the committed
  evidence.
- **P3.4 bridge:** the PT fixture declares `scalarDataDomain: "rescaled-bqml"`
  and the tests prove Cornerstone receives exactly the committed Bq/mL scalars
  (sample 0 = 100000, sample 47 = 147000). No SUV conversion is performed in
  P3.2.

## 2. Files Changed / Created

Created (product):
- `packages/medical-engine/src/renderer/volume.ts` (244 lines)
- `packages/medical-engine/src/renderer/volume-types.ts` (157 lines)
- `packages/medical-engine/src/renderer/volume-errors.ts` (45 lines)

Modified (product):
- `packages/medical-engine/src/renderer/adapter.ts` (300 lines — added
  `loadVolume`/`releaseVolume`/`#assertStarted`; the P3.1.1 teardown code is
  unchanged, only comments were condensed)
- `packages/medical-engine/src/renderer/index.ts` (re-export `./volume.js`)

Created (tests/fixtures):
- `tests/rendering/volume-ingestion.test.ts` (221), `volume-load.test.ts` (240)
- `tests/rendering/fixtures/{volume-entry.ts (205), volume-fixture.ts (167),
  volume-request.ts (182)}`
- `tests/rendering/fixtures/volumes/{ct-axial,pt-axial}/` — 6 `.dcm`,
  2 `pixels.json`, 2 `fixture.json`, 2 `expected-geometry.json`
- `python/tests/synthetic_pixel_volume.py` (300),
  `python/tests/test_rendering_volume_fixtures.py` (261)

Modified (repo):
- `.gitignore` — narrow negation
  `!tests/rendering/fixtures/volumes/**/instances/*.dcm` so the committed
  pixel-bearing fixtures are visible despite the global `*.dcm` ignore.

Created (docs):
- `docs/decisions/ADR-004-fixture-only-pixel-ingestion.md`

Unchanged: `packages/medical-engine/src/index.ts` (renderer/volume still not
reachable from the Node barrel), all other packages, `package.json`,
`package-lock.json`, the plans, `CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- **No second geometry authority.** `@cornerstonejs/dicom-image-loader` and
  all TS DICOM parsing are refused; `createLocalVolume` receives geometry from
  the worker. The Mat3 layout was read from Cornerstone/vtk source, not
  guessed.
- **Fixture-only pixel authority (ADR-004).** The committed descriptor is the
  pixel-format authority for this slice; the payload is a validated test
  artifact, not a runtime `.ncp` representation and not a clinical authority.
- **Declaration without inference.** `dtype`, byte order, signedness,
  `SamplesPerPixel`, bit layout, `scalarDataDomain` and rescale are declared;
  TS maps them verbatim. `PixelSpacing` is emitted in DICOM order
  `[rowSpacing, columnSpacing]`.
- **No invented presentation defaults:** `voiLut: []`, `VOILUTFunction:
  'LINEAR'`; no window/level is chosen.
- **`volumeId = nuclear-volume:<assetId>:<geometricDigest>`** — deterministic
  and provenance-bound.

## 4. Tests Added & Executed

Added: 12 pure ingestion tests + 4 real-harness volume tests + 12 Python
fixture tests.

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean |
| `npx tsc -b --force` | clean |
| `npm run build` | clean |
| `npm test` | **79 pass / 0 fail** (63 prior + 16 new) |
| `npm run test:renderer` | **26 pass / 0 fail** (10 prior + 16 new) |
| `npm run test:python` | **178 passed** (166 prior + 12 new) |
| `npm run typecheck:python` | clean over 45 source files |

Positive evidence (real SwiftShader WebGL 2): CT and PT fixtures load; the
Cornerstone volume reports exactly the worker `dimensions`/`spacing`/`origin`/
`direction`; the worker→world transform for slice 1 matches
`slicePositionsLpsMm[1]` within the named tolerance
`WORKER_WORLD_TOLERANCE_MM = 1e-6` (proving normalized slice order); scalar
length 48; PT scalars equal the committed Bq/mL payload exactly.

Fail-closed negatives (each a distinct typed code): `missing`/`offline-cached`
→ sourceUnavailable; `mismatch` → sourceMismatch; unsupported classification,
modality or kind → unsupportedClassification; `rejected`/`unavailable`
evidence → evidenceUnavailable; series/frame/modality/deep-geometry
disagreement → geometryDisagreement; payload dimension/voxel-count mismatch →
payloadInvalid; duplicate `volumeId` load and unknown release id → fail
closed.

## 5. Documentation, Agentlog & ADR Status

- ADR-004 records the fixture-only ingestion decision and the four user-imposed
  constraints (test-only payload, declaration without inference, exact-geometry
  proof, explicit hydration-boundary debt).
- This report satisfies the AgentLog Gate for P3.2.
- `CHANGELOG.md` untouched.
- Reviewer verdict: **PASS** (no blocking findings). QA verdict: **PASS** on
  every applicable gate (AgentLog row NOT YET APPLICABLE at QA time).

## 6. Project Model Impact

- None. No `.ncp` schema, shared contract or fixture-manifest semantics
  changed; the renderer/volume modules remain unreachable from the package
  barrel. The committed `tests/rendering/fixtures/volumes/**` payload is
  test-only and must never be persisted as project state.

## 7. Known Limitations & Technical Debt

- **Generic pixel ingestion debt (explicit, not hidden behind
  `SourceLocator`).** Real sources still have no verifiable pixel-transport
  boundary: the pixel-format authority here is the committed fixture
  descriptor. A separate, declared hydration contract (pixel format + voxel
  transport) is required before real-source live rendering, with its own ADR.
- **Axial-identity fixtures cannot disambiguate Mat3 element order** at the
  world-geometry level (an identity transpose is still identity). Mitigated
  by an array-level `deepEqual` against the assembled worker triplets and a
  pure non-identity unit test; a non-identity browser volume load is future
  work.
- **`loadVolume` propagates a raw `createLocalVolume` allocation failure**
  (e.g. cache exhaustion) rather than a typed `VolumeIngestionError`; still
  fail-closed, but the plan's "volume-load error" negative is untested. P3.3
  budget accounting will revisit this.
- **Shared error codes:** `unsupportedClassification` covers worker
  classification and asset modality/kind; `payloadInvalid` is reused for
  duplicate-load and unknown-release cache states. Messages/tests
  discriminate; a dedicated cache-state code belongs with P3.3 residency.
- **Duplicate-load guard is load-bearing:** Cornerstone 5.10.7
  `createLocalVolume` silently returns a cached volume for a duplicate id; the
  adapter's guard is what makes the duplicate case fail closed.
- **Declared dtype range is wider than the adapter path:** `volume-types.ts`
  and the payload reader accept int8…float64, but Cornerstone's
  `createLocalVolume` byteLength switch handles 8/16-bit ints and Float32 only;
  P3.2 fixtures use int16/float32.
- **`adapter.ts` is exactly 300 lines** and `synthetic_pixel_volume.py` is
  exactly 300 — at the Rule 02 ceiling; further growth requires splitting.
- Test-infra nit: `volume-request.ts` hardcodes asset `rescaleSlope:1`,
  `rescaleIntercept:0` though the browser builder honours the declared rescale
  (CT intercept −1024). Cosmetic; `ImagingAsset.metadata` is not consumed by
  the P3.2 planner.

## 8. Exact Next Recommended Task

Proceed to **P3.3 — `ResourceManager` residency state machine, demand
reconciliation, budget accounting, eviction and on-demand reload**, accepting
`ResourceDemand` without importing `view-engine`, proving shared-resource
accounting, deterministic eviction, honest unknown VRAM, and reload without
semantic asset deletion. Reuse the P3.2 `loadVolume`/`releaseVolume` primitives
and revisit the raw allocation-failure and shared-code debt above. Do not add
state application (P3.4), `RenderTarget` (P3.5), UI or view-engine work.

---

# Handover Report — P3.2.1: Payload Contract Hardening (corrective)

## 1. What Was Implemented

The user rejected P3.2 closure because the scalar contract admitted
`int32 | uint32 | float64`, for which Cornerstone 5.10.7's
`volumeLoader.createLocalVolume` computes no `byteLength`
(`node_modules/@cornerstonejs/core/dist/esm/loaders/volumeLoader.js` lines
~156-176 handle only `Uint8Array|Int8Array`, `Uint16Array|Int16Array` and
`Float32Array`). Such a payload passed the planner and reached the cache with an
undefined byte length, producing a raw error instead of a typed refusal.
`0cec49e` remains the P3.2 baseline; this is an atomic targeted correction.

- **Scalar contract restricted** to the five types Cornerstone actually sizes:
  `VolumeScalarArray = Int8Array | Uint8Array | Int16Array | Uint16Array |
  Float32Array`; `VolumeScalarDataType = 'int8' | 'uint8' | 'int16' | 'uint16' |
  'float32'`. A runtime membership guard backstops the union against an
  untyped/cast caller.
- **Pure payload validation** (`volume-validation.ts`) runs before any cache
  interaction and refuses with `VOLUME_PAYLOAD_INVALID`: dtype ↔ actual typed
  array constructor, signedness coherence, bit layout (`bitsAllocated` width,
  `1 ≤ bitsStored ≤ bitsAllocated`, `highBit === bitsStored - 1`),
  `samplesPerPixel === 1`, non-empty `photometricInterpretation`, three positive
  integer dimensions equal to the worker grid, voxel count, and non-finite
  `float32` values.
- **Declared-domain ↔ `valueSemantics` coherence** (fixture-only) refuses with
  the new `VOLUME_SCALAR_SEMANTICS_DISAGREEMENT`: `rescaled-hu` → `hounsfield`
  (`HU`), `rescaled-bqml` → `activity-concentration` (`Bq/mL`),
  `stored-values` → `raw-counts | generic-intensity`. No conversion is
  performed.
- **Typed construction failure** (`volume-binding.ts`): a `createLocalVolume`
  failure becomes `VOLUME_CONSTRUCTION_FAILED` preserving the original cause,
  after removing any residual cache entry (including a volume that registered
  before throwing). The fail-closed duplicate-`volumeId` pre-check and the
  unknown-id release pre-check are retained.
- **Decomposition**: `adapter.ts` shrank 300 → 274 lines; the browser-only
  cache binding moved to `volume-binding.ts` (not re-exported from
  `renderer/index.ts`) and validation to `volume-validation.ts`.

## 2. Files Changed / Created

Modified:
- `packages/medical-engine/src/renderer/adapter.ts` (274 lines)
- `packages/medical-engine/src/renderer/volume.ts` (237)
- `packages/medical-engine/src/renderer/volume-types.ts` (153)
- `packages/medical-engine/src/renderer/volume-errors.ts` (47)
- `tests/rendering/fixtures/volume-fixture.ts`, `volume-request.ts`,
  `volume-entry.ts`
- `docs/decisions/ADR-004-fixture-only-pixel-ingestion.md` (P3.2.1 addendum)

Created:
- `packages/medical-engine/src/renderer/volume-binding.ts` (95)
- `packages/medical-engine/src/renderer/volume-validation.ts` (249)
- `tests/rendering/volume-payload-validation.test.ts` (191)
- `tests/rendering/volume-construction.test.ts` (103)

Unchanged: `packages/medical-engine/src/index.ts`, `renderer/index.ts`, all
`fixtures/volumes/**` declared data (no fixture geometry/semantics change), the
worker, `CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- **Bit-layout interpretation:** `BitsAllocated`/`BitsStored`/`HighBit` describe
  the *stored source encoding* while `dtype` describes the *scalar array*. For
  `stored-values` they must agree; for `rescaled-hu`/`rescaled-bqml` a rescaled
  `float32` may declare the narrower source layout (committed PT is 16-bit
  source), still bounded to 8/16/32 with coherent stored/high bits. Recorded in
  the ADR-004 addendum.
- **Test seam:** esbuild compiles the `@cornerstonejs/core` namespace with
  non-configurable getters, so the harness cannot reassign
  `volumeLoader.createLocalVolume`. `volume-binding.ts` exposes a single
  NuClear-owned mutable holder as the tested seam; it is internal (not in the
  public barrel) and product code never mutates it.
- No DICOM parsing, no `@cornerstonejs/dicom-image-loader`, no worker change,
  no clinical conversion.

## 4. Tests Added & Executed

Added: `volume-payload-validation.test.ts` (9 tests, pure) and
`volume-construction.test.ts` (2 tests, real harness injection).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean |
| `npx tsc -b --force` | clean |
| `npm run build` | clean |
| `npm test` | **90 pass / 0 fail** (79 prior + 11 new) |
| `npm run test:renderer` | **37 pass / 0 fail** (26 prior + 11 new) |
| `npm run test:python` | **178 passed** |
| `npm run typecheck:python` | clean over 45 source files |

Corrective evidence: an unsupported typed array reaching the planner via a cast,
a dtype↔constructor mismatch, signedness mismatch, each bit-layout violation
(including the rescaled-float32 source-width escape at 12 bits, added to close
review NB-1), `samplesPerPixel !== 1`, invalid dimensions, non-finite `float32`
(NaN/Infinity) and domain↔semantics incoherence are all refused typed; a
throwing `createLocalVolume` yields `VOLUME_CONSTRUCTION_FAILED` with the cause
preserved and no residual cache entry, including the register-then-throw case.

## 5. Documentation, Agentlog & ADR Status

- ADR-004 gained a P3.2.1 addendum recording the five-type restriction, the
  validation set and the bit-layout interpretation.
- This report satisfies the AgentLog Gate for P3.2.1.
- `CHANGELOG.md` untouched.
- Reviewer verdict: **CONCERNS**, all non-blocking; the one recommended gap
  (missing negative for the rescaled-float32 source-width guard, NB-1) was
  closed in this slice before commit. QA verdict: **ACCEPTED** on all gates.

## 6. Project Model Impact

- None. No `.ncp` schema, shared contract or fixture data changed. The scalar
  contract narrowed within the renderer subsystem; `packages/medical-engine/src/index.ts`
  and `renderer/index.ts` are unchanged.

## 7. Known Limitations & Technical Debt

- **Generic pixel ingestion debt remains** (ADR-004): real-source live
  rendering still needs a separate, verifiable hydration boundary (pixel format
  + voxel transport); it must not be hidden behind `SourceLocator`.
- `declaredConstructor` returns `Function | undefined` (review NB-3, cosmetic);
  no `any`, but a tighter constructor type would be tidier.
- The rescaled-float32 bit-layout branch is deliberately conservative (a
  representable narrower integer element is still refused for rescaled
  domains); fail-closed by design.
- Duplicate-`volumeId` load and unknown-id release still reuse
  `VOLUME_PAYLOAD_INVALID` rather than a dedicated cache-state code; a naming
  improvement belongs with P3.3 residency.
- All renderer evidence remains the software backend (SwiftShader); hardware
  GPU stays `NOT YET APPLICABLE`.

## 8. Exact Next Recommended Task

Proceed to **P3.3 — `ResourceManager` residency state machine, demand
reconciliation, budget accounting, eviction and on-demand reload**, reusing the
P3.2.1 `bindVolume`/`releaseBoundVolume` primitives and resolving the
cache-state code naming debt above. Do not add state application (P3.4),
`RenderTarget` (P3.5), UI or view-engine work.

---

# Handover Report — P3.3-A: Pure `ResourceManager` Residency Core

## 1. What Was Implemented

P3.3 was executed as the addendum's first bounded slice, **P3.3-A: pure
resource-residency contract/state machine**. It is Node-only: `src/residency/**`
imports no `@cornerstonejs/core`, no DOM, and no `view-engine`.

- **Lease-based shared resources (addendum D1).** Physical identity is the
  validated plan's `volumeId`; an opaque caller-owned `leaseId` replaces any
  slot/cell identity. One volume can serve several consumers at once (a fusion
  retains CT and PET as two independent resources, never an implicit composite).
- **Safe transition ordering.** `reconcile(next)` validates all retentions,
  then `retain(new) → release(removed) → settle()`, so a reused volume never
  passes through a transient zero-lease window. `retain` never touches the
  backend; only `settle()` acquires.
- **Selective eviction only.** The backend port exposes a single-volume
  `release`; there is deliberately no purge-all method and no `cache.purgeCache()`.
  Eviction applies only to zero-lease physical resources, ordered by declared
  priority (lowest first, deterministic registration-sequence tie-break).
- **Semantic lifetime ≠ residency.** Eviction frees RAM/VRAM only and preserves
  `assetId`, `geometricDigest` and the validated plan, so the same `volumeId`
  can be reloaded on demand.
- **Honest budget accounting.** Byte sizes come only from
  `VolumeResidencyBackend.measure`; a missing axis is reported as
  `measurement: 'unavailable'`, never a guessed VRAM formula. Insufficient
  budget returns a typed `budget-exhausted` settlement **before** acquisition,
  so a false `gpu-ready`/`gpu-resident` is impossible. Loader, release and
  enumeration failures become typed dispositions (`loader-failed`,
  `eviction-failed`, `enumeration-failed`) that preserve identity and are never
  reported as success.
- **Fail-closed preconditions.** `missing`, `mismatch` and `offline-cached`
  availability, lease↔asset mismatch, and invalid demand tiers (`loading`,
  `evicted`, empty) are refused with typed `ResidencyError` before any mutation.
- **Integration fix required by the gate.** `npm test` was unscoped
  (`node --test`) and therefore discovered the gitignored, non-committed local
  `oracle/` MedCanvas mirror (`oracle/tests/unit/*.test.js`), which imports
  absent `oracle/**/dist` files and failed 8 tests. The script is now scoped to
  `node --test "tests/**/*.test.ts"`, matching `test:renderer`'s convention, so
  the NuClear gate is deterministic and cannot be contaminated by a non-evidence
  mirror. All committed suites live under `tests/`.

## 2. Files Changed / Created

Created (product, Node-safe):
- `packages/medical-engine/src/residency/residency-types.ts` (149 lines)
- `packages/medical-engine/src/residency/residency-errors.ts` (39)
- `packages/medical-engine/src/residency/residency-tier.ts` (81)
- `packages/medical-engine/src/residency/residency-budget.ts` (289)
- `packages/medical-engine/src/residency/resource-manager.ts` (297)
- `packages/medical-engine/src/residency/index.ts` (12)

Modified (product):
- `packages/medical-engine/src/index.ts` — added `export * from './residency/index.js';`
  (the Node-safe residency core is now part of the package barrel; the
  browser-only `renderer/` barrel remains excluded)

Created (tests):
- `tests/residency/resource-manager.test.ts` (285)
- `tests/residency/fixtures/residency-fixtures.ts` (144)

Modified (repo):
- `package.json` — `"test": "node --test \"tests/**/*.test.ts\""` (was `node --test`)

Unchanged: `src/renderer/**`, all other packages, `shared-types`,
`package-lock.json`, CHANGELOG, the version, the plans.

## 3. Architectural Assumptions Made

- The backend port (`measure`/`acquire`/`release`/`listAcquiredVolumeIds`) is
  the only physical boundary. P3.3-A tests use a deterministic in-memory mock;
  P3.3-B binds the same interface to `bindVolume`/`releaseBoundVolume`.
- Zero-lease resources keep their **last-known** declared priority for eviction
  ordering, giving "lowest declared priority first" a concrete meaning after
  the lease is gone; ties break by registration `sequence`.
- `settle()` eagerly reclaims every zero-lease physical resource on each pass
  (the addendum's `retain → release → evict` ordering); this is intentional
  policy, recorded here so it is not silent.
- A backend `measure` throw is treated as an unknown measurement (never a
  guess); `acquire` throws are `loader-failed`, `release` throws are
  `eviction-failed`, `listAcquiredVolumeIds` throws are `enumeration-failed`.
- No new ADR: this slice implements the boundary already recorded in ADR-003
  (injected host, UI-agnostic public state) and addendum D1/D2.

## 4. Tests Added & Executed

Added: `tests/residency/resource-manager.test.ts` (17 tests, pure Node).

Coverage: idempotent duplicate retain; two leases pin a volume; fusion CT+PET
as separate resources; `reconcile` rebinds without transient eviction or
re-acquire; pending retain protected before `settle`; zero-lease-only eviction
with identity preserved; reload reconstructs the same `volumeId`; declared
priority order and sequence tie-break under budget pressure; insufficient budget
→ `budget-exhausted` with no false GPU residency; loader failure; enumeration
failure; `missing`/`mismatch`/`offline-cached` fail closed; lease↔asset
mismatch; invalid demand tiers; unknown release as a safe no-op; leased
resource never evicted while zero-lease ones exist.

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm run build` | clean (exit 0) |
| `npm test` | **107 pass / 0 fail** (24 suites; 90 prior + 17 new) |
| `npm run test:renderer` | **37 pass / 0 fail** |
| `npm run test:python` | **178 passed** |
| `npm run typecheck:python` | clean over 45 source files |
| P2.5 source integrity | **2/2 pass** — no `Math.`, no `enum`/`namespace` in `src/**` |

No test uses `|| true`. The slice makes no numerical/visual claim; assertions
are exact typed codes and dispositions against the real state machine.

## 5. Documentation, Agentlog & ADR Status

- No new ADR required; the slice implements addendum D1/D2 and ADR-003.
- This report satisfies the AgentLog Gate for P3.3-A.
- `CHANGELOG.md` untouched (release notes are compiled later via
  `/promote-changelog 3`).
- Reviewer verdict: **PASS** — boundary, contract fidelity, eviction/identity,
  budget honesty, fail-closed negatives and P2.5 integrity verified; no
  blocking findings.
- QA verdict: **PASS** on every executable gate (typecheck, Node 107/107,
  renderer 37/37, P2.5 2/2, build, Python 178, mypy 45 files); the only
  not-yet-satisfied row was this AgentLog report, now written. It also
  confirmed `npm test` is deterministic with respect to the local `oracle/`
  directory.

## 6. Project Model Impact

- None. No `.ncp` schema, shared contract, residency vocabulary or fixture
  semantics changed. The new public surface is the Node-safe `residency`
  barrel (no cross-package consumer yet). The `ResidencyError` codes and the
  `VolumeResidencyBackend` port are in-package contracts.

## 7. Known Limitations & Technical Debt

- **Budget axis with no backend measurement is not evaluated** (reviewer
  concern, P3.3-B precondition). `settleResource` skips the budget check when
  the declared axis has no measurement and `projectedUsage` counts measured
  bytes only, so an unmeasured resident volume is invisible to a declared
  budget. Honest (never fabricates), but P3.3-B must either guarantee
  per-volume measurements or emit a typed unevaluated-budget signal.
- **`leaseVolumeConflict` is implemented but has no direct test** (pre-existing
  session decision carried forward; add in P3.3-B).
- **`attemptEviction` release-false + enumeration-confirms-absent branch** marks
  `evicted` without adding to `evictedVolumeIds`; conservative, untested.
- **`settle()` auto-eviction policy** documented above; ensure P3.3-B does not
  accidentally thrash.
- Test sources remain outside the `tsc` graph (inherited P3.0 debt);
  `tests/residency` uses the existing `ts-resolve-hook.mjs` pattern.
- No controlled-WebGL residency evidence yet; the mock backend is not GPU
  evidence. This is explicitly P3.3-B.

## 8. Exact Next Recommended Task

Proceed to **P3.3-B — Cornerstone residency backend**: implement
`VolumeResidencyBackend` over the existing `bindVolume`/`releaseBoundVolume`
(and `cache.getVolumes()` enumeration) in `src/renderer/`, expose it through the
adapter/`renderer` barrel only, and add controlled WebGL 2 harness evidence for
load → demand `gpu-ready`/`gpu-resident` → release → evict (no residual
Cornerstone entry) → demand → reload, sharing one real volume between two
consumers, and `missing`/`mismatch`/`offline-cached` producing no live volume.
Resolve the budget-measurement, `leaseVolumeConflict`-test and
release-ambiguous-branch items above. Do not add state application (P3.4),
`RenderTarget` (P3.5), UI or view-engine work.

---

# Handover Report — P3.3-B: Cornerstone Residency Backend

## 1. What Was Implemented

P3.3-B binds the P3.3-A residency port to the real Cornerstone volume cache and
proves the residency lifecycle against a real WebGL 2 harness.

- **Real `VolumeResidencyBackend`** (`src/renderer/volume-residency-backend.ts`,
  browser-only): `measure` reports the decoded scalar array's RAM bytes
  (`plan.scalarData.byteLength`) and leaves `byteSizeVRAM` undefined because
  Cornerstone exposes no VRAM byte count; `acquire` stages a real
  `createLocalVolume` through the committed `volume-binding.ts` and reports
  `gpu-ready` (live 3D-texture residency is P3.4 and is never claimed here);
  `release` is per-volume and returns `false` for absence; enumeration is the
  real `cache.getVolumes()`.
- **Selective, per-volume eviction only.** `releaseBoundVolumeIfPresent` adds
  the missing physical cleanup: Cornerstone 5.10.7 `removeVolumeLoadObject`
  clears the derived slice images' `sharedCacheKey` but leaves
  `<volumeId>_slice_<i>` entries in the image cache, so a same-`volumeId`
  reload would throw `putImageSync: imageId already in cache`. The release now
  also drops **that volume's own** `volume.imageIds` — still strictly
  per-volume, no purge-all.
- **Adapter surface** (`adapter.ts`): `releaseVolumeIfPresent(volumeId)` keeps
  the started-lifecycle guard and delegates. Exported only from
  `renderer/index.ts`, never `src/index.ts`.
- **Closed P3.3-A review findings**:
  - new typed disposition **`budget-unverified`**: a declared budget axis with
    no backend measurement acquires honestly and is reported as unverified,
    never as `resident` or `budget-exhausted`;
  - tests for the previously untested `RESIDENCY_LEASE_VOLUME_CONFLICT` path;
  - test for the release-false + enumeration-confirmed-absent branch.

## 2. Files Changed / Created

Created:
- `packages/medical-engine/src/renderer/volume-residency-backend.ts` (67 lines)
- `tests/rendering/resource-residency.test.ts` (172 lines)
- `tests/rendering/fixtures/residency-entry.ts` (268 lines, browser probe)
- `tests/residency/resource-manager-findings.test.ts` (87 lines — tests 17–19,
  split out of the P3.3-A suite to respect the 300-line limit)

Modified:
- `packages/medical-engine/src/renderer/volume-binding.ts` (125 lines — added
  `releaseBoundVolumeIfPresent`)
- `packages/medical-engine/src/renderer/adapter.ts` (288 lines — added
  `releaseVolumeIfPresent`)
- `packages/medical-engine/src/renderer/index.ts` (+1 export)
- `packages/medical-engine/src/residency/residency-types.ts` (+`budget-unverified`)
- `packages/medical-engine/src/residency/resource-manager.ts` (298 lines)
- `tests/residency/resource-manager.test.ts` (285 lines — back to P3.3-A size)

Unchanged: `src/index.ts` (residency barrel only, never the renderer backend),
`shared-types`, the Python worker, the plans, `CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- **`gpu-ready` is the honest ceiling in P3.3.** A staged local volume is
  cache-resident but not yet a live WebGL 3D texture; `gpu-resident` is only
  observable after a render and is P3.4 work. A demand for `gpu-resident`
  against this backend settles `deferred`, not a false success.
- **RAM measured / VRAM unknown.** No VRAM byte count is fabricated; the
  `gpuBytes` axis is consequently unverifiable with the Cornerstone backend and
  reports `budget-unverified` (the `cpuBytes` axis remains enforceable).
- **Derived-image cleanup is required for evict→reload** and is scoped to the
  released volume's own `imageIds` (verified against the installed 5.10.7
  `_decacheVolume` / `createLocalVolume` / `putImageSync` source).
- No new ADR: this implements the addendum's P3.3-B wiring and ADR-003/004
  boundaries.

## 4. Tests Added & Executed

Added: 3 pure tests (now in `tests/residency/resource-manager-findings.test.ts`)
and 4 real-harness tests (`tests/rendering/resource-residency.test.ts`).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm test` | **114 pass / 0 fail** (26 suites; 107 prior + 7 new) |
| `npm run test:renderer` | **41 pass / 0 fail** (37 prior + 4 new) |
| `npm run build` | clean (exit 0) |
| `npm run test:python` | **178 passed** |
| `npm run typecheck:python` | clean over 45 source files |
| P2.5 source integrity | **2/2 pass** |

Real-harness evidence (SwiftShader WebGL 2, `softwareRasterizer: true`):
1. two leases share one real volume — it stays `gpu-ready` and cached until the
   second release, then `cache.getVolumes()` is empty;
2. evict → reload reconstructs the **same** `volumeId` and re-caches it with no
   residual entry;
3. a fusion retains CT and PET separately; evicting CT leaves PET `gpu-ready`
   and cached;
4. `missing`/`mismatch`/`offline-cached` each refuse
   `RESIDENCY_SOURCE_UNAVAILABLE` and leave the cache empty.

Every harness test asserts empty `pageErrors`/`consoleErrors`. No `|| true`.

## 5. Documentation, Agentlog & ADR Status

- No new ADR required.
- This report satisfies the AgentLog Gate for P3.3-B.
- `CHANGELOG.md` untouched (compiled later via `/promote-changelog 3`).
- Reviewer verdict: code **PASS** on all seven review targets; overall
  **CONCERNS** on two process gates only (this AgentLog entry and the 338-line
  test file). Both are resolved here: this report is written and tests 17–19
  moved to `tests/residency/resource-manager-findings.test.ts` (all files
  ≤300 lines).
- QA verdict: **PASS** on every command gate (typecheck, Node 114/114,
  renderer 41/41, build, Python 178, mypy 45, integrity 2/2), independently
  confirming the real harness and the deterministic scoping w.r.t. `oracle/`;
  the only pending row was this report.

## 6. Project Model Impact

- None. No `.ncp` schema, shared contract, fixture semantics or Python change.
  The new pixel-format/backend types are in-package, and the renderer backend
  is unreachable from the package barrel.

## 7. Known Limitations & Technical Debt

- **Strict `releaseBoundVolume`/`adapter.releaseVolume` asymmetry.** The strict
  P3.2 release still does not drop derived slice images, so a
  `releaseVolume`→`loadVolume` cycle on the same id fails closed with
  `VOLUME_CONSTRUCTION_FAILED` (typed, cause preserved). The residency
  lifecycle uses only the if-present path. P3.2.1 must not be reopened
  (addendum); record as a follow-up for P3.3-C or before any consumer adopts
  `releaseVolume` for lifecycle.
- **`budget-unverified` is per acquisition event.** A later `settle()` on the
  same resource early-returns `resident` without re-checking the still
  unmeasured axis. Honest within each pass; note it if a persistent signal is
  required.
- **`resource-manager.ts` is 298/300 lines**; further additions need a new
  internal module.
- Test sources remain outside the `tsc` graph (inherited P3.0 debt); the probe
  and harness tests execute via esbuild/Node type stripping without static
  typechecking.
- All residency evidence is the software backend; hardware GPU remains
  `NOT YET APPLICABLE`.

## 8. Exact Next Recommended Task

Proceed to **P3.3-C — independent phase review/QA and P3.4 entry conditions**:
confirm no semantic asset is deleted by eviction and that no global purge
exists anywhere, decide the strict-release asymmetry follow-up, and record the
P3.4 preconditions (PET `units`/Bq/mL-vs-g/mL coherence, a declarative
`@nuclear/rendering-presets` surface, and CT/PET/fusion `MedicalViewState`
fixtures with provenance). Do not add state application (P3.4), `RenderTarget`
(P3.5), UI or view-engine work in P3.3-C.

---

# Handover Report — P3.3.1: Lifecycle Disposal & Unified Release (corrective)

## 1. What Was Implemented

The user rejected closing P3.3 after P3.3-A/P3.3-B because two lifecycle
defects remained. `3fbc011` remains the P3.3-B baseline; this is a focused,
atomic corrective.

- **Defect 1 — `ResourceManager.reset()` orphaned physical resources.**
  `reset()` cleared the resource/lease maps without releasing anything, so a
  resident Cornerstone volume became an orphan the manager could no longer
  evict, reload or account for. `reset()` is **removed** and replaced by a
  terminal, fail-closed `dispose()`:
  - it releases every resource still holding a physical tier (`cpu-cached`,
    `gpu-ready`, `gpu-resident`), including resources pinned by a live lease,
    strictly per-volume through the existing `attemptEviction`/`recordEviction`
    path — never a purge-all;
  - on any `eviction-failed`/`enumeration-failed` it throws the new typed
    `RESIDENCY_DISPOSE_INCOMPLETE` (naming the failed volume ids and the retry
    remediation) and **does not clear state**, so the orphan stays visible and
    a retry can finish;
  - on full success it clears resources/leases/sequence, marks the manager
    disposed and returns `{ disposed: true, evictedVolumeIds, settlements }`;
  - it is idempotent, and after disposal `retain`/`reconcile`/`settle`/
    `evictUnreferenced` throw the new typed `RESIDENCY_DISPOSED`.
- **Defect 2 — the strict release path skipped derived-image cleanup.**
  `releaseBoundVolume`/`adapter.releaseVolume` removed only the volume load
  object, so `releaseVolume → loadVolume` on the same `volumeId` failed typed
  (`putImageSync: imageId already in cache`). All three cleanup paths now share
  one private `removeVolumeArtifacts`: the volume load object first, then that
  volume's own `${volumeId}_slice_<i>` images. `releaseBoundVolume` keeps its
  throw-on-absence contract, `releaseBoundVolumeIfPresent` returns `false` for
  absence, and the best-effort residual cleanup delegates too. Still strictly
  per-volume.
- **Decomposition:** the private `settleResource` moved verbatim to
  `residency-settlement.ts` and the disposal pass to `residency-disposal.ts`,
  keeping every source under the 300-line gate.

## 2. Files Changed / Created

Created:
- `packages/medical-engine/src/residency/residency-settlement.ts` (90 lines)
- `packages/medical-engine/src/residency/residency-disposal.ts` (57 lines)
- `tests/rendering/fixtures/residency-plan.ts` (115 lines — shared probe
  types/helpers extracted to keep the browser entry under 300 lines)

Modified:
- `packages/medical-engine/src/residency/resource-manager.ts` (283 lines —
  `reset()` removed, `dispose()` + disposed guard added, `settleResource`
  extracted)
- `packages/medical-engine/src/residency/residency-types.ts` (171 lines —
  `ResidencyDisposalResult`)
- `packages/medical-engine/src/residency/residency-errors.ts` (41 lines —
  `RESIDENCY_DISPOSED`, `RESIDENCY_DISPOSE_INCOMPLETE`)
- `packages/medical-engine/src/renderer/volume-binding.ts` (131 lines —
  unified `removeVolumeArtifacts`)
- `tests/residency/resource-manager-findings.test.ts` (160 lines — tests 20–22)
- `tests/rendering/resource-residency.test.ts` (216 lines — tests 5/6)
- `tests/rendering/fixtures/residency-entry.ts` (235 lines — `strictReload`,
  `disposeAfterSettle` probes; teardown now calls `dispose()`)

Unchanged: `shared-types`, `src/index.ts`, the Python worker, the plans,
`CHANGELOG.md`, the version. `reset()` no longer exists anywhere in `src/`.

## 3. Architectural Assumptions Made

- `dispose()` is **terminal**: it is the only operation allowed to release a
  resource that still has a live lease, because the manager itself is being
  destroyed. Selective eviction (`settle`/`evictUnreferenced`) still never
  evicts a leased resource. This is documented on the method.
- `resource-manager.ts:283` and `residency-budget.ts:289` are near the 300-line
  ceiling; the two extracted residency modules are internal and not re-exported
  from `residency/index.ts` (only `ResidencyDisposalResult` is public).
- The order dependency in `removeVolumeArtifacts` (volume load object first,
  then its `imageIds`) is required by Cornerstone 5.10.7 and is encoded in the
  gotcha memory and locked by harness test 5.
- No new ADR: this enforces the residency/semantic-lifetime contract already
  recorded for P3.3.

## 4. Tests Added & Executed

Added: pure tests 20–22 (`tests/residency/resource-manager-findings.test.ts`)
and real-harness tests 5–6 (`tests/rendering/resource-residency.test.ts`).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm test` | **119 pass / 0 fail** (26 suites; 114 prior + 5 new) |
| `npm run test:renderer` | **43 pass / 0 fail** (41 prior + 2 new) |
| `npm run build` | clean (exit 0) |
| `npm run test:python` | **178 passed** |
| `npm run typecheck:python` | clean over 45 source files |
| P2.5 source integrity | **2/2 pass** |

Evidence: `dispose()` releases a live-leased and an idle volume exactly once
and clears the snapshot; an injected release throw yields
`RESIDENCY_DISPOSE_INCOMPLETE` with state retained and a successful retry;
post-dispose `retain` throws `RESIDENCY_DISPOSED` and a second `dispose()` is a
no-op; the strict real-harness `load → release → load` reconstructs the same
`volumeId` with the cache holding exactly it; the real `dispose()` empties
`cache.getVolumes()` and the snapshot. All harness tests assert empty
`pageErrors`/`consoleErrors`. No `|| true`.

## 5. Documentation, Agentlog & ADR Status

- No new ADR required.
- This report satisfies the AgentLog Gate for P3.3.1.
- `CHANGELOG.md` untouched (compiled later via `/promote-changelog 3`).
- Reviewer verdict: **CONCERNS → resolved** — both defects fixed and
  fail-closed, extraction byte-faithful, tests discriminating; the only
  blocking item was this AgentLog entry, and the sole non-blocking item (test
  numbering) was applied (`23/24` → `5/6`).
- QA verdict: **PASS** on all 14 gates (7 command + 7 static), zero
  FAIL/BLOCKED; it independently re-ran the renderer suite twice and confirmed
  the reported readiness timeout was an environment flake, not a regression.

## 6. Project Model Impact

- None. No `.ncp` schema, shared contract, fixture semantics or Python change.
  The only new public type is `ResidencyDisposalResult`, in-package.

## 7. Known Limitations & Technical Debt

- `dispose()` intentionally does not touch non-physical tiers
  (`metadata-only`/`source-available`/`evicted`), which hold no RAM/VRAM; the
  docstring says exactly that.
- `release()` on a disposed manager remains a typed no-op `{released:false}`;
  only the four mutating lifecycle operations are guarded.
- `resource-manager.ts` (283) and `residency-budget.ts` (289) are close to the
  300-line gate; further growth needs another extraction.
- Test sources remain outside the `tsc` graph (inherited P3.0 debt).
- All renderer evidence is the software SwiftShader backend; hardware GPU
  remains `NOT YET APPLICABLE`.

## 8. Exact Next Recommended Task

Proceed to **P3.3-C — conclusive phase review/QA**: independently confirm no
semantic asset is deleted by eviction and that no global purge exists anywhere
in the tree, re-run the full gate pipeline over the committed P3.3-A/B/1 state,
and record the Phase 4/P3.4 entry conditions. Do not add state application
(P3.4), `RenderTarget` (P3.5), UI or view-engine work in P3.3-C.

---

# P3.3-C — Conclusive Phase Review & QA (closure)

**P3.3 is CLOSED** at HEAD `9ede6d7` (P3.3-A `16c40b4`, P3.3-B `3fbc011`,
P3.3.1 corrective `9ede6d7`). `nuclear-reviewer` and `nuclear-qa` independently
re-ran the phase against the committed tree; both returned **PASS** with no
blocking findings and zero FAIL/BLOCKED gates.

## Phase gate matrix (independently reproduced)

| Gate | Observed | Verdict |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | PASS |
| `npm test` | **119 pass / 0 fail** (26 suites) | PASS |
| `npm run test:renderer` | **43 pass / 0 fail** (real SwiftShader WebGL 2) | PASS |
| `npm run build` | clean exit 0 | PASS |
| `npm run test:python` | **178 passed** | PASS |
| `npm run typecheck:python` | mypy clean over 45 files | PASS |
| P2.5 source integrity | **2/2** | PASS |
| AgentLog (P3.3-A/B/1) | three eight-point handovers present | PASS |
| Changelog | `CHANGELOG.md` untouched (promotion via `/promote-changelog 3`) | NOT YET APPLICABLE |

## Invariants confirmed by the final review

- **No global purge anywhere.** A repo-wide search for `purgeCache`,
  `purgeVolumeCache`, `clearCache` returns zero code hits; the only
  cache-mutating calls are per-volume `cache.removeVolumeLoadObject` and
  `cache.removeImageLoadObject`.
- **No semantic deletion.** `assetId`, `geometricDigest` and the validated plan
  survive eviction; identity and reloadability are asserted by pure tests 6/7
  and harness tests 2/5/6.
- **Lifecycle coherence** across A/B/1: ordering, lease pinning, deterministic
  eviction, `budget-unverified` honesty, terminal `dispose()` fail-closed
  behaviour and the unified per-volume release are all implemented and tested.
- **Boundary/acyclicity**: `src/residency/**` is Cornerstone-free; the renderer
  residency backend is exported only from `renderer/index.ts`; `src/index.ts`
  exports worker+residency only; no `view-engine`/UI dependency.
- **Fixture honesty**: pure mock suites are separated from real controlled
  WebGL 2 suites that assert physical `cache.getVolumes()` outcomes; no
  `|| true`; no mock-only PASS claim.

## Remaining non-blocking debt carried into P3.4

1. The `deferred` disposition (backend acquires below the required tier) has no
   dedicated test; removing it would fail no test.
2. `eviction-failed` via a `backend.release` throw during selective
   `settle()`/`evictUnreferenced()` is only exercised through `dispose()`.
3. `release === false` + enumeration still-present → `eviction-failed`
   (`residency-budget.ts`) is implemented but untested.
4. `budget-unverified` is per acquisition event: a later `settle()` early-returns
   `resident` without re-checking the still-unmeasured axis.
5. `settle()` eagerly evicts every zero-lease physical resource (no fast-reshow);
   recorded policy, not a defect.
6. Harness readiness can very occasionally exceed its 120 s bound under parallel
   `node --test` cold start (observed 1 of 3 full runs, never a residency
   assertion); fail-fast/retry hardening of `createRendererHarness` is
   recommended before CI.
7. Test sources remain outside the `tsc` graph (inherited P3.0 debt);
   `resource-manager.ts` (283) and `residency-budget.ts` (289) are near the
   300-line gate.

## P3.4 entry conditions (addendum, still required before P3.4)

1. P3.3 leaves volumes observably render-ready (`gpu-ready` + cached) — **met**.
2. Close the `PetQuantitationResult.units` vs `asset.metadata.pet?.units`
   discrepancy.
3. Close the Bq/mL payload vs `g/mL` `valueSemantics` fixture discrepancy and
   make the rendered scalar domain and quantitation guard explicit and tested.
4. Give `@nuclear/rendering-presets` a declarative surface without silent
   clinical fallbacks (currently an empty barrel).
5. Create CT, PET and fusion `MedicalViewState` fixtures with provenance and
   ratify the `suvFactor` translation before implementing D3.

No code changes were made in P3.3-C; this section is the conclusive review/QA
record. Phase 3 continues with P3.4.

---

# Handover Report — P3.4-A: PET/CT Radiometry & Presets Preflight

## 1. What Was Implemented

P3.4 was started with its mandated preflight, **P3.4-A**: close the two PET
incoherences flagged by the addendum, ratify the radiometry binding in an ADR,
and give `@nuclear/rendering-presets` a real declarative surface — all before
any Cornerstone state application.

- **ADR-005 ratified the binding.** The authoritative PET units source is
  `asset.metadata.pet?.units` (`BQML`); `PetQuantitationResult` deliberately
  gains no `units` field, and spec §6's stale
  `PetQuantitationResult.units === "BQML"` guard is corrected. Quantitative
  fusion requires modality `PT`, `metadata.pet.units === 'BQML'`,
  `petQuantitation.status === 'computed'`, a finite `suvFactor > 0` and a plan
  `scalarDataDomain === 'rescaled-bqml'`.
- **Display semantics ≠ transport domain.** `valueSemantics: suv-bw / g/mL` is
  the clinical reading; the plan's `scalarDataDomain` is the physical unit of
  the array Cornerstone receives. A `stored-values`/`rescaled-hu` plan is
  refused even when the asset carries computed SUVbw — proven by an explicit
  non-conflation test.
- **`@nuclear/rendering-presets` became a real leaf surface:** the canonical
  fusion exponent `0.42`, `getFusionOpacity(s) = (s/100)^0.42`, the
  piecewise-linear `highlighted` and `alpha` `getPETOpacityMapping` modes with
  exact spec control points, the CT Soft Tissue preset (W400/L40) plus
  `ctVoiRange`, and a typed fail-closed `PresetError`. No PET colormap or PET
  display range is defaulted.
- **`@nuclear/medical-engine` gained a Node-safe PET binding resolver**
  (`src/radiometry/**`, exported from the package barrel): the ADR-005 guard
  conjunction with seven typed refusal codes, plus the only TypeScript
  SUV↔Bq/mL arithmetic (`bqml = suv / suvFactor`, `suv = bqml * suvFactor`),
  operating solely on validated worker values.

## 2. Files Changed / Created

Created (product):
- `packages/rendering-presets/src/{errors.ts (28), radiometry.ts (126), ct.ts (39)}`
- `packages/medical-engine/src/radiometry/{errors.ts (31), pet-binding.ts (120), index.ts (3)}`

Modified (product, one line each):
- `packages/rendering-presets/src/index.ts` — real barrel replaces `export {}`
- `packages/medical-engine/src/index.ts` — `+ export * from './radiometry/index.js'`

Created (tests):
- `tests/presets/radiometry-presets.test.ts` (190 lines)
- `tests/radiometry/pet-binding.test.ts` (210 lines)

Created (docs):
- `docs/decisions/ADR-005-pet-ct-radiometry-binding.md`

Unchanged: `@nuclear/shared-types` (no `units` field added), the Python worker,
the renderer/residency code, the plans, `CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- Spec §3's `span = max(1e-3, upper - lower)` is implemented verbatim. Its
  degenerate consequence for `upper - lower < 1e-3` is recorded as an **open
  decision for P3.4-B** (see §7) rather than silently changed.
- The spec-authorised defaults are the only ones declared: gamma `1.0`
  (spec §4), mode `highlighted` (spec §3 Mode A), `minOpacity 0` (spec §7 call
  shape), CT Soft Tissue W400/L40 (spec §5).
- `PetOpacityPoint { value, opacity }` mirrors Cornerstone's `OpacityMapping`
  field names without importing Cornerstone, keeping `rendering-presets` a leaf.
- The SUV guard `minSuv ≥ 0` (spec §3) is enforced at the SUV input boundary
  (`suvToBqml`), because `getPETOpacityMapping` operates on the already
  converted transport range.

## 4. Tests Added & Executed

Added: 15 preset tests + 13 binding/conversion tests (25 at review time, 28
after the review follow-ups: `PET_BINDING_SUV_NEGATIVE`, plus NaN
`lower`/`minOpacity`/`windowCenter` guards).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm test` | **145 pass / 0 fail** (31 suites; 119 prior + 26 new) |
| `npm run build` | clean (exit 0) |
| `npm run test:renderer` | **43 pass / 0 fail** (unaffected) |
| `npm run test:python` | **178 passed** |
| `npm run typecheck:python` | clean over 45 source files |
| P2.5 source integrity | **2/2 pass** |

Named tolerance `1e-12` for the power curve, control points and the
`[0,8]`↔`[0, 8/suvFactor]` conversion. The reviewer additionally ran five
mutations (fraction, range guard, exponent, domain guard, units source) and all
five were caught by the suite.

## 5. Documentation, Agentlog & ADR Status

- **ADR-005** records the ratified units source, domain separation and
  conversion; Status **Accepted**.
- This report satisfies the AgentLog Gate for P3.4-A.
- `CHANGELOG.md` untouched (compiled later via `/promote-changelog 3`).
- Reviewer verdict: code **CONCERNS → resolved** — spec fidelity, fail-closed
  guards, no invented defaults, ADR-005 fidelity, leaf purity and mutation-tested
  discrimination all PASS. The only blocking item was the missing AgentLog; the
  actionable non-blocking item (`minSuv ≥ 0` had no owner/test) is now closed,
  and the minor NaN test gaps were added.
- QA verdict: **PASS** on all 14 gates (144/144 Node at the time + renderer 43,
  Python 178, mypy 45, integrity 2/2, leaf purity, negative-test discrimination);
  the only pending row was this report.

## 6. Project Model Impact

- None. No shared-types, `.ncp` schema or persisted-contract change. The new
  public surface is the `rendering-presets` barrel and the medical-engine
  `radiometry` barrel (both in-package/leaf).

## 7. Known Limitations & Technical Debt

- **Degenerate PET span — resolved in P3.4-A.1.** The pre-A.1 `span` clamp was
  a real bug: for `upper - lower < 1e-3` it placed control points outside
  `[lower, upper]` and could make opacity decrease with value. P3.4-A.1 now
  refuses a span below `1e-3` with a typed `PRESET_INVALID_RANGE`, and the
  normative spec §3 was updated accordingly. See the P3.4-A.1 report below.
- `getPETOpacityMapping` accepts a negative transport `lower` (only finiteness
  and `upper > lower` are guarded); the SUV-domain non-negativity is enforced
  upstream by `suvToBqml`.
- Test sources remain outside the `tsc` graph (inherited P3.0 debt).
- No Cornerstone state application, raster capture, `RenderTarget` or hardware
  GPU evidence yet — explicitly P3.4-B/P3.4-C/P3.5.

## 8. Exact Next Recommended Task

Proceed to **P3.4-B — `MedicalViewState` application**: apply the ratified
presets and the ADR-005 binding to the Cornerstone viewport (CT underlay + PET
overlay, `setProperties` per spec §7), with CT/PT/fusion positive tests and the
addendum's fail-closed negatives (missing/invalid quantitation, wrong units or
domain, inverted range, out-of-range slider/gamma, non-resident/incompatible
volume, wrong target, incomplete state). The degenerate-span policy is already
resolved (see P3.4-A.1). Do not add `RenderTarget` (P3.5), UI or view-engine
work.

---

# Handover Report — P3.4-A.1: Radiometry Hardening (corrective)

## 1. What Was Implemented

The user rejected P3.4-A acceptance for P3.4-B on four clinical-architectural
grounds (green gates proved internal coherence, not completeness). `5cba8db`
remains the P3.4-A baseline; this is the focused corrective.

1. **Normative spec made self-consistent.** `PET_CT_FUSION_RADIOMETRY_SPEC.md`
   §6 no longer references the non-existent `PetQuantitationResult.units`; it
   now conditions on `asset.metadata.pet?.units === "BQML"` with the full
   ADR-005 conjunction. §3 owns the SUV-domain guards at the conversion boundary
   and states the degenerate-span refusal. §5 mandates declarative exposure of
   the CT base configuration; §8 lists it.
2. **Conversion helpers made independently safe.** `suvToBqml`, `bqmlToSuv` and
   `suvRangeToBqml` now require a finite, strictly positive `suvFactor`, a
   finite result, and `suvRangeToBqml` additionally `minSuv >= 0` and
   `maxSuv > minSuv`, with typed `PET_BINDING_SUV_FACTOR_INVALID`,
   `PET_BINDING_RANGE_INVALID` and `PET_BINDING_OUTPUT_NOT_FINITE` refusals.
   Previously `suvToBqml(1, 0)` returned `Infinity`, `suvToBqml(1, -0.1)`
   returned a negative activity, and `suvRangeToBqml([8, 0], f)` returned an
   inverted range.
3. **Degenerate PET span refused, not clamped.** `getPETOpacityMapping` now
   throws typed `PRESET_INVALID_RANGE` for `upper - lower < 1e-3`; `span` is
   the real difference, so all control points stay within `[lower, upper]` and
   opacity is non-decreasing with value.
4. **CT base-volume configuration is declarative.**
   `@nuclear/rendering-presets` now exports `CT_HU_RANGE` (`[-1024, 3071]`),
   `CT_BASE_VOLUME_VISIBLE` and `CT_BASE_VOLUME_OPACITY` (fully opaque over the
   full HU range) per spec §5, so the adapter cannot hardcode a second copy.
   A generic `OpacityPoint` type was added; `PetOpacityPoint` remains an alias.

ADR-005 gained a "P3.4-A.1 Corrective Hardening" addendum ratifying all four
changes and explicitly recording the preset-population scope: **only**
spec-authorised values are declared, and PET colormap names / PET display
ranges stay caller-declared until a specification or ADR ratifies concrete
values — never by inference.

## 2. Files Changed / Created

Modified (docs):
- `docs/plans/PET_CT_FUSION_RADIOMETRY_SPEC.md` (§3, §5, §6, §8)
- `docs/decisions/ADR-005-pet-ct-radiometry-binding.md` (corrective addendum)

Modified (product):
- `packages/medical-engine/src/radiometry/pet-binding.ts` (180 lines)
- `packages/medical-engine/src/radiometry/errors.ts` (33 lines, +2 codes)
- `packages/rendering-presets/src/radiometry.ts` (139 lines — `OpacityPoint`,
  `MIN_OPACITY_SPAN`, span refusal)
- `packages/rendering-presets/src/ct.ts` (52 lines — CT base config)

Modified (tests):
- `tests/presets/radiometry-presets.test.ts` (238 lines, +3 tests)
- `tests/radiometry/pet-binding.test.ts` (251 lines, +4 tests)

Unchanged: `@nuclear/shared-types`, the renderer/residency code, the Python
worker, `CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- The SUV-domain guards (`minSuv >= 0`, `maxSuv > minSuv`, finite positive
  factor, finite converted bounds) are owned by the conversion boundary
  (`suvRangeToBqml`), while `getPETOpacityMapping` independently validates its
  transport-domain `lower`/`upper` and the span. This division is now explicit
  in spec §3.
- A range whose PET span is below `1e-3` is clinically degenerate; refusing is
  the fail-closed choice the spec now mandates. Clamping was rejected because
  it silently moves the declared range.
- A non-finite `suvFactor` (e.g. `Infinity`) is reported as
  `PET_BINDING_INPUT_NOT_FINITE` (the finiteness check precedes the positivity
  check); finite non-positive factors are `PET_BINDING_SUV_FACTOR_INVALID`.
  Both are typed refusals.

## 4. Tests Added & Executed

Added: 3 preset tests (degenerate-span refusal + exact `1e-3` acceptance;
in-range non-decreasing control points; CT base constants) and 4 binding tests
(zero/negative factor for each helper; reversed range; non-finite overflow).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm test` | **152 pass / 0 fail** (31 suites; 145 prior + 7 new) |
| `npm run build` | clean (exit 0) |
| `npm run test:renderer` | **43 pass / 0 fail** |
| `npm run test:python` | **178 passed** |
| `npm run typecheck:python` | clean over 45 source files |
| P2.5 source integrity | **2/2 pass** |

Named tolerance `1e-12`. The reviewer ran a 10-mutation battery on the new
guards: 7 killed directly; 3 are redundant layers (inner helper already refuses
the same case) with no individual pin — safe, recorded as non-blocking.

## 5. Documentation, Agentlog & ADR Status

- ADR-005 addendum and spec §3/§5/§6/§8 updated; this report satisfies the
  AgentLog Gate for P3.4-A.1 and supersedes the earlier "open decision"
  wording in the P3.4-A §7/§8.
- `CHANGELOG.md` untouched (compiled later via `/promote-changelog 3`).
- Reviewer verdict: **CONCERNS → resolved** — all four rejected points PASS
  with file:line evidence and mutation testing; the only required action was
  this AgentLog sync, now done.
- QA verdict: **PASS** on all 15 gates (typecheck, Node 152/152, build,
  renderer 43/43, Python 178, mypy 45, integrity 2/2, leaf purity, exact-code
  assertions, spec/ADR coherence, shared-types untouched); zero FAIL/BLOCKED.

## 6. Project Model Impact

- None. No shared-types / `.ncp` / persisted-contract change.

## 7. Known Limitations & Technical Debt

- Three layered guards (the outer positive-factor/`minSuv` checks in
  `suvRangeToBqml` and the strict `upper > lower` sub-guard in
  `getPETOpacityMapping`) are redundant with the span/negative guards and have
  no individual mutation pin; they must be covered if edited.
- The OpenCodeRAG index can serve pre-A.1 spec chunks (stale `span = max(...)`
  text); always Read the file. `PHASE_3_MEDCANVAS_RECOVERY_ADDENDUM.md` still
  describes the units discrepancy as an open mandate (historical; now closed
  by ADR-005/spec §6).
- No Cornerstone state application/capture, `RenderTarget` or hardware GPU
  evidence yet — P3.4-B/P3.4-C/P3.5.

## 8. Exact Next Recommended Task

Proceed to **P3.4-B — `MedicalViewState` application** as in the P3.4-A §8,
now without any open preflight decision: apply the ADR-005 binding and the
declarative CT/PET presets to the Cornerstone viewport (spec §7 `setProperties`),
with CT/PT/fusion positives and the addendum's fail-closed negatives, plus the
real-harness evidence. Do not add `RenderTarget` (P3.5), UI or view-engine work.

---

# Handover Report — P3.4-A.2: MedicalViewState Fusion Contract Readiness

## 1. What Was Implemented

The user blocked P3.4-B because `MedicalViewState` could not represent a
complete fusion: a single `PresentationState` plus bare `DataBinding` layers and
an undeclared-string `layerOpacity` forced the renderer to infer the PET
transfer mode, gamma, fusion slider and the distinct CT/PET presentations. This
slice (ADR-006) makes an incomplete fusion **unrepresentable** and supplies the
required CT/PET/fusion fixtures. It introduces no Cornerstone, rendering, UI or
view-engine code.

- **ADR-006** ratifies a per-layer fusion presentation contract with no
  view-level fallback.
- **`@nuclear/shared-types`** gained `PetFusionTransfer`
  (`transferMode`, `gamma`, `blendSlider`), `CompositionLayer`
  (`binding`, `presentation`, optional `fusion`), `FusionBlendMode`, the
  `Single`/`Fusion`/`MultiLayer` composition states, and a
  `MedicalViewState = SingleMedicalViewState | ComposedMedicalViewState` union.
  A composed view structurally has **no** top-level `presentation`; the
  duplicate `layerOpacity` map was removed in favour of per-layer
  `presentation.opacity`.
- **Validators** enforce fusion completeness fail-closed: `blend === 'alpha'`,
  ≥2 layers, exactly one `base` (declares `presentation.voi`, no `fusion`) and
  ≥1 `overlay` (explicit `colormapId`, exactly one of `voi`/`suvRange`, valid
  `fusion`), with `transferMode ∈ {highlighted, alpha}`, `gamma > 0`,
  `blendSlider ∈ [0,100]`; composed views with a top-level `presentation` are
  rejected.
- **Fixtures** for CT (existing `mockMedicalView`), PET (`mockPetView`) and
  fusion (`mockFusionView`) bind the committed `mockCtAsset`/`mockPetAsset`
  ids; `mockPetViewProvenance`/`mockFusionViewProvenance` and
  `mockPetPreparedView`/`mockFusionPreparedView` carry provenance.
- **Addendum** annotations mark the two historical P3.4 PET preconditions
  (units discrepancy, Bq/mL vs g/mL) closed by ADR-005.

## 2. Files Changed / Created

Created (docs):
- `docs/decisions/ADR-006-per-layer-fusion-presentation.md`

Modified:
- `packages/shared-types/src/view-state.ts` (135 lines)
- `packages/shared-types/src/index.ts` (185 lines — +8 type exports)
- `tests/contracts/view-validators.ts` (100 lines)
- `tests/contracts/view-contracts.test.ts` (100 lines — +2 tests)
- `tests/fixtures/view-contracts.fixture.ts` (157 lines)
- `docs/plans/PHASE_3_MEDCANVAS_RECOVERY_ADDENDUM.md` (closure annotations)

Unchanged: all `packages/*` other than `shared-types`, the Python worker,
renderer/presets, `CHANGELOG.md`, the version. `@nuclear/shared-types` remains a
leaf with zero runtime dependencies.

## 3. Architectural Assumptions Made

- `MedicalViewState` is a discriminated union: `single` keeps the authoritative
  view-level `presentation`; composed modes carry per-layer presentations and no
  view-level presentation. `PreparedView.state` remains a `MedicalViewState`.
- Fusion layers are validated by role, not by modality: `base` = underlay,
  `overlay` = fusion layer. The contract therefore needs no modality inference.
- The PET colormap and range remain caller-declared; the contract requires them
  on a fusion overlay but supplies no default (ADR-005 / invariant 7).
- `layerOpacity` removal is safe because per-layer `presentation.opacity` is
  now the single source of truth; no source reference remains.

## 4. Tests Added & Executed

Added: 2 contract tests (positives for CT/PET/fusion + prepared views; a
discriminating negative battery for fusion completeness, transfer bounds and the
no-fallback rule).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm test` | **154 pass / 0 fail** (31 suites; 152 prior + 2 new) |
| `npm run build` | clean (exit 0) |
| `npm run test:renderer` | **43 pass / 0 fail** |
| `npm run test:python` | **178 passed** |
| `npm run typecheck:python` | clean over 45 source files |
| `tests/contracts/view-contracts.test.ts` | **9 pass / 0 fail** (7 prior + 2) |
| P2.5 source integrity | **2/2 pass** |

Negatives cover: missing overlay `fusion`; base carrying `fusion`; overlay with
both `voi` and `suvRange`; overlay without `colormapId` (undefined and empty);
base without `voi`; invalid `transferMode`; `gamma 0/-1`; `blendSlider 101/-1`;
fusion with one layer, no overlay, or a duplicate base; a composed view with a
top-level `presentation`; a single view without `presentation`.

## 5. Documentation, Agentlog & ADR Status

- ADR-006 records the decision; the addendum's two historical preconditions are
  annotated closed.
- This report satisfies the AgentLog Gate for P3.4-A.2.
- `CHANGELOG.md` untouched (compiled later via `/promote-changelog 3`).
- Reviewer verdict: **PASS** with non-blocking concerns; the two actionable ones
  (missing negative for a duplicate `base`, and for an empty `colormapId`) were
  closed before commit, so the mutation battery now fully kills the role-count
  and colormap-emptiness mutations.
- QA verdict: **PASS** on all gates (typecheck, Node 154/154, build, renderer
  43/43, Python 178, mypy 45, integrity 2/2, contract 9/9, leaf purity,
  no-`layerOpacity` residue); the only pending row was this report.

## 6. Project Model Impact

- **Yes — persisted contract change.** `MedicalViewState`/`CompositionState`
  changed shape and `layerOpacity` was removed. This is a Phase 1 contract
  evolution ratified by ADR-006; there is no legacy import to migrate. No
  `.ncp` schema version bump was performed (persistence is Phase 1/`project-model`
  work); P3.4-B and later must consume the new union.

## 7. Known Limitations & Technical Debt

- **`multi-layer` validation is intentionally shallow** (well-formed layers
  only; no base/overlay/fusion rules). Non-PET multi-layer semantics must be
  modelled explicitly if ever needed (ADR-006 revision condition).
- **`LocalViewOverride` presentation overrides remain view-level**; for a
  composed view a per-layer presentation override will be needed in Phase 4.
  This is a known follow-up, not silently handled.
- Test sources remain outside the `tsc` graph (inherited P3.0 debt).
- No Cornerstone application/capture, `RenderTarget` or hardware GPU evidence
  yet — P3.4-B/P3.4-C/P3.5.

## 8. Exact Next Recommended Task

Proceed to **P3.4-B — `MedicalViewState` application**: map the new
`Single`/`Composed` union and the ADR-005 quantitative binding onto the
Cornerstone viewport (CT underlay + PET overlay; `setProperties` per spec §7,
opacity `(s/100)^0.42`, `highlighted`/`alpha` transfer), with CT/PT/fusion
positives and the addendum's fail-closed negatives, plus real-harness evidence.
Do not add `RenderTarget` (P3.5), UI or view-engine work.

---

# Handover Report — P3.4-A.3: Single-Source PET Overlay Opacity (corrective)

## 1. What Was Implemented

A review found a real semantic contradiction in the P3.4-A.2 fusion contract:
the PET overlay declared **both** `presentation.opacity` (`1`) and
`fusion.blendSlider` (`50`), while spec §2/§7 define the PET overall opacity as
`(blendSlider / 100)^0.42` (applied as the colormap `opacity`). Two fields
claimed the same quantity, so the renderer had to choose one — exactly the
implicit inference ADR-006 was meant to eliminate. Green gates did not catch it
because the validator accepted any `presentation.opacity ∈ [0,1]` alongside a
valid `fusion`.

`cc126ac` remains the P3.4-A.2 baseline; this is the corrective.

- **Single-sourced the PET overlay opacity.** New
  `PetFusionOverlayPresentation` deliberately omits `opacity`; the PET overall
  opacity comes solely from `PetFusionTransfer.blendSlider`.
- **Structurally precise composition.**
  `FusionCompositionState.layers` is now the tuple
  `readonly [CompositionLayer, ...FusionOverlayLayer[]]`: exactly one CT
  underlay (`presentation: PresentationState`, no `fusion`) followed by one or
  more overlays (`presentation: PetFusionOverlayPresentation`, required
  `fusion`). `CompositionLayer` no longer carries `fusion`.
- **Fail-closed validator.** `petFusionOverlayPresentation` rejects any declared
  `opacity`, requires a non-empty `colormapId`, exactly one of
  `voi`/`suvRange`, valid `invert`/`interpolation`;
  `baseCompositionLayer` requires role `base`, `presentation.voi` and no
  `fusion`; `fusionOverlayLayer` requires role `overlay` and a valid `fusion`.
- **Fixture corrected:** `fusionPetPresentation` no longer declares `opacity`;
  the CT underlay keeps `PresentationState.opacity`.
- **Review closers:** added the missing overlay-role negative test (N2);
  qualified ADR-006 Decision 5 so a reader cannot reintroduce the dual opacity
  (N3); fixed the ADR's stale `LayerState` reference (N4).

## 2. Files Changed / Created

Modified:
- `packages/shared-types/src/view-state.ts` (152 lines)
- `packages/shared-types/src/index.ts` (187 lines — `+PetFusionOverlayPresentation`, `+FusionOverlayLayer`)
- `tests/contracts/view-validators.ts` (97 lines)
- `tests/contracts/view-contracts.test.ts` (109 lines — +1 test, +2 negatives)
- `tests/fixtures/view-contracts.fixture.ts` (158 lines)
- `docs/decisions/ADR-006-per-layer-fusion-presentation.md` (amended)

Unchanged: all other `packages/*`, the Python worker, renderer/presets,
`CHANGELOG.md`, the version. `@nuclear/shared-types` remains a type-only leaf.

## 3. Architectural Assumptions Made

- The PET overlay's only overall-opacity source is `blendSlider`; the CT
  underlay's overall opacity remains a single `PresentationState.opacity`. No
  layer has two fields claiming the same quantity.
- The fusion layer roles remain CT underlay = `base`, PET = `overlay`; the
  contract still needs no modality inference.
- `MultiLayerCompositionState` keeps `CompositionLayer[]` (presentation with
  `opacity`), preserving per-layer opacity for non-fusion layers.

## 4. Tests Added & Executed

Added: a dedicated test proving an overlay that declares `opacity` is invalid,
plus an overlay-role negative (index ≥1 must be `overlay`).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm test` | **155 pass / 0 fail** (31 suites; 154 prior + 1) |
| `npm run build` | clean (exit 0) |
| `npm run test:renderer` | **43 pass / 0 fail** |
| `npm run test:python` | **178 passed** |
| `npm run typecheck:python` | clean over 45 source files |
| `tests/contracts/view-contracts.test.ts` | **10 pass / 0 fail** (9 prior + 1) |
| P2.5 source integrity | **2/2 pass** |

One `npm test` run hit the known intermittent renderer-harness startup timeout;
the immediate rerun was 155/155 with no contract failure, confirming an
environment flake, not a regression.

## 5. Documentation, Agentlog & ADR Status

- ADR-006 gained the P3.4-A.3 addendum; Decision 5 now points to it.
- This report satisfies the AgentLog Gate for P3.4-A.3.
- `CHANGELOG.md` untouched (compiled later via `/promote-changelog 3`).
- Reviewer verdict: **PASS** (the mandated mutation — removing the overlay
  `opacity === undefined` guard — is killed by the new test); the three
  non-blocking findings N2/N3/N4 were closed before commit.
- QA verdict: **PASS** on all gates (typecheck, Node 155/155, build, renderer
  43/43, Python 178, mypy 45, integrity 2/2, contract 10/10); the only pending
  row was this report.

## 6. Project Model Impact

- **Persisted contract change (again).** `FusionCompositionState`,
  `CompositionLayer` and the new overlay types changed shape. Ratified by
  ADR-006 + addendum; no legacy import to migrate; no `.ncp` schema bump.

## 7. Known Limitations & Technical Debt

- `multi-layer` validation remains shallow (no base/overlay/fusion rules); a
  stray `fusion` on a multi-layer layer would pass — known and documented.
- `LocalViewOverride` presentation overrides remain view-level; a per-layer
  override for composed views is a Phase 4 follow-up.
- Test sources remain outside the `tsc` graph (inherited P3.0 debt).
- Intermittent renderer-harness startup timeout under parallel `node --test`
  (environment flake; rerun green). Fail-fast hardening remains recommended.
- No Cornerstone application/capture, `RenderTarget` or hardware GPU evidence
  yet — P3.4-B/P3.4-C/P3.5.

## 8. Exact Next Recommended Task

Proceed to **P3.4-B — `MedicalViewState` application**: map the
`Single`/`Composed` union and the ADR-005 binding onto the Cornerstone viewport
(CT underlay + PET overlay; `setProperties` per spec §7, overall PET opacity
solely `(blendSlider/100)^0.42`, `highlighted`/`alpha` transfer), with CT/PT/
fusion positives and the addendum's fail-closed negatives, plus real-harness
evidence. The contract now has no dual PET-opacity source. Do not add
`RenderTarget` (P3.5), UI or view-engine work.

---

# Handover Report — P3.4-A.3bis: Representability Precision (corrective)

## 1. What Was Implemented

The user's P3.4-A.2 review arrived after P3.4-A.3 had already been implemented,
so most of it was addressed by A.3. This addendum closes the remainder:

| Review point | Status |
| --- | --- |
| `blendSlider` sole PET opacity authority | **done in A.3** |
| Fusion overlay presentation must not have `opacity`; CT base may keep it | **done in A.3** |
| Distinct base/overlay types + tuple enforcing order and a single base | **strengthened here** |
| Negatives for overlay `opacity`; test `blendSlider: 50 → 0.5^0.42` | negatives in A.3; **formula test added here** |
| ADR-006 wrongly says `presentation.opacity` is the unique authority | **fixed in A.3** (Decision 5 amended) |
| "unrepresentable" overstated while layers was a generic array | **corrected here** |

- **Tuple tightened** to
  `readonly [CompositionLayer, FusionOverlayLayer, ...FusionOverlayLayer[]]`:
  a fusion with no overlay, or with a non-overlay layer after the first
  underlay, is now a compile-time error, not only a validator refusal.
- **Formula test added** (`tests/presets/radiometry-presets.test.ts` #17): the
  fusion fixture's `blendSlider: 50` is fed to `getFusionOpacity` and asserted
  equal to `0.5^0.42` within `1e-12`, tying the contract fixture to the
  canonical spec §2 curve.
- **ADR-006 wording scoped:** the Context sentence now says the type system
  makes the structural facts unrepresentable (count, order, required transfer,
  single opacity source) while binding roles and cross-field completeness are
  fail-closed by validation, because `DataBinding.role` is a shared union. A
  P3.4-A.3bis addendum records this precisely.

## 2. Files Changed / Created

Modified:
- `packages/shared-types/src/view-state.ts` (tuple strengthening)
- `tests/presets/radiometry-presets.test.ts` (+1 formula test)
- `docs/decisions/ADR-006-per-layer-fusion-presentation.md` (Context wording + A.3bis addendum)

Unchanged: everything else.

## 3. Architectural Assumptions Made

- `DataBinding.role` remains a shared union (`base`/`overlay`/`reference`), so
  role correctness cannot be expressed purely in the type without splitting the
  binding contract; the validator stays the mandatory boundary for role and
  cross-field rules.
- `blendSlider` is the only PET overlay opacity input; the CT underlay's
  overall opacity remains its single `PresentationState.opacity`.

## 4. Tests Added & Executed

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm test` | **156 pass / 0 fail** (31 suites; 155 prior + 1) |
| `npm run build` | clean (exit 0) |
| `tests/presets + tests/contracts` | **27 pass / 0 fail** |

A.3bis is a bounded precision/test/doc correction; the substantive A.3 contract
change already carries its reviewer PASS and QA PASS. The full gate pipeline was
re-run here after the tuple tightening, because the tuple is a compile-time
contract change.

## 5. Documentation, Agentlog & ADR Status

- ADR-006 Context wording corrected; a P3.4-A.3bis addendum records the tuple
  strengthening and the precise representability scope.
- This report satisfies the AgentLog Gate for P3.4-A.3bis.
- `CHANGELOG.md` untouched.

## 6. Project Model Impact

- Persisted contract change (tuple shape only). Ratified by ADR-006 + addendum;
  no `.ncp` schema bump.

## 7. Known Limitations & Technical Debt

- Binding roles remain validator-enforced (documented); a future split of
  `DataBinding` into role-specific types would move that check to compile time.
- `multi-layer` validation remains shallow; `LocalViewOverride` presentation
  overrides remain view-level (Phase 4 follow-up).
- Test sources remain outside the `tsc` graph; intermittent renderer-harness
  startup flake remains (rerun green).

## 8. Exact Next Recommended Task

Proceed to **P3.4-B — `MedicalViewState` application**, and additionally include
the two scope items the user requested for B: a **declared DICOM palette
catalog in `@nuclear/rendering-presets`** and its **typed registration in
`@nuclear/medical-engine`** (so PET colormaps become ratified, typed inputs
rather than caller strings). Apply the `Single`/`Composed` union and the ADR-005
binding to the Cornerstone viewport (CT underlay + PET overlay; `setProperties`
per spec §7, overall PET opacity solely `(blendSlider/100)^0.42`,
`highlighted`/`alpha` transfer), with CT/PT/fusion
positives and the addendum's fail-closed negatives, plus real-harness evidence.
Do not add `RenderTarget` (P3.5), UI or view-engine work.

---

# Handover Report — P3.4-B.1.1: Palette Canonicalisation, LUT Digest & Dedupe

## 1. What Was Implemented

The user accepted P3.4-B.1 and imposed two mandatory requirements for P3.4-B.2,
plus a minor dedupe. This bounded preflight implements all three; it does **not**
implement the volume-viewport/`MedicalViewState` application.

1. **Canonical persisted `colormapId` + typed resolution.** The catalog gained
   `findDicomPaletteById`; the persisted PET/fusion-overlay
   `presentation.colormapId` is now the stable NuClear id `dicom-pet` (not the
   ambiguous `'PET'`, whose name and content label coincide). A new Node-safe
   `@nuclear/medical-engine/src/palette/palette-resolution.ts` resolves that id
   to the Cornerstone registration name and throws typed
   `PaletteResolutionError(PALETTE_NOT_FOUND)` for unknown/empty ids — before
   any `setProperties`, with no default substitution. The CT underlay keeps
   `'gray'` with the documented built-in caveat (its fail-closed resolution is
   P3.4-B.2).
2. **Whole-LUT regression digest.** `tests/presets/dicom-palettes.test.ts` now
   computes SHA-256 over the 1024 quantised bytes
   (`clamp(round(v*255), 0, 255)`) of each palette and compares to four pinned
   digests. A single byte mutation or a length change fails the test.
3. **Registration dedupe.** `registerDicomPalettes()` registers a palette whose
   `name === contentLabel` (PET) once and returns the seven unique registry
   names in catalog order; idempotence and rethrow-on-failure are unchanged.

## 2. Files Changed / Created

Created:
- `packages/medical-engine/src/palette/palette-resolution.ts` (75)
- `packages/medical-engine/src/palette/index.ts` (9)
- `tests/palette/palette-resolution.test.ts` (81)

Modified:
- `packages/rendering-presets/src/dicom-palettes.ts` (632 — pure data table +
  `findDicomPaletteById`)
- `packages/medical-engine/src/renderer/dicom-palette-registration.ts` (96)
- `packages/medical-engine/src/index.ts` (5 — exports the Node-safe palette barrel)
- `tests/presets/dicom-palettes.test.ts` (155)
- `tests/rendering/dicom-palette-registration.test.ts` (116)
- `tests/rendering/fixtures/palette-entry.ts` (100)
- `tests/fixtures/view-contracts.fixture.ts` (161)
- `docs/decisions/ADR-007-dicom-palette-catalog.md` (addendum)

Unchanged: `@nuclear/shared-types`, the worker, `CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- The persisted `colormapId` canonical form is always the NuClear stable id
  (`dicom-*`); the DICOM content label and the Cornerstone registration name
  are registration details resolved internally.
- `PaletteResolutionError` is Node-safe and deliberately separate from the
  renderer's Cornerstone errors; it is reachable from the package barrel.
- The digest is a regression guard over the whole LUT, derived from the DICOM
  PS3.6 Table B.1-1 8-bit tables; it is not a DICOM conformance check.

## 4. Tests Added & Executed

Added: 2 preset tests (whole-LUT digest; `findDicomPaletteById`) and 4 resolver
tests; adjusted the harness registration test to seven unique names.

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm test` | **170 pass / 0 fail** (34 suites; 164 prior + 6) |
| `npm run test:renderer` | **45 pass / 0 fail** (11 suites) |
| `npm run build` | clean (exit 0) |
| `npm run test:python` | **178 passed** |
| `npm run typecheck:python` | clean over 45 source files |
| P2.5 source integrity | **2/2** |

Pinned digests (SHA-256 over the quantised 1024-value table):
- `dicom-hot-iron` `ca6c2927abca13b899a7d88fef1231ac9a0f09cecfc6402f1a544d22a33c791e`
- `dicom-pet` `d7a1f92cd7b2c2df82f0e6fe5211af10a6136fd348299272674693996f63f039`
- `dicom-hot-metal-blue` `c3a09a60bd404de71385e4e39a3cf22586a217767c019ce06334cbdead737146`
- `dicom-pet-20-step` `b3b98b418920617ae7a242e828a869be59b93e5d187d346137ad26c59c868b67`

The reviewer independently recomputed all four digests from pydicom 3.0.2's
bundled well-known palette SOP instances and they match the pins exactly.

## 5. Documentation, Agentlog & ADR Status

- ADR-007 gained an addendum recording the canonical id rule (typed failure
  before `setProperties`), the digest definition/derivation and the dedupe.
- This report satisfies the AgentLog Gate for P3.4-B.1.1.
- `CHANGELOG.md` untouched (compiled later via `/promote-changelog 3`).
- Reviewer verdict: **PASS** on all six technical items (it reproduced the
  digests from pydicom and mutation-tested the digest); the only concern was
  this AgentLog entry, now written. It also confirmed the earlier "B.1 handover
  missing" note was stale (B.1 is committed in `7f97a2b`).
- QA verdict: **PASS** on all command/structural gates with digest mutation
  sensitivity independently demonstrated; the only failing row was this report.

## 6. Project Model Impact

- The persisted contract convention changes: PET/fusion `colormapId` is a
  stable `dicom-*` id. The fixture was updated accordingly. No shared-types
  change; the convention is recorded in ADR-007.

## 7. Known Limitations & Technical Debt

- CT `'gray'` (a Cornerstone built-in, not a catalog id) has no typed resolver
  yet; B.2 must resolve built-ins fail-closed before `setProperties`.
- The digest is a regression guard, not a DICOM conformance tool.
- The palette data module is 632 lines (pure data, Rule 03 exempt).
- Intermittent renderer-harness startup flake remains (rerun green).
- No viewport application, capture, `RenderTarget` or hardware GPU evidence yet.

## 8. Exact Next Recommended Task

Proceed to **P3.4-B.2** with both mandatory requirements wired in: add the
adapter volume-viewport capability and apply the `Single`/`Composed`
`MedicalViewState` union using `resolveDicomPaletteById` (registered palettes,
`dicom-*` ids, fail-closed before `setProperties`), the ADR-005 quantitative
binding, and the per-layer fusion transfer (overall PET opacity solely
`(blendSlider/100)^0.42`), with CT/PT/fusion positives and the addendum's
fail-closed negatives plus real-harness evidence. Do not add `RenderTarget`
(P3.5), UI or view-engine work.

---

# Handover Report — P3.4-B.1: DICOM Palette Catalog & Typed Registration

## 1. What Was Implemented

P3.4-B is large, so it is executed in bounded sub-slices. **P3.4-B.1** delivers
the palette prerequisite the user requested: a ratified DICOM palette catalog
(ADR-007) and its typed Cornerstone registration. No `MedicalViewState`
application or viewport work is included.

- **ADR-007** ratifies the catalog: `@nuclear/rendering-presets` owns the
  declarative data, `@nuclear/medical-engine` owns typed registration, the data
  authority is DICOM PS3.6 Table B.1-1, and the MedCanvas mirror is only a
  retrieval aid.
- **Catalog** (`dicom-palettes.ts`): `DicomPaletteDefinition` plus the four
  nuclear-medicine palettes — Hot Iron (`1.2.840.10008.1.5.1`), PET (`.5.2`),
  Hot Metal Blue (`.5.3`), PET 20 Step (`.5.4`) — as a pure, import-free data
  module with `DICOM_PALETTE_CATALOG` and lookups by content label / SOP UID.
- **Typed registration** (`renderer/dicom-palette-registration.ts`,
  browser-only): `registerDicomPalettes()` maps each entry explicitly to
  Cornerstone's `ColormapRegistration` (no object spread), registers it under
  both `name` and `contentLabel` via `utilities.colormap.registerColormap`,
  returns the registered names, is idempotent, and rethrows any failure with the
  palette identity — no silent catch. Exported only from `renderer/index.ts`.
- **Independent data verification:** the reviewer checked all 4×256×4 values
  against pydicom 3.0.2's bundled well-known palette SOP instances and found
  **zero mismatches**; the provenance is now recorded in the module header.

## 2. Files Changed / Created

Created:
- `docs/decisions/ADR-007-dicom-palette-catalog.md`
- `packages/rendering-presets/src/dicom-palettes.ts` (614 lines — pure static
  data table, Rule 03 exempt)
- `packages/medical-engine/src/renderer/dicom-palette-registration.ts` (79)
- `tests/presets/dicom-palettes.test.ts` (110)
- `tests/rendering/dicom-palette-registration.test.ts` (113)
- `tests/rendering/fixtures/palette-entry.ts` (97)

Modified:
- `packages/rendering-presets/src/index.ts` (4→5)
- `packages/medical-engine/src/renderer/index.ts` (14→15)

Unchanged: `@nuclear/shared-types`, the worker, the residency/radiometry code,
`CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- `rendering-presets` stays a leaf: no Cornerstone import, no side effects; the
  data module only declares.
- DICOM PS3.6 is the data authority; structural tests (1024 points, monotonic
  `x`, black→white endpoints, unique ids/labels, lookups) plus the reviewer's
  pydicom cross-check are the available evidence — not a DICOM conformance
  tool.
- Cornerstone's `registerColormap` overwrites same-named entries, so the module
  flag is only a cheapness guard; correctness does not depend on it.

## 4. Tests Added & Executed

Added: 6 pure structural tests and 2 real WebGL 2 harness tests.

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm test` | **164 pass / 0 fail** (33 suites; 156 prior + 8) |
| `npm run test:renderer` | **45 pass / 0 fail** (11 suites; rerun after the known harness flake) |
| `npm run build` | clean (exit 0) |
| `npm run test:python` | **178 passed** |
| `npm run typecheck:python` | clean over 45 source files |
| P2.5 source integrity | **2/2** |

Harness evidence: Cornerstone's registry lists all seven unique names
(`Hot Iron`/`HOT_IRON`, `PET`, `Hot Metal Blue`/`HOT_METAL_BLUE`,
`PET 20 Step`/`PET_20_STEP`) and `getColormap('PET').RGBPoints.length === 1024`;
a second registration is idempotent and does not grow the set; page/console
errors empty.

## 5. Documentation, Agentlog & ADR Status

- ADR-007 records the decision; the palette data provenance (DICOM PS3.6 +
  pydicom cross-check) is documented in the module header.
- This report satisfies the AgentLog Gate for P3.4-B.1.
- `CHANGELOG.md` untouched (compiled later via `/promote-changelog 3`).
- Reviewer verdict: **PASS** (it independently mutation-tested the structural
  suite and verified the data against pydicom); the two non-blocking items
  (provenance note, all-seven-names registry assertion) were closed before
  commit.
- QA verdict: **PASS** on all gates (typecheck, Node 164/164, renderer 45/45,
  build, Python 178, mypy 45, integrity 2/2); the only pending row was this
  report.

## 6. Project Model Impact

- New declarative data surface (`DicomPaletteDefinition`/`DICOM_PALETTE_CATALOG`)
  and a browser-only registration function. No shared-types/`.ncp` change.

## 7. Known Limitations & Technical Debt

- The catalog/data are structurally validated and pydicom-cross-checked, but no
  DICOM conformance tool is run.
- No `MedicalViewState.colormapId` validation against the catalog is wired yet;
  that belongs to P3.4-B.2 application.
- Palette data module is 614 lines (pure data, exempt); do not add logic to it.
- Intermittent renderer-harness startup flake remains (rerun green).
- No viewport application, capture, `RenderTarget` or hardware GPU evidence
  yet.

## 8. Exact Next Recommended Task

Proceed to **P3.4-B.2 — `MedicalViewState` application to Cornerstone**: add a
volume viewport capability to the adapter and apply the `Single`/`Composed`
union with the ADR-005 binding and the ADR-007 palettes (register before
`setProperties`; CT underlay + PET overlay; overall PET opacity solely
`(blendSlider/100)^0.42`; `highlighted`/`alpha` transfer), with CT/PT/fusion
positives and the addendum's fail-closed negatives, plus real-harness evidence.
Do not add `RenderTarget` (P3.5), UI or view-engine work.

---

# Handover Report — P3.4-B.2.1: Pure `MedicalViewState` Application Compiler

## 1. What Was Implemented

P3.4-B.2 is large, so it is split: **B.2.1** delivers the pure, Node-safe
compiler from a `MedicalViewState` (plus a per-asset volumeId map and the
ADR-005 PET binding) to a serializable Cornerstone application plan. The browser
volume viewport and `setProperties` application are **B.2.2** and are not in
this slice.

- **ADR-008** ratifies the split and the rules: pure compiler vs browser
  adapter; explicit modality selection; fail-closed colormap resolution; ADR-005
  binding for PET; projection mapping; the interpolation-enum boundary.
- **`src/view-application/**`** (6 modules, exported from `src/index.ts`):
  `compileMedicalViewApplication` builds per-layer `properties`
  (`voiRange`, `colormap {name, opacity, opacityMapping?}`, `invert`,
  `interpolationType`) in Cornerstone `ViewportProperties` shape, plus a
  projection plan.
- **Explicit modality, no inference**: PET only for a fusion `overlay` or a
  single view with `modalityPresentation === 'pet'`; `ct`/`mr`/`generic`/
  undefined and all `multi-layer` layers use the CT/generic path. No asset
  metadata, modality byte or scalar range is read.
- **Fail-closed**: unbound asset → `VIEW_VOLUME_NOT_BOUND`; missing/unknown/
  non-catalog colormap → `VIEW_COLORMAP_UNKNOWN` (only `dicom-*` + `gray`);
  CT without `voi` → `VIEW_STATE_INVALID`; PET without binding →
  `VIEW_PET_BINDING_REQUIRED`; PET with both/neither range →
  `VIEW_STATE_INVALID`; non-slice without a positive slab →
  `VIEW_PROJECTION_INVALID`; `reference` role refused.
- **Radiometry single-sourced**: fusion overlay opacity is exactly
  `getFusionOpacity(blendSlider)` (no `presentation.opacity`) and the mapping is
  exactly `getPETOpacityMapping(lower, upper, 0, gamma, transferMode)`; single
  PET uses `presentation.opacity`; `suvRange` converts via `suvRangeToBqml`.
- **Reviewer C1 closed**: added `toCornerstoneInterpolationType` (nearest → 0,
  linear → 1) with a test, so the adapter has a tested mapping from the plan's
  portable string to Cornerstone's numeric `InterpolationType`.

## 2. Files Changed / Created

Created:
- `docs/decisions/ADR-008-medical-view-state-application.md`
- `packages/medical-engine/src/view-application/{errors.ts (38), types.ts (78),
  colormap.ts (42), projection.ts (43), layers.ts (199), view-application.ts
  (120), index.ts (8)}`
- `tests/view-application/view-application.test.ts` (278)

Modified:
- `packages/medical-engine/src/index.ts` (exports the Node-safe compiler barrel)

Unchanged: `@nuclear/shared-types`, the renderer (no browser code touched),
`CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- The plan is renderer-agnostic: portable strings for interpolation; exact
  Cornerstone field names for `voiRange`/`colormap`/`invert`.
- Binding-role correctness remains the ADR-006 validator's boundary; the
  compiler only refuses the non-renderable `reference` role.
- Only `gray` is allowlisted as a Cornerstone built-in; any other built-in must
  be ratified before use.

## 4. Tests Added & Executed

Added: 13 pure compiler tests (single CT/PET, fusion, projection, volume
binding, palette cause, interpolation mapping).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm test` | **183 pass / 0 fail** (38 suites; 170 prior + 13) |
| `npm run build` | clean (exit 0) |
| `npm run test:renderer` | **45 pass / 0 fail** |
| `npm run test:python` | **178 passed** |
| `npm run typecheck:python` | clean over 45 source files |
| P2.5 source integrity | **2/2** |

The reviewer mutation-tested the exactly-one-range guard and the colormap
allowlist (both mutations failed a test) and independently confirmed the fusion
opacity equals `0.5^0.42` within `1e-12` against the committed fixtures.

## 5. Documentation, Agentlog & ADR Status

- ADR-008 records the application contract.
- This report satisfies the AgentLog Gate for P3.4-B.2.1.
- `CHANGELOG.md` untouched (compiled later via `/promote-changelog 3`).
- Reviewer verdict: **PASS** with two non-blocking concerns. C1
  (interpolation string vs numeric) was **closed before commit** via
  `toCornerstoneInterpolationType` + test. C2 (degenerate-span/gamma/slider
  refusals surface as the certified `PresetError`/`PetBindingError` rather than
  `ViewApplicationError`) is deliberately left propagating fail-closed and is
  recorded for B.2.2.
- QA verdict: **PASS** on all 14 gates (typecheck, Node 182/182 at QA time,
  compiler suite 12/12 by name, build, renderer 45/45, Python 178, mypy 45,
  integrity 2/2, shared-types untouched, no flake); the only pending row was
  this report. The final tree is 183/183 after the C1 test was added.

## 6. Project Model Impact

- New Node-safe public surface (`compileMedicalViewApplication` + plan types +
  errors) exported from the package barrel; no shared-types/`.ncp` change.

## 7. Known Limitations & Technical Debt

- **C2**: malformed (non-degenerate) PET spans / bad gamma / out-of-domain
  slider raise the presets' `PresetError`; malformed SUV ranges raise
  `PetBindingError`. Both are fail-closed but outside the `ViewApplicationError`
  vocabulary; B.2.2 must treat them as an owned boundary or wrap them.
- `multi-layer` and `reference`-role refusals are implemented but not directly
  tested (non-blocking).
- Test sources remain outside the `tsc` graph (inherited debt).
- No browser viewport, `setProperties`, capture or `RenderTarget` yet.
- Intermittent renderer-harness startup flake remains (rerun green).

## 8. Exact Next Recommended Task

Proceed to **P3.4-B.2.2 — browser volume viewport and application**: empirically
establish the volume viewport type in the controlled WebGL 2 harness
(`ViewportType.ORTHOGRAPHIC` resolves to the modern planar path in 5.10.7 — do
not assume), add the adapter capability, apply a compiled `ViewApplicationPlan`
via `setVolumes` + per-volume `setProperties` (using
`toCornerstoneInterpolationType`) + `setBlendMode`/`setSlabThickness`, register
the ADR-007 palettes first, and assert the applied state via Cornerstone getters
with CT/PT/fusion positives and the addendum's fail-closed negatives
(non-resident/unbound volume, geometry/FoR mismatch, unresolved palette). Treat
the certified `PresetError`/`PetBindingError` as an owned boundary. Do not add
`RenderTarget` (P3.5), UI or view-engine work.

---

# Handover Report — P3.4-B.2.1.1: Per-Asset PET Binding Map (corrective)

## 1. What Was Implemented

A clinical-architectural review found that `FusionCompositionState` allows
multiple PET overlays while `ViewApplicationInput` exposed a single
`petBinding`, so a multi-PET fusion would have applied one asset's `suvFactor`
to every overlay — a wrong quantitative factor. This corrective replaces it.

- **Per-asset bindings.** `ViewApplicationInput.petBindings` is now a required
  `ReadonlyMap<AssetId, QuantitativePetBinding>`; every PET layer (single PET or
  each fusion overlay) resolves **its own** entry by `assetId`. A missing entry
  refuses `VIEW_PET_BINDING_REQUIRED` naming that asset; there is **no
  cross-asset fallback** (the message says so explicitly).
- **Tests.** Added: a two-PET fusion applying two different `suvFactor`s with
  per-overlay VOI/opacity/mapping isolation; a map missing only the second
  overlay; and a single PET asset absent from the map while a foreign guest is
  present (proves no fallback).
- **ADR-008 addendum** records the per-asset rule and explicitly scopes the
  pure plan to layer properties + projection, stating that **`SpatialState`,
  `CameraState` and `CoordinateTransformSet` are not yet represented and must be
  applied or explicitly refused by P3.4-B.2.2** (the whole `MedicalViewState`
  must be semantically applied, never silently dropped).
- **Test-file split.** The compiler test file had grown to 456 lines; it was
  split into a shared fixtures module plus two suites (all ≤300 lines), with all
  16 tests preserved verbatim.

## 2. Files Changed / Created

Modified:
- `packages/medical-engine/src/view-application/types.ts` (86)
- `packages/medical-engine/src/view-application/layers.ts` (201)
- `packages/medical-engine/src/view-application/view-application.ts` (121)
- `docs/decisions/ADR-008-medical-view-state-application.md` (addendum)

Created (test split):
- `tests/view-application/fixtures/view-application-fixtures.ts` (158)
- `tests/view-application/view-application-single-layer.test.ts` (142)
- `tests/view-application/view-application-fusion.test.ts` (243)

Deleted:
- `tests/view-application/view-application.test.ts` (456 — replaced by the two
  suites above)

Unchanged: `@nuclear/shared-types`, the renderer, palette/radiometry modules,
`CHANGELOG.md`, the version.

## 3. Architectural Assumptions Made

- `petBindings` is required (not optional): every compile call supplies the map,
  even for CT-only views. This is an in-package API change with no consumers
  outside `medical-engine` and its tests.
- The map key is the branded `AssetId`; the layer builders hold plain strings,
  so a type-level cast bridges them (no runtime risk).
- The certified `PresetError`/`PetBindingError` propagation remains as ADR-008
  declares; B.2.2 owns that boundary if needed.

## 4. Tests Added & Executed

Added: 3 per-asset binding tests (16 total in the split suites).

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | clean (exit 0) |
| `npm test` | **186 pass / 0 fail** (40 suites; 183 prior + 3) |
| `npm run build` | clean (exit 0) |
| `npm run test:renderer` | **45 pass / 0 fail** (rerun after the known harness flake) |
| `npm run test:python` | **178 passed** |
| `npm run typecheck:python` | clean over 45 source files |
| P2.5 source integrity | **2/2** |

The reviewer mutation-tested the lookup (forcing a fallback to the first map
value) and confirmed tests 15/16 fail while test 14 stays green — the sentinel
design is correct.

## 5. Documentation, Agentlog & ADR Status

- ADR-008 addendum records the per-asset rule and the B.2.2 spatial/camera/
  transform obligation.
- This report satisfies the AgentLog Gate for P3.4-B.2.1.1.
- `CHANGELOG.md` untouched (compiled later via `/promote-changelog 3`).
- Reviewer verdict: **PASS** (one advisory on the now-split test-file length,
  resolved here).
- QA verdict: **PASS** on all applicable gates (typecheck, Node 186/186,
  compiler suite 16/16, build, renderer 45/45 after one reproduced flake,
  Python 178, mypy 45, integrity 2/2); the only pending row was this report.

## 6. Project Model Impact

- In-package compiler input shape changed (`petBinding` → `petBindings`);
  no shared-types/`.ncp` change.

## 7. Known Limitations & Technical Debt

- The compiler's PET path does not yet cover `SpatialState`, `CameraState` or
  `CoordinateTransformSet`; B.2.2 must apply or explicitly refuse them.
- Certified `PresetError`/`PetBindingError` propagate outside the
  `ViewApplicationError` vocabulary (ADR-008 declares this).
- `multi-layer` and `reference`-role refusals remain implemented but not
  directly tested.
- Test sources remain outside the `tsc` graph; intermittent renderer-harness
  startup flake remains (rerun green).

## 8. Exact Next Recommended Task

Proceed to **P3.4-B.2.2 — browser volume viewport and application**: empirically
establish the volume viewport type (`ViewportType.ORTHOGRAPHIC` resolves to the
modern planar path in 5.10.7 — verify, do not assume), add the adapter
capability, register the ADR-007 palettes, and apply a compiled
`ViewApplicationPlan` via `setVolumes` + per-volume `setProperties` (using
`toCornerstoneInterpolationType`) + `setBlendMode`/`setSlabThickness`. The
viewport must also **semantically apply or explicitly refuse** `SpatialState`,
`CameraState` and `CoordinateTransformSet` — not merely VOI/colormap/projection.
Assert the applied state via Cornerstone getters with CT/PT/fusion positives and
the addendum's fail-closed negatives (non-resident/unbound volume, geometry/FoR
mismatch, unresolved palette). Do not add `RenderTarget` (P3.5), UI or
view-engine work.
