# Rule 02: Monorepo Architecture & Package Ownership

## 1. Package Ownership Matrix

| Package | Role & Responsibility | Permitted Internal Dependencies | Prohibited Inclusions |
| :--- | :--- | :--- | :--- |
| **`@nuclear/shared-types`** | Pure TypeScript contracts, interfaces, enums, opaque IDs (`RowId`, `CellId`, `SurfaceId`, `ViewId`). | *None* (Leaf package) | Zero runtime code, zero external dependencies. |
| **`@nuclear/rendering-presets`** | Declarative presets: PET colormaps, CT W/L, fusion curves ($\gamma = 0.42$), VOI. | `@nuclear/shared-types` | Zero UI/DOM code, zero WebGL/rendering logic. |
| **`@nuclear/medical-engine`** | Headless Cornerstone3D volume rendering, resource residency manager, volume streaming, temporary high-res RenderTargets, and Python ScientificWorkerBridge. | `@nuclear/shared-types`, `@nuclear/rendering-presets` | Strictly UI-agnostic: NO React, NO JSX, NO workspace layout decisions. |
| **`@nuclear/view-engine`** | Imaging Workspace, ViewSlots, ViewGroups, PreparedViews, spatial/camera/presentation/composition states, surface registry, linking, locks, and residency demand declaration. | `@nuclear/shared-types`, `@nuclear/rendering-presets`, `@nuclear/medical-engine` | Strictly UI-agnostic: NO React, NO direct DOM chrome. |
| **`@nuclear/project-model`** | Persistence of NuClear `.ncp` projects, source locators/fingerprints, cached previews, and versioned schema evolution. | `@nuclear/shared-types`, `@nuclear/rendering-presets` | NO runtime rendering dependencies. |
| **`@nuclear/figure-engine`** | Figure layout, paper sheets (mm), panel framing/layout states, typography, annotations (patient & editorial), vector composition, and publication export orchestration. | `@nuclear/shared-types`, `@nuclear/rendering-presets`, `@nuclear/project-model`, `@nuclear/view-engine` | Strictly UI-agnostic: NO React components; pure calculation, composition, and export logic. |
| **`@nuclear/ui`** | Pure visual presentation layer: design system, visual tokens, generic controls, toolbars, inspector primitives, surface mount containers. | `@nuclear/shared-types`, `@nuclear/view-engine`, `@nuclear/figure-engine`, `@nuclear/project-model` | ZERO domain logic: does not compute slice math, does not define fusion rules, does not manage WebGL contexts. Principle: "Render state, emit intent." |
| **`apps/desktop`** | Electron main process, window shell, application lifecycle, preload bridge, Python process supervision, and filesystem IPC. | `@nuclear/ui`, `@nuclear/view-engine`, `@nuclear/figure-engine`, `@nuclear/medical-engine` | Do not place reusable UI components or domain algorithms directly in the desktop shell. |
| **`python/` (`nuclear-scientific`)** | Scientific worker: DICOM parsing, geometry verification, FrameOfReferenceUID check, resampling, registration, and quantitative SUVbw calculations. | Isolated Python environment (PEP 621) | Direct IPC boundary with Electron; zero Node.js/DOM dependencies. |

## 2. Acyclic Dependency Graph

Dependencies must strictly follow this acyclic hierarchy:

```text
                     shared-types (Leaf)
              ▲               ▲                ▲
              │               │                │
      rendering-presets  project-model   medical-engine
              ▲                                ▲
              │                                │
              └───────────────┬────────────────┘
                              │
                         view-engine
                              │
                        figure-engine
                              │
                              ui
                              │
                         apps/desktop
```

### Agent Operational Directives
- **IF** adding or modifying package imports:
- **THEN** verify that dependencies are strictly acyclic and conform to the ownership matrix above.
- **NEVER** introduce circular dependencies or reverse imports (e.g. `medical-engine` importing `view-engine`, or `view-engine` importing `ui`).

## 3. Component Sizing, Directory Hygiene & Universal File Limits
- **Universal File Size Limit**: No source file (TypeScript, Python, React) across any package in the monorepo may exceed **250–300 lines**.
- **Controllers, Engines & God Objects**:
  - If a class, controller, or module exceeds 250 lines or accumulates more than 2 distinct responsibilities, it is **MANDATORY** to decompose it by adopting the Facade pattern or extracting isolated functional modules before considering the task completed.
  - **Prohibition of God Objects**: It is strictly forbidden to group DOM/WebGL management, mathematical calculations, mouse event handling, and state serialization into a single monolithic class.
- **Orchestrator Components**: **IF** an orchestrator component (such as `App.tsx`) approaches 150 lines, **THEN** decompose it into atomic subcomponents under `components/` and state logic under `hooks/`.
