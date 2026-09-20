---
name: nuclear-rendering
description: Specialized runbook for Cornerstone3D WebGL volume rendering, stable viewport surfaces, canonical gamma & transfer functions (gamma = 0.42), temporary high-resolution RenderTargets, and publication figure compositing in NuClear. Use whenever implementing, modifying, or auditing medical rendering pipelines.
---

# NuClear Rendering Skill

## 1. When to Activate
Activate this skill when:
- Implementing or modifying Cornerstone3D volume rendering pipelines in `@nuclear/medical-engine`.
- Managing stable `ViewportSurface` instances and the `ViewportSurfaceRegistry` in `@nuclear/view-engine`.
- Configuring PET/CT fusion blending, colormaps, or gamma transfer curves.
- Implementing temporary high-resolution offscreen `RenderTarget` captures for 300/600 DPI publication export in `@nuclear/figure-engine`.
- Auditing memory residency and VRAM budget in `ResourceManager`.

## 2. Preconditions
- WebGL 2.0 capable environment (Electron desktop runtime).
- Cornerstone3D dependencies managed in `@nuclear/medical-engine`.

## 3. Procedures & Technical Contracts

### A. Stable Viewport Surfaces & Single Rendering Path
- MedCanvas/NuClear allocates up to 16 persistent `ViewportSurface` objects managed by `ViewportSurfaceRegistry`.
- Switching between Viewer and Composer does NOT recreate or re-initialize WebGL contexts; surfaces are assigned dynamically by `SurfaceLayoutManager`.
- Principle: **"Stable viewport identity is not one WebGL context per slot."**

### B. Canonical Fusion Radiometry
- **Gamma Curve**: Canonical PET fusion transfer exponent is strictly $\gamma = 0.42$ (defined in `@nuclear/rendering-presets`).
- **Per-Row Isolation**: SUV window, colormap, and CT W/L must be isolated per `RowId` / `ViewGroup`; changing parameters on one row must never leak to other rows.
- **Blending**: Use the declared Cornerstone3D rendering configuration. Do not call a shader pipeline “certified” unless a separate regulatory certification actually exists.

### C. Temporary High-Resolution RenderTarget (Publication Export)
- Publication export at 300 or 600 DPI NEVER upscales interactive screen viewports.
- The publication renderer calculates the required physical pixels:
  $$\text{Pixels} = \frac{\text{Dimension (mm)}}{25.4} \times \text{DPI}$$
- An offscreen `RenderTarget` is allocated temporarily with identical `MedicalViewState` camera/spatial/presentation parameters.
- Raster pixel buffer is extracted for composition:
  - **TIFF / PNG**: Flat raster composition at native DPI.
  - **PDF**: Hybrid composition (high-res medical raster + native PDF vectors for badges, arrows, labels, and scalebars).
