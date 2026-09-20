# Phase 3 — Headless Medical Engine, Residency & RenderTarget

## Objective

Deliver the first real NuClear medical-rendering path in
`@nuclear/medical-engine`, behind a UI-agnostic facade. It consumes the
accepted Phase 2 worker results and the Phase 1 contracts to load a verified
CT or PET volume, manage its physical residency, render it through
Cornerstone3D, and obtain a temporary high-resolution medical raster.

```text
ImagingAsset + verified worker evidence + ResourceDemand
  -> medical-engine
     -> Cornerstone adapter -> controlled WebGL 2 harness -> raster
     -> ResourceManager   -> CPU / GPU residency
     -> temporary RenderTarget -> publication-ready medical raster
```

“Headless” here means **no product UI owns the behaviour**. It does not mean
a fake CPU renderer or an untested Node-only substitute: a controlled
DOM/WebGL 2 harness is required to exercise the actual Cornerstone path.

## Phase Entry Conditions

- Phase 2 is closed at `e59e748`; the `ScientificWorkerBridge` is the only
  TypeScript consumer of the scientific-worker protocol.
- P3.0 must establish a reproducible WebGL 2-capable test environment before
  any renderer claim is accepted. If the host cannot provide it, record
  `BLOCKED` rather than replacing Cornerstone with Canvas or CPU rendering.
- `SourceLocator`, `ImagingAsset`, `AssetGeometry`, `MedicalViewState`,
  `ResourceDemand`, residency tiers and `TemporaryRenderTargetSpec` remain
  the starting contracts. A new public cross-package contract requires an
  explicit need, validation and an ADR when it changes an architectural
  boundary.

## In Scope

- Cornerstone3D dependency selection, initialization and a UI-agnostic
  adapter owned solely by `@nuclear/medical-engine`.
- Explicit, verified loading of pixel-bearing local CT/PT test sources into
  Cornerstone volumes. Metadata and geometry remain authoritative from the
  Phase 2 Python worker; TypeScript must not reinterpret DICOM geometry or
  calculate SUVbw.
- A `ResourceManager` that accepts declared `ResourceDemand` and manages
  source/CPU/GPU residency, budget accounting, eviction and reload.
- Applying an already-defined `MedicalViewState` to the same renderer path
  used for regular rendering and temporary targets.
- A temporary, offscreen high-resolution medical `RenderTarget` primitive
  with a native pixel buffer and explicit disposal.
- Reproducible synthetic pixel-bearing fixtures and controlled WebGL
  integration evidence.

## Explicitly Excluded

- Product UI, React, Electron shell, mouse tools, DOM chrome and application
  workflow.
- `ViewSlot`, `ViewportSurface`, surface registry, Viewer/Composer placement,
  links, locks and local overrides (Phase 4).
- Figure-sheet layout, annotations, TIFF/PNG composition and hybrid PDF
  assembly (Phase 5). P3 exposes only the medical raster primitive.
- Resampling, registration and new scientific algorithms. Those remain Python
  worker work and require a later scoped phase/protocol operation.
- DICOMweb, PACS, cloud transports, legacy import and broad source discovery.

## Architectural Invariants

1. **Cornerstone3D is the sole medical renderer.** No second shader pipeline,
   Canvas approximation or Python rasterizer may be introduced.
2. **One rendering path, distinct physical targets.** Interactive rendering
   and temporary high-resolution rendering apply the same medical state and
   renderer semantics, but a publication target must never resize, mutate or
   reuse a live canvas as its physical target.
3. **Semantic lifetime is not resource residency.** `ImagingAsset` and
   `PreparedView` references never pin decoded arrays, volumes or VRAM.
   `ResourceManager` alone controls load, share, evict and reload transitions.
4. **Availability is independent of residency.** `missing`, `mismatch` and
   `offline-cached` fail closed for live volume rendering. An online asset may
   still be evicted; a cached preview is not a live medical volume.
5. **Demand is declarative.** Future `view-engine` code declares priority and
   requested tiers; medical-engine does not invent workspace policy or infer
   clinical intent from surface/UI state.
6. **No duplicated clinical science.** Geometry, Frame of Reference evidence,
   PET scaling and SUVbw come from the `ScientificWorkerBridge`; the renderer
   consumes validated values without recomputation.
7. **No invented presentation defaults.** PET/CT fusion blending curves ($\alpha = (s/100)^{0.42}$), transfer functions (`getPETOpacityMapping` for `"highlighted"` and `"alpha"` modes), and CT/PET display ranges must strictly conform to [PET_CT_FUSION_RADIOMETRY_SPEC.md](PET_CT_FUSION_RADIOMETRY_SPEC.md).
   CT window/level, PET range, colormap and blending defaults require a
   declared, tested preset; P3 must not silently choose clinical values.
8. **Context count is backend-owned.** P3 must not equate a future surface or
   logical slot with a WebGL context. Cornerstone's context-pool strategy is an
   implementation detail.

## Delivery Slices

| Slice | Owner | Deliverable | Acceptance evidence |
| --- | --- | --- | --- |
| P3.0 | orchestrator + engine engineer | Rendering feasibility baseline: selected Cornerstone packages/versions, reproducible controlled WebGL 2 harness, pixel-bearing fixture policy and any required ADR | The actual renderer initializes or the slice is `BLOCKED`; dependency graph and environment facts are documented; no fake renderer is reported as PASS |
| P3.1 | engine engineer | Narrow Cornerstone adapter lifecycle: initialization, injected runtime host, typed errors and clean teardown | Real harness starts/stops twice without leaked engine state; absent WebGL/initialization failure is explicit and actionable |
| P3.2 | engine engineer | Explicit series-to-volume loading from an accepted `ImagingAsset` and Phase 2 evidence | Synthetic CT and PT pixel-bearing sources load through Cornerstone; wrong locator, unsupported classification, missing/mismatch availability and geometry disagreement fail closed |
| P3.3 | engine engineer | `ResourceManager` residency state machine, demand reconciliation, budget accounting, eviction and on-demand reload | Tests prove declared-priority ordering, shared-volume accounting, eviction without semantic deletion, reload, and budget/loader failure dispositions |
| P3.4 | engine engineer | Medical-state application and ordinary renderer raster capture through the adapter conforming to [PET_CT_FUSION_RADIOMETRY_SPEC.md](PET_CT_FUSION_RADIOMETRY_SPEC.md) | Known CT/PT state is applied through Cornerstone; state/provenance are preserved; invalid state or unavailable residency cannot produce a plausible raster |
| P3.5 | engine engineer | Temporary high-resolution `RenderTarget` primitive | Exact pixel dimensions follow `(mm / 25.4) * DPI`; 300/600 DPI capture uses the same state, leaves live target dimensions/camera untouched, returns native-size pixels and releases temporary GPU resources |
| P3.6 | reviewer + QA | Independent phase review, renderer-harness gates and final handover | Real adapter/harness tests, resource tests, source integrity, docs generation and an eight-point AgentLog report are recorded |

P3.0 may split only the environment/probe work from dependency installation;
do not begin P3.1 until a real renderer capability is known. P3.5 is a
medical-raster capability, not a claim that Figure Engine export is complete.

## Fixture and Test Policy

- Commit minimal, programmatically reproducible pixel-bearing DICOM fixtures;
  their pixel representation, dimensions, modality tags, geometry and expected
  worker evidence must be declared. Ignored `tests/cases/` files can discover
  defects but are never sole PASS evidence.
- Separate pure TypeScript tests (state machine, demand, dimensions,
  lifecycle) from controlled WebGL integration tests (actual Cornerstone
  initialization, load, render and temporary target).
- Do not require byte-identical RGBA output across GPU drivers unless a
  renderer/version/platform baseline makes it defensible. Use exact checks for
  dimensions, IDs, provenance and disposal; name any image tolerance and its
  rationale.
- A successful target must demonstrate a non-empty native-size raster and the
  expected state binding. It must not be accepted merely because a canvas was
  allocated.
- Each negative case must fail explicitly: unavailable WebGL, adapter start
  failure, invalid source/availability, volume-load error, budget exhaustion,
  invalid render state and temporary-target allocation failure.

## Residency Contract for P3

The manager may use internal handles, but every externally observable state
must map truthfully to Phase 1 residency vocabulary:

```text
metadata-only -> source-available -> cpu-cached -> gpu-ready -> gpu-resident
                                      |                              |
                                      +--------- evicted <------------+
```

`loading` denotes a transition, not a stable success result. Eviction releases
only physical resources. It must preserve semantic asset identity, source
fingerprint expectations, worker provenance and the ability to request a
reload. Resource byte counts must be measured or explicitly unavailable; do
not fabricate VRAM measurements from a guessed formula.

## Completion Gates

| Gate | Required Phase 3 evidence |
| --- | --- |
| AgentLog | Eight-point handover for every P3 slice in `docs/agentlog/phase-3.md` |
| Renderer | A controlled WebGL 2 harness exercises real Cornerstone initialization, volume load and teardown; unsupported host state fails explicitly |
| Source integrity | Pixel-bearing CT/PT fixture identity is tied to accepted Phase 2 worker geometry/metadata; live rendering rejects invalid availability/evidence |
| Residency | Demand, sharing, budget, eviction and reload are observable and tested without semantic asset deletion |
| State path | Ordinary raster and temporary target apply the same `MedicalViewState` semantics; no screen-pixel state becomes persisted medical state |
| RenderTarget | Physical-mm/DPI dimension calculation, native-size output, no live-canvas mutation and disposal are proven |
| Boundary | No UI, workspace, figure composition, custom medical renderer or duplicated scientific formula; package graph remains acyclic |
| Quality | Typecheck, Node tests, configured Python tests, build, source-size gate and applicable renderer integration tests report actual results |
| Review | `nuclear-reviewer` and `nuclear-qa` independently inspect the final P3 diff and evidence before closure |

## Stop Conditions

Stop the active slice as `BLOCKED` rather than guessing when:

- a reproducible WebGL 2/Cornerstone harness cannot be established;
- the selected Cornerstone path cannot load the declared local source without
  an unimplemented desktop/filesystem authority;
- a required presentation setting or GPU behavior has no documented contract;
- a fixture cannot establish the claimed geometry/pixel relation;
- a proposed budget, image tolerance or VRAM accounting model has no
  defensible measurement basis.

## Exact Next Step

Start **P3.0** only: establish and document the real Cornerstone/WebGL
capability, package/version choice, fixture requirements and harness boundary.
Do not add ViewportSurfaces, a UI or an export compositor in that slice.
