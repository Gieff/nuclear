# NuClear

> **NuClear: the scientific figure authoring workstation for nuclear medicine — built from DICOM, designed for PET/CT.**

NuClear is a clinical-grade, publication-ready multimodal medical imaging workstation and scientific figure authoring tool specialized for nuclear medicine physicians, radiologists, and molecular imaging researchers.

---

## Architecture & Foundational Principles

NuClear is built on the **v3 Architectural Blueprint** ([`docs/NUCLEAR_ARCHITECTURE_V3.md`](docs/NUCLEAR_ARCHITECTURE_V3.md)) and the **Project Vademecum** ([`docs/PROJECT_VADEMECUM.md`](docs/PROJECT_VADEMECUM.md)):

```text
DICOM
  ↓
medical-engine (ScientificWorkerBridge & ResourceManager)
  ↓
ImagingAsset
  ↓
view-engine
  ↓
MedicalViewState
  ↓
ViewSlot / ViewportSurface (persistent WebGL pool)
  ↓
PreparedView
  ↓
project-model (.mcv offline-safe)
  ↓
ComposerViewInstance (local overrides)
  ↓
figure-engine
  ↓
Temporary High-Resolution RenderTarget (native 300/600 DPI)
  ↓
Publication Figure (Hybrid PDF / TIFF / PNG)
```

### Core Invariants:
1. **Semantic Lifetime is not Resource Residency**: A semantic reference never pins RAM or VRAM.
2. **Stable Viewport Identity is not one WebGL Context per Slot**: 16 persistent ViewportSurfaces share Cornerstone's context pool dynamically between Viewer and Composer.
3. **Same Rendering Path is not necessarily the same physical canvas**: Publication export renders directly through temporary high-resolution RenderTargets without upscaling screen pixels.
4. **The UI does not contain domain logic**: "Render state, emit intent."

---

## Monorepo Packages

```text
packages/
├── shared-types/       # Pure TypeScript interfaces, enums, opaque IDs (Leaf)
├── rendering-presets/  # Standardized clinical presets, colormaps, canonical gamma (0.42)
├── medical-engine/     # Headless Cornerstone3D volume rendering, residency & Python IPC
├── view-engine/        # Imaging Workspace, ViewSlots, PreparedViews, linking & surfaces
├── figure-engine/      # Figure layout, panel framing/layout, vector composition & export
├── project-model/      # Project persistence schemas (.mcv) & offline cache
└── ui/                 # Atomic presentation components & design system

apps/
└── desktop/            # Electron runtime, process supervision, window shell

python/
├── dicom/              # DICOM parsing, geometry validation, SUVbw quantitation
└── worker/             # Local JSON-RPC 2.0 daemon
```

---

## Identity & Design System

The visual identity, brand surfaces, palette, and typography are defined in [`docs/NuClear: studio di identità.html`](docs/NuClear:%20studio%20di%20identità.html).

---

## Agent Guidelines

All AI coding agents follow [`AGENTS.md`](AGENTS.md), the rules in `.agents/rules/`, and the runbook skills in `.agents/skills/`.
