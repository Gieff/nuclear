# Changelog — NuClear

All notable changes to the NuClear workstation will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Phase 1 (Clinical Data Contracts in `@nuclear/shared-types`)**:
  - Defined pure TypeScript contracts in `@nuclear/shared-types` with zero runtime dependencies and zero runtime code (`StudyReference`, `ImagingAsset`, `SourceLocator`, `SourceFingerprint`, `AssetAvailability`, `AssetResidency`, `SpatialTransform`, `ViewProvenance`).
  - Implemented nominal branded identifiers for clinical IDs and DICOM UIDs (`StudyId`, `AssetId`, `ViewId`, `SurfaceId`, `RowId`, `CellId`, `TransformId`, `StudyInstanceUID`, `SeriesInstanceUID`, `SOPInstanceUID`, `FrameOfReferenceUID`).
  - Defined strict physical patient geometry in LPS coordinates in millimeters (`AssetGeometry`, `Point3D`, `DirectionCosines`, `Matrix4x4`, `BoundingBox3D`).
  - Added quantitative PET metadata contracts (`PetAcquisitionMetadata`) with decay correction (`START`/`ADMIN`) and SUVbw scaling factor calculations.
  - Formulated discriminated unions for `SourceLocator` across local paths, file lists, archives, DICOMweb endpoints, and managed cache.
  - Implemented headless clinical contract validators and type guards in `tests/contracts/validators.ts`.
  - Added curated oncology PET/CT fixtures in `tests/fixtures/clinical-contracts.fixture.ts` and automated verification test suite in `tests/contracts/clinical-data-contracts.test.ts`.
  - Established composite TypeScript project references and package configurations across all monorepo workspaces.
- **Phase 0 (Foundation & Contracts Setup)**:
  - Initialized NuClear repository structure with 7 decoupled domain packages (`shared-types`, `rendering-presets`, `medical-engine`, `view-engine`, `figure-engine`, `project-model`, `ui`).
  - Adopted Master Architecture Blueprint v3 (`docs/NUCLEAR_ARCHITECTURE_V3.md`) with explicit coordinate chains, persistent ViewportSurfaces, and offline-safe project state.
  - Adapted Project Vademecum (`docs/PROJECT_VADEMECUM.md`) establishing principles P1–P8.
  - Included the NuClear Visual Identity & Design System specification (`docs/NuClear: studio di identità.html`).
  - Configured agent directives (`AGENTS.md`), OpenCode profiles/commands, rules (`01-project-core.md`, `02-architecture.md`, `03-code-quality.md`, `04-orchestration.md`), and specialized skills (`nuclear-dicom`, `nuclear-rendering`, `nuclear-testing`).

### Changed
- Reconciled the vademecum with the v3 NuClear architecture: seven package boundaries, headless-first Fase 0–7 delivery, source verification, persistent surfaces, and high-resolution hybrid export are now the governing execution model.
- Migrated OpenCode profiles, commands, permissions, and Playwright MCP configuration to the current V2 project layout; verification now reports unavailable evidence instead of masking it as success.
- Adopted `.ncp` (NuClearProject) as the sole project extension; legacy project import is out of scope.
- Excluded local DICOM test cases in `tests/cases/` from version control.
