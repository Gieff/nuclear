# Changelog — NuClear

All notable changes to the NuClear workstation will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Phase 1.3 (Figure Contracts)**:
  - Added serializable Composer view instances, medical bindings, panel framing/layout/decoration and Figure Sheet contracts with explicit millimetre spaces.
  - Added renderable discriminated annotations (patient LPS, panel-content and sheet anchors; lines/arrows, ROI, text, measurements and scalebars); screen pixels cannot be persisted as clinical anchors.
  - Added live high-resolution RenderTarget and publication output contracts for flattened TIFF/PNG and hybrid PDF with native vector editorial layers; offline cached-preview output is explicitly non-resampled and never presented as live medical rendering.
  - Added branded preview identities, panel membership integrity, PreparedView/provenance checks and explicit live-medical versus offline-cached-preview export modes.
  - Added positive/negative headless fixtures and validators for override isolation, coordinate-space separation and fail-closed export availability.
- **Phase 1.3 (View Contracts)**:
  - Added serializable `MedicalViewState` composition with explicit Patient LPS mm → View Plane → Viewport pixel transforms.
  - Added `ViewSlot`, `ViewGroup`, `PreparedView`, and stable `ViewportSurface` contracts independent of WebGL contexts.
  - Added distinct co-referenced intra-study and relative/transformed inter-study links, granular locks, and local overrides.
  - Added headless positive/negative fixtures and validators for coordinate chains, link semantics, surface identity, and override isolation.
  - Hardened structural validation for affine matrices, direction cosines, state constraints, layer composition, link evidence, locks, slots, groups, prepared views, and preview references.
  - Added distinct `ComposerViewInstanceId` and explicit registered-transform evidence for transformed inter-study links.
- **Phase 1.2 (Clinical Contract Geometry, Privacy & Quantitation Hardening)**:
  - Defined `AssetGeometry.bounds` as the LPS axis-aligned envelope of all eight oriented outer voxel corners, including a validator and oblique-grid regression fixture.
  - Restricted persistible `.ncp` study contracts to non-identifying metadata; removed patient/source identifiers and clinical descriptions from `StudyReference` and series summaries.
  - Removed computed SUVbw from raw `PetAcquisitionMetadata`; added `PetQuantitationResult` with mandatory Python scientific-worker provenance and structural validation.
- **Phase 1.1 (Clinical Data Contracts Correction & Hardening)**:
  - Purged runtime SUVbw formula computation from TypeScript validators, restricting Node to pure structural contracts and reserving numerical quantitation for the Python worker (P3).
  - Constrained `SourceLocator` strictly to v1 scope (`local-folder`, `local-file-list`, `archive-entry`), removing premature `dicomweb` and cache locators.
  - Enforced strict nominal typing across all domain contracts by eliminating `| string` dilution on branded UIDs (`StudyInstanceUID`, `SeriesInstanceUID`, `FrameOfReferenceUID`).
  - Aligned `ResourcePriority` in `AssetResidency` strictly with v3 architecture specification (`visible-interactive`, `visible-read-only`, `prepared-hidden`, `prefetch-candidate`, `unused`).
  - Formalized geometric voxel convention for `AssetGeometry` (`BoundingBox3D` covering outer half-voxel borders: `min = origin - 0.5*spacing`, `max = origin + (dim - 0.5)*spacing`), corrected synthetic fixture bounds, and added automated mathematical assertion tests.
  - Refactored matrix validation to `isHomogeneousAffineMatrix4x4`, asserting structural homogeneous form while reserving rigid registration verification for Python.
  - Stripped direct PHI (`patientName`, `patientBirthDate`) from `PatientReference` to guarantee `.ncp` privacy-safe persistence, and accurately labeled test fixtures as synthetic contract fixtures.
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
