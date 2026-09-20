# Changelog — NuClear

All notable changes to the NuClear workstation will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Detailed AI handover reports and engineering logs are maintained per-phase in `docs/agentlog/`.

## [Unreleased]

### Added
- **Figure & Publication Contracts**: Serializable figure composition, millimetre-spaced panels, discriminated physical annotations (LPS patient anchors and sheet coordinates), and multi-format publication targets (high-resolution TIFF/PNG and vector-preserving hybrid PDF).
- **View & Viewport Contracts**: Coordinate transform pipelines from Patient LPS space to view plane and viewport pixels, decoupled view slots, stable viewport surface identities, and inter/intra-study synchronization linking with granular locks.
- **Clinical Data Contracts**: Pure domain contracts for multimodal studies, imaging assets, LPS physical patient geometry with outer half-voxel boundary definitions, nominal branded identifiers, and source locators for local folders and archives.
- **Quantitative PET Contracts**: Strict acquisition metadata and decay correction specifications, reserving numerical calculations and quantitation provenance for the scientific processing engine.
- **Automated Verification Harness**: Headless contract verification suite and curated oncology PET/CT fixtures asserting geometric and relational invariants.
- **Unified Documentation Portal**: Integrated TypeDoc API reference and Python documentation tooling accessible via a centralized portal.
- **Repository Architecture Foundation**: Monorepo structure with seven decoupled domain packages, architectural governance directives, and headless-first verification standards.

### Changed
- Enforced strict nominal typing across domain contracts, eliminating ambiguous primitive string unions.
- Reconciled patient coordinate bounds to use an exact 3D axis-aligned bounding box enclosing all eight oriented voxel corners.

### Security
- Hardened study contracts against Protected Health Information (PHI) leakage by removing direct patient identifiers from persisted project references.
