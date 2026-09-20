# ADR-003: Cornerstone3D Runtime Host & Controlled WebGL 2 Renderer Harness

## Status

Accepted

## Date

2026-09-20

## Context

Phase 3 must deliver the first real NuClear medical-rendering path in
`@nuclear/medical-engine` while remaining UI-agnostic and headless-first.
Principle P2 and Rule 01 make Cornerstone3D the sole medical renderer; the
Phase 3 plan forbids substituting a Canvas/CPU renderer and requires that a
controlled, reproducible WebGL 2 harness exercise the actual Cornerstone
path before any rendering claim is accepted.

Three questions had to be settled before P3.1 could depend on them:

1. Which Cornerstone3D packages and exact versions NuClear adopts, and which
   package owns the dependency.
2. How a real WebGL 2/DOM runtime is provided to `medical-engine` without a
   product UI, and how test infrastructure drives it.
3. How DOM/WebGL host objects are kept out of the serializable,
   UI-agnostic `medical-engine` contracts.

A P3.0 feasibility probe on the development host produced the evidence below
(Apple M4, macOS, Node v24.3.0, npm 11.6.4).

### Measured feasibility evidence

Using `@cornerstonejs/core@5.10.7` in headless Chromium (Playwright 1.63.0)
with `--use-gl=angle --use-angle=swiftshader --ignore-gpu-blocklist`:

- `cornerstone.init()` returned `true`; `isCornerstoneInitialized()` was
  `true`; reported version `5.10.7`.
- `detectRenderingCapabilities()` reported `webgl: true`, `webgl2: true`,
  `float: true`, `halfFloat: true`, `floatLinear: true`,
  `halfFloatLinear: true`, `maxTextureSize: 8192`, and
  `softwareRasterizer: true` (ANGLE/SwiftShader).
- A `RenderingEngine` was created, registered via
  `getRenderingEngine(id)`, a `STACK` viewport was enabled, and the engine
  was destroyed cleanly (`getRenderingEngine(id)` then `undefined`).
  `resetInitialization()` cleared initialization and a second
  init → engine → teardown cycle succeeded with zero console/page errors.

Optional hardware backend on the same host
(`--use-angle=metal`) reported `softwareRasterizer: false`,
`maxTextureSize: 16384`, `norm16: true`, renderer
`ANGLE (Apple, ANGLE Metal Renderer: Apple M4)`.

Fail-closed path: launching Chromium with `--disable-webgl --disable-webgl2`
returns `null` for `getContext('webgl2')` and `getContext('webgl')`, so an
unavailable-WebGL case is reproducible.

Two implementation constraints were measured, not assumed:

- `@cornerstonejs/core@5.10.7` publishes **ESM only** (`./dist/esm/*`); there
  is no UMD/IIFE build. A browser harness must bundle it.
- Bundling its `@kitware/vtk.js` dependency pulls `xmlbuilder2` and
  `@oozcitak/url`, which require the Node builtins `events` and `url`; the
  browser polyfill packages `events` and `url` must be present for the
  bundle to build.

## Decision

### 1. Renderer dependency and ownership

- NuClear adopts **`@cornerstonejs/core@5.10.7`, pinned exactly**, owned by
  `@nuclear/medical-engine` (Rule 02 package ownership). All future
  `@cornerstonejs/*` packages added in Phase 3 (e.g. tools, image loader)
  are pinned to the same `5.10.7` version line, and only installed when the
  slice that consumes them is implemented; P3.0 installs `core` only.
- No other renderer, shader pipeline, Canvas approximation or CPU
  rasterizer may be introduced (Rule 01, P2).

### 2. Runtime host ownership

- DOM/WebGL host objects (the browser window/document, canvas elements and
  `RenderingEngine` instances) are supplied to `medical-engine` through a
  **narrow, injected host port**. `medical-engine` never creates a global
  DOM assumption of its own.
- Public `medical-engine` state and contracts stay **serializable and
  UI-agnostic**. Cornerstone objects, canvases and contexts never appear in
  shared-type payloads; they live behind opaque adapter handles.
- In Phase 3 the host port is satisfied by the controlled test harness. In
  Phase 7 the Electron desktop shell becomes the production host. Neither
  the adapter's public surface nor the persisted contracts may depend on
  which host is bound.

### 3. Controlled WebGL 2 renderer harness

- The harness is **test infrastructure, not product UI**. It is a Playwright
  (`1.63.0`, pinned) headless Chromium page that loads an esbuild
  (`0.28.2`, pinned) browser bundle of a probe/adapter entry, served from an
  ephemeral local HTTP server bound to `127.0.0.1`. No React, no desktop
  shell, no exported application workflow.
- **Default backend is deterministic software WebGL 2**:
  `--use-gl=angle --use-angle=swiftshader --ignore-gpu-blocklist`. This is a
  real WebGL 2 pipeline executing Cornerstone's own shaders; it is reported
  honestly as `softwareRasterizer: true`, never as GPU/hardware. A hardware
  backend may be selected explicitly for local investigation with
  `NUCLEAR_RENDERER_GL=metal`; the literal value `default` launches Chromium
  with no GL arguments, and an unknown value fails loudly. Any capability
  difference (e.g. `norm16`, `maxTextureSize`) must be recorded with the
  evidence. On the recording host, `metal` reported
  `softwareRasterizer: false`, `maxTextureSize: 16384`, `norm16: true`
  against the software backend's `8192` / `false`.
- The harness must be a **configured, non-optional gate** from P3.1 onward.
  A missing browser binary or unavailable WebGL is reported `BLOCKED`, never
  a mocked PASS.
- From P3.1, tests drive `medical-engine`'s adapter; direct
  `@cornerstonejs/core` imports are confined to the adapter and the
  bundle entry.

### 4. Pixel-bearing fixture policy

- Committed, programmatically reproducible pixel-bearing CT/PT fixtures are
  required. Their pixel representation, dimensions, modality tags, geometry
  and expected worker evidence must be declared alongside them.
- The gitignored `tests/cases/` DICOM tree may discover defects but is never
  sole PASS evidence (Phase 3 plan).
- Fixture generation and the fixtures themselves are P3.2 work; P3.0 fixes
  only the policy and the harness boundary.

## Consequences

- P3.1 may build the adapter lifecycle against an injected host port knowing
  that a real, reproducible WebGL 2 harness exists and how it is invoked.
- Adding any `@cornerstonejs/*` package is a deliberate, version-aligned
  act; accidental duplicate renderer dependencies are prevented.
- The harness introduces dev-only dependencies (`playwright`, `esbuild`,
  `events`, `url`) and a documented environment prerequisite
  (`npx playwright install chromium`). These are tooling, not runtime
  product dependencies.
- The default evidence records a software rasterizer. GPU-specific behaviour
  must be verified explicitly and may legitimately remain `NOT YET
  APPLICABLE` in a CPU-only environment.

## Conditions That Might Warrant a Revision

- If the harness cannot reproduce a required Cornerstone behaviour and a
  documented Electron/hardware host becomes the only viable evidence path.
- If NuClear adopts a different medical renderer or Cornerstone major
  version (would require a superseding ADR).
- If a stable Node-native WebGL 2 runtime removes the need for a browser
  automation harness.
