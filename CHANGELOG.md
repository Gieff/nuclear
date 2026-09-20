# Changelog — NuClear

All notable changes to the NuClear workstation will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Detailed engineering handover reports are maintained per release phase in the project documentation.

## [Unreleased]

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
