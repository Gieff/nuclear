# NuClear

## Project Vademecum & AI Agent Development Guide

**Document status:** Project blueprint / development master guide\
**Target:** production-grade scientific figure workstation for nuclear medicine\
**Primary use:** shared context for AI coding agents and human developers\
**Scope:** publication-ready figures created directly from clinical DICOM PET/CT cases

------------------------------------------------------------------------

## How to read this vademecum in NuClear

This document predates the NuClear greenfield plan and retains a useful catalogue of product requirements. It is **not** a second architecture.

The normative technical model is [`NUCLEAR_ARCHITECTURE_V3.md`](NUCLEAR_ARCHITECTURE_V3.md). The present vademecum is the execution, governance, testing, and product-boundary guide. If they appear to conflict, v3 prevails and the discrepancy must be resolved in an ADR before code changes.

The authoritative plan for a new NuClear repository is §4.1 below. Sections 5–31 are retained as a product backlog/reference catalogue only; they do not authorize an implementation order that conflicts with §4.1. In particular, they must not be used to build a product UI before the headless contracts and engines have evidence behind them.

NuClear uses `.ncp` (**NuClearProject**) as its only serialized project artifact. No legacy project format, import adapter or compatibility layer is in scope.

------------------------------------------------------------------------

# 1. Product Definition

## 1.1 One-sentence definition

**NuClear is a desktop application for creating
publication-ready medical imaging figures directly from clinical DICOM
studies.**

It is a DICOM figure builder — it is not intended to replace a PACS, diagnostic workstation, reporting
system, or general-purpose image editor.

Its purpose is to reduce the manual workflow required to transform one
or more PET/CT clinical cases into a standardized scientific figure.

## 1.2 Target workflow

The intended user experience is:

1.  User decides: "I need iconography for this article."
2.  Opens NuClear.
3.  Selects a figure template.
4.  Imports the required DICOM studies/series.
5.  Application identifies relevant CT/PET series.
6.  Application applies standardized medical-image rendering presets.
7.  User synchronizes comparable cases/viewports.
8.  User identifies the anatomical focus/lesion.
9.  User centers and frames the relevant anatomy consistently.
10. User locks the relevant viewport state.
11. User adds editorial annotations.
12. User arranges panels.
13. User previews the final figure.
14. User exports a publication-ready PDF/TIFF/PNG.

The central product concept is:

> **DICOM clinical data -> reproducible medical viewport states ->
> editorial panels -> publication figure**

------------------------------------------------------------------------

# 2. Core Product Principles

These principles are architectural requirements, not suggestions.

## P1 --- NuClear is an authoring tool, not a PACS

Do not reproduce PACS functionality unless it is directly required for
figure creation.

Avoid unnecessary features such as: - diagnostic reporting; -
worklists; - RIS integration; - enterprise PACS administration; - remote
server infrastructure; - general clinical workflow management.

## P2 --- The medical rendering source of truth is Cornerstone3D

Cornerstone3D is the authoritative renderer for interactive PET/CT
visualization.

Do not create a second independent medical renderer in Python for the
same viewport.

Python must never become a parallel PET/CT renderer.

## P3 --- Python is a local scientific-processing worker

Python is used for: - DICOM parsing; - metadata handling; -
anonymization; - geometry normalization and verification; - resampling; -
registration; - image processing; - numerical calculations; - SUVbw/data
transformations.

Python is not the interactive GUI backend and should not be exposed as
an unnecessary HTTP server.

Preferred communication: - child process; - IPC; - stdin/stdout; - local
process messaging.

FastAPI is not required for the initial architecture.

## P4 --- Figure state is more important than screenshots

The application must save a reproducible representation of a viewport.

A locked viewport is not merely a screenshot.

It contains information such as: - source series; - orientation; -
anatomical position; - camera; - zoom; - CT window/level; - PET display
range; - PET colormap; - fusion opacity; - slab/MIP settings; -
interpolation; - rendering options.

## P5 --- Separate medical rendering from editorial composition

Two different concepts must never be conflated:

**Medical Renderer** - PET; - CT; - fusion; - MPR; - MIP; - camera; -
window/level; - LUT; - opacity.

**Figure Composer** - panel size; - panel position; - crop; - letters; -
arrows; - circles; - text; - captions; - borders; - layout; - export
dimensions.

## P6 --- Python must never render figure elements

Python may prepare scientific data, but it must not draw: - PET; - CT; -
fusion; - arrows; - letters; - text; - circles; - editorial elements.

The final composition is performed by the application-side Figure
Engine.

## P7 --- PDF preserves vectors; TIFF/PNG are flattened rasters

For PDF output: - medical image data is a high-resolution raster
generated by the publication RenderTarget; - arrows should remain
vector; - labels should remain vector; - text should remain vector; -
lines/circles and scalebars should remain vector.

TIFF and PNG are fully flattened rasters at the requested DPI. A PDF
must not be made by rasterizing the entire sheet merely because that is
easier to implement.

## P8 --- Reproducibility and source verification are product features

A `.ncp` project must contain enough information to reconstruct the
figure.

The project should record: - schema version; - application version; -
renderer versions; - Cornerstone version; - vtk.js version; - Electron
version; - rendering presets; - figure state; - template; -
annotations; - export settings; - `SourceLocator`; -
`SourceFingerprint`; - source availability; - transform provenance; -
valid disposable `CachedPreview` entries where available.

------------------------------------------------------------------------

# 3. Technology Stack --- Version 1

## Desktop shell

**Electron**

Reason: - fixed Chromium runtime; - predictable WebGL environment; -
mature desktop ecosystem; - easy filesystem integration; - suitable for
distribution to multiple co-authors using different operating systems.

Target: - macOS; - Windows.

Linux is not a v1 priority unless later required.

## UI

**React + TypeScript**

Responsibilities: - application UI; - figure canvas; - template
browser; - inspector; - toolbars; - project state; - annotations; - user
interactions.

## Medical imaging

**Cornerstone3D**

Responsibilities: - DICOM viewport; - PET/CT fusion; - MPR; - MIP; -
camera; - zoom/pan; - window/level; - PET LUT; - rendering state; -
offscreen/high-resolution rendering where supported.

## Rendering foundation

**vtk.js**

Used through the Cornerstone3D rendering stack where appropriate.

## Scientific worker

**Python**

Initial libraries: - pydicom; - SimpleITK; - NumPy; - scikit-image where
necessary.

Potential future libraries must be justified by a concrete requirement.

## Application-to-Python communication

Preferred: - local child process / IPC.

Avoid introducing FastAPI unless a concrete architectural requirement
appears.

## Figure composition

Dedicated application-side **Figure Composer / Figure Engine**.

It consumes rendered medical-image raster layers and vector
annotation/layout data.

It should not depend on Python for medical rendering.

------------------------------------------------------------------------

# 4. High-Level Architecture

``` text
                              NUCLEAR
                                  |
              +-------------------+-------------------+
              |                                       |
              v                                       v
      ELECTRON DESKTOP                         PYTHON WORKER
              |                                       |
      React + TypeScript                      pydicom / ITK
              |                                NumPy / SciPy
      Application State                              |
              |                                       |
      Figure Model <-------------------- processing results
              |
              v
       Cornerstone3D
              |
       vtk.js / WebGL
              |
       Medical Renderer
              |
        RGBA raster
              |
              v
       Figure Composer
          /         \
         v           v
   Vector layers   Raster layers
         \           /
          \         /
           v       v
        Publication Figure
          /       |       \
        PDF      TIFF     PNG
```

The **Figure Model** is a persisted composition contract. It is not the
only central contract: `ImagingAsset`, `MedicalViewState`,
`PreparedView`, and source provenance remain separate so that the
editorial figure never becomes the owner of medical data or GPU
resources.

------------------------------------------------------------------------

## 4.1 NuClear execution architecture — authoritative for a greenfield build

### Package ownership

NuClear has **seven** domain packages, not six:

| Package | Owns | Must not own |
|---|---|---|
| `@nuclear/shared-types` | pure contracts, opaque IDs, discriminated statuses and units | I/O, DOM, business behaviour or runtime dependencies |
| `@nuclear/rendering-presets` | declarative PET/CT/fusion/projection presets | UI state, shaders or patient data |
| `@nuclear/medical-engine` | DICOM-facing assets, geometry, Cornerstone adapter, worker bridge, RAM/VRAM residency and RenderTargets | workspace layout or React |
| `@nuclear/view-engine` | workspace, ViewSlots, PreparedViews, link/lock/override, view state, surface registry and resource demand | physical cache policy or UI chrome |
| `@nuclear/project-model` | `.ncp`, versioned schema evolution, source locator/fingerprint, cache preview and provenance | runtime rendering |
| `@nuclear/figure-engine` | sheets in mm, panels, annotations, framing/layout and publication composition | a second medical renderer |
| `@nuclear/ui` | design system, visual controls and surface hosts | slice math, geometry, render policy or GPU lifecycle |

`apps/desktop` is the final Electron composition root; `python/` is the
isolated scientific worker. Neither is an eighth domain package.

The intended dependency direction is acyclic:

```text
shared-types
   ↑       ↑          ↑
presets  medical-engine  project-model
             ↑              ↑
             └── view-engine ┘
                    ↑
              figure-engine
                    ↑
                   ui
                    ↑
              apps/desktop
```

`figure-engine` may ask a renderer port for a publication
`RenderTarget`; it must not reach into Cornerstone internals or become
the lifecycle owner of a viewport.

### Contract-first, headless-first

Before a UI exists, define and test the cross-boundary contracts:

```text
StudyReference              ImagingAsset
SourceLocator               SourceFingerprint
AssetAvailability           AssetResidency
AssetGeometry               SpatialTransform
DataBinding                 MedicalViewState
SpatialState                CameraState
PresentationState           ProjectionState
CompositionState            CoordinateTransformSet
ViewGroup                   ViewSlot
PreparedView                ViewportSurface
ResourceDemand              ComposerViewInstance
PanelFramingState           PanelLayoutState
PanelDecorationState        AnnotationAnchor
CachedPreview               PublicationRenderRequest
```

These need not all be classes. At Fase 1 they should normally be small
immutable values, discriminated unions or serializable DTOs with one
clear owner, explicit units, validators and fixtures.

“Headless-first” does not demand a fake CPU renderer. A controlled
DOM/WebGL harness is valid when required to exercise the real
Cornerstone path; what is forbidden before Fase 6 is a product UI that
becomes the accidental owner of domain behaviour.

### Coordinate and annotation contract

All code must preserve this chain:

```text
Patient Space (LPS, mm)
  ↓ SpatialState
View Plane
  ↓ CameraState + ProjectionState
Viewport Space (render pixels)
  ↓ PanelFramingState
Panel Content Space
  ↓ PanelLayoutState
Figure Sheet Space (mm)
```

Patient-anchored annotations retain their LPS anchor and are
reprojected during pan, zoom and slice changes. A declared plane
tolerance decides whether they are drawn, faded or hidden. Panel- and
sheet-anchored editorial objects — for example `A`, a `PET MIP` badge
or a layout arrow — remain fixed in their editorial coordinate space.
Screen pixels are never a persisted clinical anchor.

### Link, lock and comparison semantics

`LINK`, `LOCK`, and `OVERRIDE` are separate contracts.

- **Co-referenced/intra-study link:** views can share absolute LPS
  `SpatialState` only after matching `FrameOfReferenceUID` *and*
  verified direction cosines, spacing, origin and physical extent.
- **Relative/transformed/inter-study link:** longitudinal studies do
  not share absolute LPS. Link via a declared navigation differential
  or a provenance-bearing `SpatialTransform`; specify direction, units,
  tolerance and out-of-domain behaviour.
- **Lock:** protects a named portion of state such as spatial,
  presentation or framing state; it is not merely “disable mouse”.
- **Override:** is local to `ComposerViewInstance`, visible in the
  model and serializable. It never mutates a shared source view by
  accident.

### Semantic Lifetime vs Resource Residency

An asset or prepared view can exist for the lifetime of a `.ncp`
project while its pixels are absent from RAM and its textures absent
from VRAM.

```text
semantic reference → metadata → decoded CPU volume → GPU resources
```

`view-engine` declares demand and priority (`visible-interactive`,
`visible-read-only`, `prepared-hidden`, `prefetch-candidate`, `unused`).
`medical-engine` owns loading, sharing, budget, eviction and reload.
Eviction releases physical resources only; it never destroys a view's
semantic identity. An online source may be non-resident; an
offline-cached source may have no live volume at all.

### Persistent surfaces are not contexts

```text
up to 16 ViewSlots
  ↓ dynamic binding
up to 16 Persistent ViewportSurfaces
  ↓ Cornerstone RenderingEngine
WebGL Context Pool (backend-owned N contexts)
```

`ViewportSurfaceRegistry` keeps stable `surfaceId`/`viewportId` and
`SurfaceLayoutManager` places those surfaces in Viewer or Composer.
The implementation may use portal, overlay or reparenting; it must not
create a second Viewer/Composer collection, hard-code sixteen WebGL
contexts, or couple view-engine to React/DOM.

### Scientific worker boundary

The Python worker is the centralized, **technically validated** source
for DICOM classification, SUVbw, geometry checks, resampling and
registration. “Validated” means procedure, fixture and test coverage;
it does not claim regulatory certification.

`ScientificWorkerBridge` exposes versioned requests/responses,
provenance, warnings and failures. TypeScript does not duplicate a
scientific formula or geometry rule already assigned to Python. Missing
quantitation or incompatible geometry is an explicit result, never a
plausible-looking fallback.

### Offline-safe `.ncp`

Persist separately:

```text
project metadata/schema/provenance
SourceLocator[] + SourceFingerprint[]
ImagingAsset / PreparedView / Composer state
CachedPreview[] + render-state hashes
Figure, annotations and publication settings
```

At open time:

```text
resolve locator
  ├── unreachable → valid CachedPreview? → offline-cached / missing
  └── reachable → fingerprint match? → loading → online / mismatch
```

Relink is explicit. A new locator does not overwrite the expected
fingerprint simply to make a different source appear valid. A cached
preview needs matching render-state hash and fingerprint set. `missing`,
`mismatch` and `offline-cached` are fail-closed for publication-grade
live medical rendering.

### Publication rendering

The export derives pixels from panel mm and requested DPI, then renders
the same medical state into a temporary high-resolution RenderTarget.

```text
ComposerViewInstance → MedicalViewState → same renderer
  → temporary high-resolution RenderTarget → medical raster
  → flattened TIFF/PNG OR hybrid vector PDF
```

The temporary target must not resize or permanently alter the live
interactive canvas, camera or aspect ratio. It is released afterward.
Output provenance records dimensions, DPI, color profile and renderer
version.

### Phased delivery plan

| Fase | Deliverable | Explicitly excluded | Evidence to exit |
|---|---|---|---|
| 0 | docs, directives, package topology, honest tooling baseline | medical implementation | master docs agree; Git exists before first commit |
| 1 | contracts, validators, fixture contracts | product UI | units/owner/status and round-trip tests |
| 2 | DICOM ingestion, geometry, SUVbw, Python bridge | GUI workflow | positive and negative worker fixtures |
| 3 | headless medical engine and resource manager | production UI | real renderer harness and explicit failures |
| 4 | view engine, surfaces, link/lock/override | UI chrome | intra/inter-study and residency tests |
| 5 | figure engine, high-res export, hybrid PDF | live desktop shell | no screenshot upscale; vectors preserved |
| 6 | UI mockups with fake surfaces | production GPU wiring | intents and status UX testable |
| 7 | desktop shell and production UI integration | unrelated PACS scope | UI composes, does not reimplement engines |

### Verification baseline

NuClear owns its acceptance evidence. For SUVbw, geometry,
preset/radiometry, resource lifecycle and persistence, record a curated
fixture, declared tolerance, expected result and provenance. No agent
may claim correctness without this evidence.

Gate status is one of **PASS**, **FAIL**, **NOT YET APPLICABLE**, or
**BLOCKED**. A missing runner, zero discovered tests, absent fixture, or
command that masks failures is never PASS.

------------------------------------------------------------------------

# Appendix A — Product Scope Catalogue (reference only)

The following workstreams remain useful for feature scope and future
acceptance criteria. Their sequence is superseded by §4.1 and must not
be used to justify UI-first implementation.

## Workstream A --- Foundation / Desktop Runtime

### Goal

Create the minimal reliable desktop application.

### Tasks

-   Electron bootstrap;
-   React + TypeScript;
-   development/build scripts;
-   macOS build;
-   Windows build;
-   secure Electron configuration;
-   preload bridge;
-   filesystem abstraction;
-   process abstraction;
-   application logging;
-   application versioning;
-   configuration directory;
-   project file loading/saving.

### Constraints

React code must not directly depend on Electron APIs.

Create an abstraction such as:

``` text
platform/
  filesystem
  process
  dialogs
  paths
```

Electron-specific code stays behind this boundary.

### Deliverable

A blank desktop application that: - launches on macOS; - launches on
Windows; - can open a local folder/file; - can save a test project; -
can report its version.

------------------------------------------------------------------------

# 6. Workstream B --- DICOM Ingestion

### Goal

Turn arbitrary clinical DICOM input into a predictable internal
representation.

### Input

Potential inputs: - folder; - folder containing multiple studies; -
ZIP; - DICOMDIR; - individual DICOM files.

### Tasks

-   scan files;
-   detect DICOM;
-   group by StudyInstanceUID;
-   group by SeriesInstanceUID;
-   identify modality;
-   identify PET vs CT;
-   identify localizer/scout;
-   detect relevant series;
-   expose metadata;
-   detect incomplete/inconsistent series;
-   provide user-friendly series selection.

### Python responsibilities

pydicom should handle: - DICOM metadata; - parsing; - anonymization; -
metadata validation.

SimpleITK may be used when image geometry or volume processing is
required.

### Deliverable

A study browser capable of showing:

``` text
Study
 ├── CT
 │    ├── diagnostic CT
 │    └── scout
 │
 └── PET
      └── PET whole body
```

------------------------------------------------------------------------

# 7. Workstream C --- Medical Viewer POC

This is the first critical technical milestone.

## POC objective

Load one real anonymized PET/CT study and successfully:

-   display CT;
-   display PET;
-   fuse PET + CT;
-   change CT window/level;
-   apply PET range;
-   apply PET colormap;
-   change slice;
-   zoom;
-   pan;
-   render using Cornerstone3D;
-   obtain the current viewport state;
-   obtain the rendered image/canvas.

No sophisticated UI is required.

## POC acceptance criteria

### A. DICOM loads reliably

A known anonymized PET/CT study must load.

### B. Fusion is geometrically correct

PET and CT must align according to DICOM geometry.

### C. PET display is controllable

The following must be explicitly controllable:

``` text
minimum display value
maximum display value
colormap/LUT
fusion opacity
```

### D. CT display is controllable

At minimum:

``` text
window
level
```

### E. Viewport state can be serialized

The application can produce a JSON representation of the current
viewport.

### F. Rendering can be captured

The application can obtain a raster representation from the rendering
pipeline without taking a screenshot of the entire UI.

------------------------------------------------------------------------

# 8. Workstream D --- Rendering Presets

Presets are a major product feature.

## CT presets

Initial examples:

``` text
Soft Tissue
Bone
Lung
Custom
```

Exact values must be configurable and documented.

## PET presets

PET display should use explicit numerical ranges.

Example conceptual model:

``` text
PET preset
{
  name
  minValue
  maxValue
  colormap
}
```

The exact values should not be hard-coded into arbitrary UI components.

## Preset principle

Never silently manipulate image appearance.

The application should say what it is doing:

``` text
PET: SUV 0–10
LUT: Rainbow
Fusion: 50%
```

The user must be able to override a preset.

## Shared preset registry

Rendering presets should have one source of truth:

``` text
rendering-presets/
  ct-presets
  pet-presets
  fusion-presets
```

Both UI and export use the same definitions.

------------------------------------------------------------------------

# 9. Workstream E --- FigureState Contract

Do not finalize the schema until the POC has demonstrated what
Cornerstone actually exposes and what must be abstracted.

The final contract should conceptually contain:

``` text
FigureProject
 ├── document
 ├── rendererInfo
 ├── template
 ├── canvas
 ├── panels[]
 ├── synchronizationGroups[]
 ├── annotations[]
 └── exportSettings
```

A panel should contain a medical viewport state plus editorial
information.

Conceptual example:

``` json
{
  "id": "panel-a",
  "viewport": {
    "type": "fusion",
    "orientation": "axial",
    "source": {
      "petSeriesUID": "...",
      "ctSeriesUID": "..."
    },
    "camera": {
      "focalPoint": [0, 0, 0],
      "position": [0, 0, 0],
      "viewUp": [0, 1, 0],
      "zoom": 1.4
    },
    "pet": {
      "range": [0, 10],
      "colormap": "..."
    },
    "ct": {
      "window": 400,
      "level": 40
    },
    "fusion": {
      "opacity": 0.5
    }
  },
  "locks": {
    "anatomicalPosition": true,
    "rendering": true,
    "framing": true
  }
}
```

This is conceptual, not yet the final schema.

------------------------------------------------------------------------

# 10. Workstream F --- Focus Point and Synchronization

This is one of the most important differentiating features.

## Focus Point

User clicks the lesion/anatomical structure.

The application stores a patient/world-coordinate focus point.

Example:

``` text
FocusPoint
{
  patientCoordinate: [x, y, z]
}
```

The application can then:

``` text
Center viewport on focus
```

and:

``` text
Center all selected panels on focus
```

## Synchronization levels

Do not treat synchronization as one boolean.

Possible levels:

``` text
Anatomical synchronization
Rendering synchronization
Framing synchronization
Slice synchronization
```

For example:

``` text
PET scale synchronized
CT window synchronized
anatomical focus synchronized
zoom NOT synchronized
```

This is much more useful than simply "link viewports".

------------------------------------------------------------------------

# 11. Workstream G --- Locking

Locking should preserve a state, not merely prevent mouse input.

Potential independent locks:

``` text
Position lock
Rendering lock
Framing lock
```

Example:

``` text
[✓] Anatomical position
[✓] Rendering
[ ] Framing
```

A locked panel can still potentially be moved as an editorial object
without changing the underlying medical viewport state.

This distinction must be preserved.

------------------------------------------------------------------------

# 12. Workstream H --- Figure Engine

The Figure Engine is responsible for editorial composition.

## Input

``` text
FigureProject
+
Rendered medical images
+
Vector annotations
```

## Output

``` text
PDF
TIFF
PNG
```

## Responsibilities

-   canvas dimensions;
-   physical units;
-   DPI;
-   panel geometry;
-   panel cropping;
-   panel ordering;
-   labels;
-   arrows;
-   circles;
-   text;
-   borders;
-   spacing;
-   margins;
-   vector PDF composition.

## Physical dimensions

The figure should be specified in physical dimensions.

Example:

``` text
Width = 180 mm
Height = 120 mm
Resolution = 600 DPI
```

Pixel dimensions are calculated:

``` text
pixels = mm / 25.4 * DPI
```

Do not define the publication figure primarily as "a 3000×2000 PNG".

------------------------------------------------------------------------

# 13. Workstream I --- Vector Annotation Layer

Initial annotation primitives:

-   text;
-   panel letters;
-   arrows;
-   line;
-   circle/ellipse;
-   rectangle;
-   measurement;
-   scale bar.

Annotations should be represented as structured objects, not burned into
screenshots.

Conceptual:

``` json
{
  "type": "arrow",
  "start": [x1, y1],
  "end": [x2, y2],
  "strokeWidth": 2,
  "headSize": 8
}
```

The coordinate system must be explicitly defined.

Do not mix: - viewport coordinates; - patient coordinates; - panel
coordinates; - figure coordinates.

------------------------------------------------------------------------

# 14. Workstream J --- Templates

Templates are central to the product.

Initial templates:

``` text
PET/CT 2×3
PET/CT 1×3
Single case 3-panel
MIP + axial + sagittal + fusion
Baseline vs follow-up
```

Later:

``` text
PSMA PET
FDG PET
DOTATATE PET
FAPI PET
Multi-case comparison
Treatment response
```

## Template philosophy

A template defines:

-   number of panels;
-   panel arrangement;
-   default viewport types;
-   default rendering presets;
-   labels;
-   spacing;
-   canvas proportions.

It must not contain patient-specific data.

------------------------------------------------------------------------

# 15. Workstream K --- UI/UX

The application should feel like a specialized scientific authoring
tool, not a PACS.

## Main areas

Conceptually:

``` text
+-------------------------------------------------------+
| File   Project   View   Figure   Export               |
+-------------------------------------------------------+
| Templates |        Figure Canvas          | Inspector |
|           |                              |           |
|           |      [A] PET/CT              | Rendering |
|           |                              | Focus     |
|           |      [B] PET/CT              | Lock      |
|           |                              | Annotation|
|           |                              |           |
+-------------------------------------------------------+
| Viewer tools / synchronization / navigation          |
+-------------------------------------------------------+
```

## UX principles

-   minimal clicks;
-   visible state;
-   no hidden rendering transformations;
-   undo/redo;
-   keyboard shortcuts;
-   drag-and-drop;
-   clear distinction between medical and editorial operations;
-   no accidental loss of a carefully selected lesion.

------------------------------------------------------------------------

# 16. Workstream L --- Publication Export

Export presets should eventually include journal-independent technical
presets.

Example:

``` text
PDF
TIFF
PNG
```

With:

``` text
Canvas width
Canvas height
DPI
font
line width
image interpolation
compression
```

Later, journal profiles can be added.

Example:

``` text
Journal Profile
{
  name
  maxWidth
  preferredDPI
  allowedFormats
  fontRules
  lineWidthRules
}
```

Do not hard-code individual journal requirements into the renderer.

------------------------------------------------------------------------

# 17. Workstream M --- Anonymization and PHI Safety

This is mandatory before clinical data can be distributed.

Potential pipeline:

``` text
DICOM input
    ↓
metadata inspection
    ↓
optional anonymization
    ↓
burned-in annotation detection
    ↓
working dataset
```

Requirements: - never modify original DICOM; - work on copies/derived
representations; - clearly show whether anonymization was performed; -
warn about potentially identifying burned-in pixel data; - retain
provenance.

This feature must be treated as a safety layer, not merely a
convenience.

------------------------------------------------------------------------

# 18. Workstream N --- Cross-Study Registration

This should not block the MVP.

Initial synchronization should use: - DICOM geometry; - manual focus
point; - manual viewport alignment.

Later:

``` text
Study A
   ↓
Study B
   ↓
registration
   ↓
transformation
   ↓
shared anatomical focus
```

SimpleITK can support registration workflows.

Possible future modes: - rigid; - affine; - deformable, only if
scientifically justified.

Automatic registration must never silently alter a publication figure.

The user must be able to inspect and override the transformation.

------------------------------------------------------------------------

# 19. Workstream O --- Testing and Validation

Testing must be divided into layers.

## Unit tests

Test: - FigureState serialization; - presets; - coordinate
transformations; - panel geometry; - DPI calculations; - project
loading/saving; - annotation geometry.

## Medical-data tests

Maintain a small anonymized test dataset.

Tests should cover: - PET; - CT; - PET/CT; - different orientations; -
known geometry; - edge cases.

## Rendering tests

### Test 1 --- Intra-application determinism

Same: - DICOM; - FigureState; - renderer version.

Repeated rendering should be stable.

### Test 2 --- Cross-platform rendering

Test at minimum: - one Mac; - one Windows machine.

Do not require absolute pixel identity as the initial requirement.

Measure: - image differences; - LUT consistency; - geometry; - visible
edges; - numerical range; - clinically relevant appearance.

### Test 3 --- Lock -\> export fidelity

The exported panel must correspond to the locked viewport state.

This is a critical acceptance test.

------------------------------------------------------------------------

# 20. Reproducibility

The `.ncp` project file is a first-class artifact.

Conceptually:

``` text
project.ncp
```

It should contain: - schema version; - application version; - renderer
version; - templates; - FigureState; - annotations; - export settings; -
references to source studies; - optionally thumbnails.

Original DICOM should preferably remain external/read-only.

The project should reference DICOM through stable identifiers and/or
controlled local paths rather than silently duplicating clinical data.

A future portable project mode may embed derived/anonymized data if
explicitly enabled.

------------------------------------------------------------------------

# 21. Standard Repository Structure

``` text
nuclear/
│
├── apps/
│   └── desktop/                  # Electron desktop container (Main process & Preload bridge)
│
├── packages/
│   ├── shared-types/             # Cross-boundary type definitions, DTOs & contracts
│   ├── rendering-presets/        # Standardized CT & PET clinical presets & gamma curves
│   ├── medical-engine/           # Headless Cornerstone3D volume rendering, residency & Python bridge
│   ├── view-engine/              # Imaging Workspace, ViewSlots, PreparedViews, linking & surfaces
│   ├── figure-engine/            # Layout composition, panel framing/layout & publication export
│   ├── project-model/            # NuClear project schemas (.ncp) & offline persistence
│   └── ui/                       # Modular React application UI (Components, Hooks, Theme CSS)
│
├── python/                       # Scientific worker (pyproject.toml, pydicom, SUV calculations)
│   ├── dicom/                    # DICOM parsing, geometry validation, SUVbw factors
│   └── worker/                   # Local stdio JSON-RPC 2.0 daemon
│
├── tests/
│   ├── contracts/                # Pure TypeScript contract and validator tests
│   ├── medical/                  # Headless Cornerstone3D & Python IPC integration tests
│   ├── rendering/                # Headless render target & high-res export tests
│   ├── project/                  # Serialization, migration adapter & round-trip tests
│   └── fixtures/                 # Anonymized DICOM test cases and declared expected outputs
│
├── docs/
│   ├── PROJECT_VADEMECUM.md      # Master blueprint & AI agent development guide
│   ├── NUCLEAR_ARCHITECTURE_V3.md# Architectural blueprint v3 (Imaging Workspace, View & Figure Engines)
│   ├── decisions/                # Architecture Decision Records (ADRs)
│   └── api/                      # Generated TypeDoc HTML documentation
│
├── .agents/                      # Agent directives, rules, and runbook skills
├── .opencode/                    # opencode agent topology and commands
├── package.json                  # Root monorepo workspace orchestration
└── tsconfig.base.json            # Central TypeScript configuration
```

Boundaries between responsibilities are strictly preserved and symmetric across npm workspaces.

------------------------------------------------------------------------

# 22. AI Agent Rules

Every coding agent working on this project should follow these rules.

## Rule 1 --- Read the architecture before coding

Do not introduce a new library or architectural layer without checking
this document.

## Rule 2 --- Do not duplicate sources of truth

Examples:

Bad:

``` text
PET preset in React
PET preset in Python
PET preset in exporter
```

Good:

``` text
shared rendering preset definition
        ↓
React
Cornerstone
export
```

## Rule 3 --- Do not make Python the medical renderer

Never add Python rendering merely because it is convenient.

## Rule 4 --- Do not bypass FigureState

UI components should not create hidden medical rendering state that
cannot be serialized.

## Rule 5 --- Do not hard-code patient-specific information

Templates and rendering presets must remain patient-independent.

## Rule 6 --- Do not implement features outside the current workstream without approval

Agents should avoid opportunistic refactors.

## Rule 7 --- Preserve backward compatibility of project files

Any FigureState/schema change requires: - schema version; - migration
strategy; - tests.

## Rule 8 --- Prefer explicit state over implicit UI state

If something matters for reproducibility, it must exist in the data
model.

## Rule 9 --- Do not use screenshots as the canonical figure representation

Screenshots are debugging/preview artifacts, not the source of truth.

## Rule 10 --- Every important architectural decision should be documented

Use a lightweight Architecture Decision Record (ADR).

Example:

``` text
ADR-001: Electron instead of Tauri for v1
ADR-002: Cornerstone3D as medical rendering source of truth
ADR-003: Python as local processing worker
ADR-004: Vector annotations in PDF
```

------------------------------------------------------------------------
# 23. Documentation & Code Quality Standard

Documentation is an integral part of the product and must evolve alongside the code.

The repository must be self-contained and immediately understandable to a new human developer or AI agent without relying on conversation history.

## TypeScript

Use **TSDoc** as the standard for documenting TypeScript code.

When useful, use **TypeDoc** to generate API documentation.

All significant public or exported elements must be documented:
- functions;
- classes;
- interfaces;
- types;
- services;
- hooks;
- modules / core APIs.

Documentation must explain, where relevant:
- purpose;
- parameters;
- return value;
- side effects;
- errors and exceptions;
- invariants;
- coordinate systems;
- units of measurement;
- medical imaging or image-processing assumptions.

## Python

Use consistent docstrings, preferably **Google-style** or **NumPy-style**, combined with strict type hints.

## Code Comments

Code must be well-commented, but comments must primarily explain the **why**, not merely restate the code.

Example to avoid:

```ts
// Set opacity to 0.5
opacity = 0.5
```

Preferred:

```ts
// Keep opacity in the serialized rendering state so the locked viewport
// can be reproduced identically during publication rendering.
opacity = preset.fusionOpacity
```

Do not add obvious or redundant comments merely to increase documentation volume.

## Interaction Documentation

Documentation must cover interactions between components, not just isolated functions.

For every significant architectural boundary, document:

* who calls whom;
* what data crosses the boundary;
* which component is the source of truth;
* what state is modified;
* which invariants must be preserved;
* what errors can propagate.

Use Mermaid diagrams for complex flows.

In particular, the following interactions must be documented:

* DICOM ingestion;
* DICOM → Cornerstone;
* Cornerstone → ViewportState;
* viewport synchronization;
* focus point;
* locking;
* FigureState;
* FigureState → rendering;
* rendering → Figure Composer;
* Python IPC;
* export.

## Architecture Decision Records

Every significant architectural change must produce or update an ADR in:

`docs/decisions/`

An ADR must explain:

* context and problem statement;
* alternatives considered;
* decision made;
* rationale;
* consequences and trade-offs;
* conditions that might warrant a revision.

## Documentation Definition of Done

A feature is not considered complete if the code runs but necessary documentation has not been updated.

For every significant feature, the agent must verify whether the following are required:

* TSDoc / docstrings;
* module documentation;
* interaction diagrams;
* updates to architecture documentation;
* ADR;
* tests;
* development notes / changelog.

Documentation must be updated in the same task or commit as the implementation whenever possible.

## Repository Artifacts & Git Governance

### In-Repo Documentation vs. Wiki

All authoritative project documentation must live in-tree within the `docs/` directory.

* **Single Source of Truth:** Markdown files in `docs/` are version-controlled alongside code, modified atomically in pull requests, and directly readable/editable by AI agents and developers.
* **GitHub Wiki Policy:** An external GitHub Wiki must **not** be used as a primary documentation store, as it cannot be tracked atomically within code branches and is disconnected from versioning. If an external wiki or portal is ever deployed, it must only be an automated read-only export of in-repo documentation.

### README.md Policy

The root `README.md` is the public front door of the project.

* It must provide: product purpose, target problem, current development status, tech stack summary, quickstart instructions for local setup/testing, and clear links to the detailed guides in `docs/`.
* It must **not** duplicate in-depth architectural specifications or contracts from `PROJECT_VADEMECUM.md` to avoid documentation drift.

### CHANGELOG.md, AgentLog & Versioning

The project adheres to the [Keep a Changelog](https://keepachangelog.com/) standard and [Semantic Versioning](https://semver.org/) (SemVer), implemented through a **Two-Tier Changelog & Handover System** (see [`ADR-001`](decisions/ADR-001-two-tier-changelog-and-agentlog.md)):

1. **Machine / AI Tier (`docs/agentlog/phase-<N>.md`)**:
   - Each phase/milestone maintains its dedicated handover log (e.g. `docs/agentlog/phase-0.md`, `phase-1.md`).
   - Every completed task slice or phase MUST persist the verbatim 8-point **Mandatory Handover Report** (§30.2) into this file.
   - Contains exhaustive, fine-grained technical evidence: exact file paths, commit references, formulas, test assertion results, and technical debt.

2. **Human / Release Tier (`CHANGELOG.md`)**:
   - Root `CHANGELOG.md` maintains an active `## [Unreleased]` section at the top, frozen on official releases (`v0.1.0`, etc.).
   - Governed strictly by the **Changelog Style Contract**:
     - **Prohibited**: internal file paths, line numbers, git commit hashes, internal task/slice codes (`Phase 1.1`, `M5-04`), and internal function/variable symbols.
     - **Required**: one concise bullet per user-facing or architectural capability.
     - **Consolidation**: intermediate, superseded changes within the same phase or release window must be synthesized into a single coherent entry.
     - **Categories**: standard Keep a Changelog headings (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`).
   - **Delegation**: compilation and promotion of `CHANGELOG.md` is delegated to the `nuclear-changelog-writer` subagent (invoked via `/promote-changelog`).

### Git & GitHub Workflow Standards

* **Conventional Commits:** All git commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
  ```text
  <type>(<scope>): <short description>
  ```
  Allowed types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`.
  Examples:
  - `feat(viewer): implement initial Cornerstone3D PET/CT fusion viewport`
  - `docs(vademecum): add repository governance and changelog standards`
  - `fix(dicom): handle missing rescale slope and intercept gracefully`
* **Branching Strategy:**
  - `main`: Protected trunk, always compilable, tested, and releasable.
  - Feature & task branches: Use branch naming `task/<workstream>-<description>` (e.g. `task/ws-c-cornerstone-poc`) or `agent/<feature>`.
* **Atomic Pull Requests:** PRs must bundle the implementation, unit/regression tests, documentation updates, and the corresponding `CHANGELOG.md` entry.

## AI Agent Documentation Discipline

Every AI coding agent must:

1. Read existing documentation before modifying a subsystem.
2. Maintain existing documentation conventions.
3. Document every new public API.
4. Document non-obvious internal interactions.
5. Explicitly state assumptions regarding DICOM, geometry, rendering, and image processing.
6. Update diagrams whenever the data flow changes.
7. Create an ADR for significant architectural decisions or changes.
8. Persist the mandatory handover report in `docs/agentlog/phase-<N>.md` upon completing any phase or slice; compile `CHANGELOG.md` via the changelog promotion workflow.
9. Never declare a feature "documented" or "tested" if it is not actually so.
10. Explicitly report any technical debt introduced.
11. Leave the repository self-contained and understandable to the next AI agent without requiring conversation memory.

------------------------------------------------------------------------


# 24. Recommended Agent Specialization

Instead of asking one AI agent to build everything, use specialized
agents sequentially.

## Agent 01 --- Architect / Repository Bootstrapper

Responsible for: - repository; - Electron; - React; - TypeScript; -
Python environment; - build system; - conventions; - platform
abstraction.

Output: - clean runnable skeleton.

## Agent 02 --- DICOM Specialist

Responsible for: - DICOM ingestion; - study/series grouping; -
metadata; - PET/CT identification; - test fixtures.

Output: - reliable study representation.

## Agent 03 --- Cornerstone Specialist

Responsible for: - Cornerstone3D; - PET; - CT; - fusion; - MPR/MIP; -
rendering; - viewport state extraction.

Output: - validated Medical Renderer POC.

## Agent 04 --- Rendering Preset Specialist

Responsible for: - CT presets; - PET LUT/range; - fusion settings; -
shared preset registry.

Output: - deterministic rendering configuration.

## Agent 05 --- Figure Model Architect

Responsible for: - FigureProject; - FigureState; - Panel; -
ViewportState; - locks; - synchronization; - schema versioning.

Must work only after the POC is sufficiently validated.

## Agent 06 --- Synchronization / Geometry Specialist

Responsible for: - world coordinates; - focus point; - centering; -
viewport synchronization; - framing; - later registration interfaces.

## Agent 07 --- Figure Composer Specialist

Responsible for: - panel composition; - canvas; - raster placement; -
vector annotations; - PDF; - TIFF; - PNG.

Must not implement a second PET/CT renderer.

## Agent 08 --- Template Specialist

Responsible for: - template schema; - initial templates; - template
editor/import; - reusable layouts.

## Agent 09 --- UI/UX Specialist

Responsible for: - application layout; - interactions; - inspector; -
toolbars; - shortcuts; - user flow; - visual consistency.

## Agent 10 --- QA / Validation Specialist

Responsible for: - automated tests; - rendering regression tests; -
cross-platform tests; - export tests; - test datasets; -
reproducibility.

## Agent 11 --- Packaging / Distribution Specialist

Responsible for: - electron-builder; - macOS build; - Windows
installer; - code signing strategy; - update strategy; - dependency
packaging.

------------------------------------------------------------------------

# 25. Development Sequence

This sequence is superseded. Use the Fase 0–7 plan in §4.1.

The decisive ordering rules remain:

1. contract and fixture before implementation;
2. scientific worker and medical engine before a product UI;
3. view/figure engines before Electron wiring;
4. UI mockup before production interaction layer;
5. renderer-backed high-resolution export before any claim of
   publication readiness.

Do not invert this order by building the complete UI before the
rendering/data contract is validated.

------------------------------------------------------------------------

# 26. MVP Definition

The first usable product should be able to do exactly this:

### Input

One or more local anonymized PET/CT studies.

### Processing

-   import DICOM;
-   identify PET/CT;
-   render PET/CT;
-   apply rendering presets;
-   navigate;
-   choose focus point;
-   synchronize selected panels;
-   lock viewports.

### Authoring

-   select template;
-   create panels;
-   arrange panels;
-   add A/B/C labels;
-   add arrows;
-   add circles;
-   add text.

### Output

-   PDF;
-   TIFF;
-   PNG.

### Reproducibility

-   save `.ncp`;
-   reopen `.ncp`;
-   reproduce the figure.

If these capabilities work reliably, the project has achieved its core
purpose.

------------------------------------------------------------------------

# 27. Features Explicitly Deferred

Do not allow these to destabilize the MVP:

-   cloud collaboration;
-   PACS integration;
-   DICOMweb;
-   remote server architecture;
-   enterprise user management;
-   automatic AI lesion detection;
-   automatic figure generation from a manuscript;
-   deformable registration;
-   complex segmentation;
-   general-purpose 3D modeling;
-   full diagnostic PACS functionality;
-   automatic journal submission.

These may become future products/features, but they are not required to
validate the central concept.

------------------------------------------------------------------------

# 28. Critical Technical Risks

## Risk 1 --- Cornerstone export/rendering limitations

Mitigation: - validate offscreen/high-resolution rendering during POC; -
never build the Figure Engine around screenshots.

## Risk 2 --- Cross-platform GPU differences

Mitigation: - Electron fixed Chromium; - renderer version pinned; -
cross-platform regression tests; - define tolerances rather than
requiring universal pixel identity.

## Risk 3 --- DICOM geometry complexity

Mitigation: - use DICOM geometry as the authoritative source; - isolate
geometry code; - create known test cases.

## Risk 4 --- PET numerical interpretation

Mitigation: - never infer clinical meaning from display settings; -
clearly distinguish raw stored values from display values; - document
SUV-related transformations; - validate against known datasets.

## Risk 5 --- Export divergence

Mitigation: - use the same medical renderer for preview and final
medical raster; - Figure Composer only composes; - lock state is
serializable.

## Risk 6 --- Architecture drift caused by AI agents

Mitigation: - this document; - ADRs; - workstream boundaries; -
mandatory tests; - no undocumented architectural changes.

------------------------------------------------------------------------

# 29. The Central Data Flow

Everything should ultimately reduce to:

``` text
                  DICOM
                    │
                    ▼
             Study / Series
                    │
                    ▼
              Viewport State
                    │
        ┌───────────┴───────────┐
        │                       │
   interactive             reproducible
     preview                   state
        │                       │
        └───────────┬───────────┘
                    ▼
              Locked Panel
                    │
                    ▼
              Figure Model
                    │
        ┌───────────┴───────────┐
        │                       │
      raster                  vectors
   Cornerstone             SVG-like data
        │                       │
        └───────────┬───────────┘
                    ▼
              Figure Composer
                    │
            ┌───────┼───────┐
            ▼       ▼       ▼
           PDF     TIFF     PNG
```

This is the conceptual backbone of the entire application.

------------------------------------------------------------------------

# 30. Definition of Done for Any AI Agent

An agent's task is not complete merely because the code runs.

A task is considered **Done** only when all quality, architectural, and documentation criteria are satisfied, and a structured handover report is provided.

## 30.1 Completion Checklist

Before declaring work complete, the agent must ensure that:

1.  **Functional verification & tests:** The implementation runs reliably without regressions, automated tests (unit, integration, or rendering) are written and passing, and manual verification steps are documented.
2.  **Architectural compliance:** Core principles are strictly respected (Cornerstone3D as the sole medical rendering source of truth, Python as scientific worker, FigureState reproducibility); no unauthorized architectural drift or duplicated sources of truth occur.
3.  **High-value code comments:** Comments explain the **why** and intent behind non-obvious code, rather than merely paraphrasing the syntax.
4.  **API & interaction documentation:** All new or modified public APIs have comprehensive TSDoc/docstrings; cross-component interactions are documented, and data flow diagrams (Mermaid) are updated if flows changed.
5.  **Architectural decisions recorded (ADRs):** Any significant architectural decision, change, or trade-off is recorded in `docs/decisions/`.
6.  **Agentlog & commit hygiene:** The mandatory 8-point Handover Report is persisted verbatim in `docs/agentlog/phase-<N>.md`, and commits follow Conventional Commits. `CHANGELOG.md` is updated strictly via the Changelog Style Contract when promoting a release.
7.  **Project model evolution:** Any `.ncp` schema change is versioned and has round-trip tests. A migration layer is introduced only after NuClear has shipped an earlier schema that it explicitly chooses to support.
8.  **Repository self-sufficiency:** The repository and documentation are entirely self-contained, allowing any subsequent AI agent or human developer to understand and build upon the work without requiring past conversation history.

## 30.2 Mandatory Handover Report

Before handing off work to the next agent or human developer, the agent must persist verbatim in `docs/agentlog/phase-<N>.md` a structured summary containing:

1.  **What was implemented:** A concise overview of the features, fixes, or refactors completed.
2.  **Files changed:** Complete list of created, modified, or deleted files.
3.  **Architectural assumptions made:** Clear technical rationale and confirmation of architectural boundary adherence.
4.  **Tests added & executed:** Test suites added, test commands executed, and verification outcomes.
5.  **Documentation, Agentlog & ADR status:** Confirmation of updated docs, diagrams, `docs/agentlog/phase-<N>.md` entry, and newly created or updated ADRs.
6.  **Project model impact:** Any changes required for `FigureState`, schemas, or serialized state contracts.
7.  **Known limitations & technical debt:** Explicit disclosure of edge cases, temporary shortcuts, or deferred tasks.
8.  **Exact next recommended task:** The single, concrete, prioritized task for the next agent or developer.

Agents must NEVER dump this raw handover report into `CHANGELOG.md` (see [`ADR-001`](decisions/ADR-001-two-tier-changelog-and-agentlog.md)). `CHANGELOG.md` is reserved exclusively for distilled, user-facing release notes.
Agents must not silently change architecture.

------------------------------------------------------------------------

# 31. First Concrete Milestone

The immediate next milestone is intentionally small:

> **Electron + React + TypeScript application containing one
> Cornerstone3D viewport that loads one known anonymized PET/CT study,
> displays fused PET/CT, applies explicit CT/PET rendering settings, and
> can serialize the viewport state and retrieve the rendered raster.**

Nothing else is required for the first milestone.

Once this passes, freeze the first version of the medical-rendering
contract and move to `FigureState`.

------------------------------------------------------------------------

# 32. Final Product Philosophy

The product should ultimately feel like:

> **NuClear: the scientific figure authoring workstation for nuclear medicine --- built from DICOM,
> designed for PET/CT.**

Not Canva with a DICOM viewer attached.

Not a PACS with an export button.

Not Slicer with a prettier interface.

The distinctive value is the complete reproducible chain:

``` text
Clinical DICOM
      ↓
Standardized medical rendering
      ↓
Anatomically synchronized viewports
      ↓
Locked reproducible states
      ↓
Editorial panels
      ↓
Vector annotations
      ↓
Publication-ready figure
```

The application succeeds when the user can go from:

> **"I need a figure for this paper."**

to:

> **"Here is the final publication-ready figure."**

without spending two hours manually synchronizing PACS screenshots,
exporting individual images, and assembling them in a generic graphics
editor.

------------------------------------------------------------------------

# Appendix B — Viewer ↔ Composer duality

The old “dual state” wording is replaced by the v3 model:

- a `ComposerViewInstance` binds a `PreparedView` plus declared local
  overrides; it does not become the owner of a GPU viewport;
- a Viewer or Composer can host the same persistent
  `ViewportSurface` through `SurfaceLayoutManager`;
- interaction creates explicit state changes which are committed to the
  relevant source view or local override according to `EditScope`;
- `ViewportSurface` identity is stable, while Cornerstone's Context Pool
  remains the owner of the actual WebGL contexts.

The former `slot-study-*` examples and the reference to an uncreated
ADR-005 are intentionally not normative. See v3 §§8, 17, 21, 23 and 26
for the definitive behaviour.
