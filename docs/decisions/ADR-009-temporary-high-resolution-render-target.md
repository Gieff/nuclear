# ADR-009: Temporary High-Resolution `RenderTarget` (P3.5)

## Status

Accepted

## Date

2026-09-21

## Context

P3.4-C delivered ordinary raster capture on the live Cornerstone volume
viewport. P3.5 must render the **same medical state** at publication density
without resizing, cropping or permanently altering the live interactive canvas,
camera, aspect ratio or viewport size (Phase 3 plan invariant 2; architecture
§30.1; Vademecum "Publication rendering"). The physical pixel requirement is
derived from the output size:

```text
pixels = round(mm / 25.4 * DPI)
```

The shared contract `TemporaryRenderTargetSpec` already exists
(`kind: 'temporary-high-resolution'`, `pixelDimensions`, `dpi`, `colorProfile`,
`alpha`, `liveCanvasPolicy: 'never-resize-live-canvas'`), and the architecture
states both that the target "può essere un canvas offscreen, un target interno
al backend o un'altra superficie temporanea" and the principle "same rendering
path does not require the same physical canvas". What is **not** documented is
how the target's physical pixel dimensions relate to
`MedicalViewState.coordinateTransforms`, whose `viewportSizePx` describes the
interactive viewport. This ADR ratifies that boundary so P3.5 does not invent
it silently.

## Decision

1. **Dimensioning and spec validation are pure and Node-safe.**
   `packages/medical-engine/src/view-application/render-target.ts` exports
   `computeRenderTargetPixelDimensions(sizeMm, dpi)` (per `round(mm / 25.4 *
   dpi)`, refusing non-finite/non-positive inputs) and
   `validateTemporaryRenderTargetSpec(spec, sizeMm)`, which refuses a
   non-positive/non-integer `pixelDimensions`, a non-finite or non-positive
   `dpi`, a `liveCanvasPolicy` other than `never-resize-live-canvas`, an
   unknown `alpha`, an empty `colorProfile`, and any `pixelDimensions` that do
   not equal the computed dimensions for the declared `sizeMm`/`dpi`. Typed
   `RenderTargetError` codes: `RENDER_TARGET_SPEC_INVALID`,
   `RENDER_TARGET_DIMENSIONS_MISMATCH`.

2. **The temporary target is a distinct physical target, not the live canvas.**
   `packages/medical-engine/src/renderer/temporary-render-target.ts`
   (browser-only, exported solely from `renderer/index.ts`) starts a
   **separate temporary `CornerstoneRendererAdapter`** on a caller-supplied
   host sized exactly to the computed pixel dimensions, applies the same
   semantic state through `applyViewApplication`, obtains the raster through
   the existing `captureMedicalRaster` path, then stops the adapter and removes
   its container. Cornerstone remains the sole renderer; no second renderer,
   no preview upscaling and no Canvas re-rasterization of medical data is
   introduced.

   **Terminology.** In P3 the term `RenderTarget` denotes this **separate
   temporary Cornerstone engine/surface** — a distinct physical target that
   shares the rendering path and state — **not an internal WebGL framebuffer**.
   The name is retained from the Phase 3 contract
   (`TemporaryRenderTargetSpec`) and the architecture, which leaves the
   physical realization open ("un canvas offscreen, un target interno al
   backend o un'altra superficie temporanea"); a future backend may replace
   this mechanism with a true offscreen/internal target while preserving the
   state/provenance/disposal contract (see "Conditions That Might Warrant a
   Revision").

3. **The same semantic state is carried; only the target pixel size is
   retargeted.** `deriveTemporaryRenderTargetPlan(plan, pixelDimensions)`
   copies the compiled plan verbatim except for
   `coordinateTransforms.viewportSizePx`, which is set to the target's computed
   pixel dimensions — the target is a different physical surface, so the
   interactive pixel size cannot apply. `patientToViewPlane` and
   `viewPlaneToViewport` are carried **verbatim and are not recomputed**: P3
   does not consume `viewPlaneToViewport` for rendering, so deriving a new
   matrix here would invent a mapping that belongs to the publication/figure
   layer (Phase 5). Source binding, presentation, projection, composition,
   spatial identity and presets are unchanged, so provenance matches the
   ordinary capture.

4. **A separate host factory keeps the DOM gateway injected.**
   `captureTemporaryRenderTarget(input, { createHost })` receives a
   `createHost(pixelDimensions) => RendererRuntimeHost` factory. The primitive
   never reaches for `document`; the harness supplies a target-sized host
   (positioned offscreen where the host supports it) and the desktop shell will
   supply the production one (ADR-003).

5. **Fail-closed with no fallback.** Engine/container allocation failure is
   wrapped as `RENDER_TARGET_ALLOCATION_FAILED` (cause preserved); a render or
   apply failure still disposes the temporary target; a cleanup that fails
   after a successful capture is `RENDER_TARGET_DISPOSAL_FAILED`. There is no
   fallback to resizing the live canvas, to a preview, or to upscaling.

6. **Provenance records the target.** The result carries the ordinary
   `MedicalCaptureDescriptor` (raster at the target's native dimensions,
   semantic provenance, renderer facts) plus the explicit
   `pixelDimensions`, `dpi` and `sizeMm` of the target. No figure composition,
   TIFF/PNG flattening or hybrid PDF is produced here (Phase 5).

## Consequences

- P3.5 is a medical-raster capability: the target applies the same
  `MedicalViewState`, presets and composition semantics as the live viewport,
  and cannot mutate the live canvas/camera/aspect/state because it owns a
  separate engine and container.
- The dimensioning formula and spec validator are unit-testable in Node; the
  real-harness evidence covers 300/600 DPI, native-size non-empty buffers,
  live-canvas invariance, allocation failure and disposal after error.
- No `@nuclear/shared-types` change and no new cross-package contract.

## Conditions That Might Warrant a Revision

- If Phase 5 needs a target-specific view-plane → pixel mapping, it must
  **supply it explicitly** (a new input to the render target), and the
  derivation must be ratified here rather than performed silently in
  medical-engine.
- If a future backend can render to a true offscreen target without a
  temporary engine, this ADR's "separate engine" mechanism may be replaced
  while preserving the state/provenance/disposal contract.
