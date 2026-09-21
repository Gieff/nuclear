# Changelog — NuClear

All notable changes to the NuClear workstation will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Detailed engineering handover reports are maintained per release phase in the project documentation.

## [Unreleased]

## [0.2.0] - 2026-09-21

### Added
- **Headless Medical Rendering Engine**: A real, UI-agnostic Cornerstone3D volume-rendering path inside the headless medical engine, exercised end-to-end through a controlled WebGL 2 harness — an environment without WebGL support fails closed with an explicit unavailability error instead of degrading, every started renderer tears down cleanly with typed, retryable lifecycle errors, and the deterministic software rasterizer is reported honestly as software rather than presented as hardware acceleration.
- **Explicit Series-to-Volume Loading**: Imaging volumes are constructed only from accepted scientific-worker evidence — availability, series classification, patient-space geometry and the full pixel-payload contract (scalar type, bit layout, dimensions and finite values) are validated before any rendering structure is created — so unsupported classifications, missing or mismatched evidence, geometric disagreement and malformed payloads are refused with typed errors and never reach the renderer.
- **Resource Residency Management**: A declarative residency manager governs which imaging volumes remain materialized, using lease-based shared resources so a fused view pins its CT and PET sources independently, byte-level budget accounting that reports an unmeasurable capacity axis honestly instead of guessing, deterministic priority-ordered eviction confined to unreferenced resources, and on-demand reload that preserves each asset's identity and provenance; a fail-closed terminal disposal completes the lifecycle, with no global cache purge anywhere.
- **Medical View State Application**: The persisted medical view state — CT, PET and CT/PET fusion presentations — is applied to live three-dimensional viewports through one shared rendering path conforming to the PET/CT fusion radiometry specification, with ratified DICOM palettes resolved by stable identifier before any property is written, the viewport's pixel size measured from the mounted element, residency verified against the real renderer cache, and fail-closed refusal of frame-of-reference mismatches, unsupported spatial transforms, non-neutral cameras and unsupported slice positioning rather than silently approximating them.
- **Fusion Presentation Contracts**: A per-layer composition contract with single, fusion and multi-layer states expresses CT/PET fusion declaratively — the PET overlay's overall opacity has a single authoritative source, transfer modes and blend bounds are validated, and incomplete or ambiguous compositions are rejected instead of being inferred.
- **Quantitative PET Radiometry Binding**: Quantitative fusion is admitted only through a ratified binding — PET modality, computed body-weight quantitation against a positive SUV factor, and pixel data declared in the rescaled Bq/mL transport domain — with the single, tested SUV↔activity conversion and typed refusals for every unmet condition, so raw-count or CT-domain PET data is never silently fused or colourized.
- **DICOM Palette Catalog**: The four nuclear-medicine palettes from the DICOM standard's well-known palette color lookup tables (Hot Iron, PET, Hot Metal Blue, PET 20 Step) ship as a ratified declarative catalog with canonical stable identifiers, idempotent typed registration, and whole-table regression digests that detect a change of even a single byte.
- **Ordinary Medical Raster Capture**: Any applied view can be captured to a native-resolution raster carrying complete semantic provenance — view identity, per-layer asset, volume, role, modality, palette, intensity domain and window, composition mode, orientation and renderer facts — with a runtime verification that every PET layer actually exposes its scalars in the quantitative Bq/mL transport domain before pixels are accepted, and with independently applied views provably isolated from one another.
- **Temporary High-Resolution Render Target**: A publication-density render target is dimensioned directly from physical millimetres and target DPI, applies the exact same view state through the ordinary rendering and capture path at native pixel dimensions, never resizes or otherwise mutates the live interactive canvas, releases its temporary resources deterministically, and refuses with a typed error rather than falling back to upscaling a preview.
- **Architectural Governance & Evidenced Closure**: Each new rendering, radiometry, palette, capture and publication-target capability is governed by a formal architectural decision record, and the milestone closure was verified by an independent review and quality-assurance pass over the accumulated delivery, with every executable verification gate green.

## [0.1.2] - 2026-09-20

### Added
- **Headless Scientific Worker Bridge**: A UI-agnostic bridge within the headless medical engine that supervises the full lifecycle of the local Python scientific worker over the versioned stdio JSON-RPC protocol — from deterministic startup handshake through clean shutdown — with concurrent request correlation, per-request timeouts, and automatic recovery through bounded restart backoff. The handshake verifies protocol-version compatibility and the worker's advertised scientific operations before any request is served; requests fail closed while the worker is not ready, and an incompatible or failed handshake aborts deterministically rather than falling back.
- **Verbatim Scientific Result Mapping**: The worker's scientifically computed results — study and series classification, physical patient-space geometry, PET body-weight quantitation, and pairwise geometry-compatibility evidence — are translated into NuClear clinical contracts with scientific provenance preserved and every computed value copied verbatim. The bridge performs no scientific computation of its own: no formula, DICOM interpretation, or quantitative result is ever re-derived in the application layer.

## [0.1.0] - 2026-09-20

### Added
- **Figure & Publication Contracts**: Serializable figure composition, millimetre-spaced panels, discriminated physical annotations (LPS patient anchors and sheet coordinates), and multi-format publication targets (high-resolution TIFF/PNG and vector-preserving hybrid PDF).
- **View & Viewport Contracts**: Coordinate transform pipelines from Patient LPS space to view plane and viewport pixels, decoupled view slots, stable viewport surface identities, and inter/intra-study synchronization linking with granular locks.
- **Clinical Data Contracts**: Pure domain contracts for multimodal studies, imaging assets, LPS physical patient geometry with outer half-voxel boundary definitions, nominal branded identifiers, and source locators for local folders and archives.
- **Quantitative PET Contracts**: Strict acquisition metadata and decay correction specifications, reserving numerical calculations and quantitation provenance for the scientific processing engine.
- **Automated Verification Harness**: Headless contract verification suite and curated oncology PET/CT fixtures asserting geometric and relational invariants.
- **Unified Documentation Portal**: Integrated TypeDoc API reference and Python documentation tooling accessible via a centralized portal.
- **Repository Architecture Foundation**: Monorepo structure with seven decoupled domain packages, architectural governance directives, and headless-first verification standards.
- **Python Scientific Worker Baseline**: A provisioned local scientific worker environment, declared package documentation, a versioned manifest that distinguishes established evidence from planned work, and versioned protocol request, response and error examples.

### Changed
- Enforced strict nominal typing across domain contracts, eliminating ambiguous primitive string unions.
- Reconciled patient coordinate bounds to use an exact 3D axis-aligned bounding box enclosing all eight oriented voxel corners.

### Security
- Hardened study contracts against Protected Health Information (PHI) leakage by removing direct patient identifiers from persisted project references.

## [0.1.1] - 2026-09-20

### Added
- **Scientific Worker Protocol**: A versioned newline-delimited stdio JSON-RPC protocol for the local Python scientific worker, with a deterministic handshake, a structured error schema that always carries a diagnostic and never a result on failure, mandatory worker provenance on success, and a stateless supervisor that answers every record, isolates diagnostics from the protocol channel and never terminates on malformed input.
- **DICOM Study & Series Inspection**: Metadata-only discovery that groups instances into studies and series and explicitly classifies primary CT, attenuation-corrected PET, uncorrected PET, localizer, secondary-capture and unsupported series; every non-primary series is reported with a reason and nothing is silently discarded, while unreadable sources fail closed.
- **Regular-Grid Geometry Extraction**: Deterministic patient-space geometry reporting grid dimensions, spacing, orientation, origin, normalized slice ordering and the physical bounding envelope of the oriented voxel corners, together with pairwise cross-series compatibility evidence derived from frame-of-reference and slice coplanarity.
- **Fail-Closed Geometry Hardening**: Geometry is rejected when coordinates, dimensions or spacing are non-finite or non-positive, when study, frame-of-reference or modality identity is inconsistent within a series, or when instance identities are duplicated; outgoing protocol records use strict JSON so non-finite values cannot escape the transport.
- **PET SUV Body-Weight Quantitation**: Production of the body-weight standardised uptake value factor with mandatory scientific provenance, reading radiopharmaceutical dose and half-life from the radiopharmaceutical information sequence defined by the DICOM standard, applying decay correction referenced only to the start of acquisition and using date-aware acquisition timestamps; missing, unusable or unsupported acquisition metadata yields an explicit invalid or unavailable result instead of an estimate.
- **Acquisition-Time and Numeric Conformance**: DICOM date-time offsets are validated against the permitted range for the standard, and PET numeric inputs must be finite and positive at both the scientific boundary and the persisted domain type guards.
- **Developer Tooling**: Semantic code navigation across the repository and a monorepo version-synchronisation script that keeps all workspaces, the Python worker and the versioned protocol examples on a single release version.
