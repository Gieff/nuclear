# AgentLog — Phase 1: Clinical Data, View & Figure Contracts

## 1. What Was Implemented
- **Phase 1.0 (Clinical Data Contracts in `@nuclear/shared-types`)**:
  - Implemented pure TypeScript contracts with zero runtime dependencies (`StudyReference`, `ImagingAsset`, `SourceLocator`, `SourceFingerprint`, `AssetAvailability`, `AssetResidency`, `SpatialTransform`, `ViewProvenance`).
  - Nominal branded identifiers: `StudyId`, `AssetId`, `ViewId`, `SurfaceId`, `RowId`, `CellId`, `TransformId`, `StudyInstanceUID`, `SeriesInstanceUID`, `SOPInstanceUID`, `FrameOfReferenceUID`.
  - LPS physical patient geometry in millimetres: `AssetGeometry`, `Point3D`, `DirectionCosines`, `Matrix4x4`, `BoundingBox3D`.
  - Quantitative PET acquisition metadata (`PetAcquisitionMetadata`) with decay correction (`START`/`ADMIN`).
  - Headless clinical contract validators and type guards in `tests/contracts/validators.ts`.
  - Curated oncology PET/CT fixtures in `tests/fixtures/clinical-contracts.fixture.ts` and automated test suite in `tests/contracts/clinical-data-contracts.test.ts`.

- **Phase 1.1 (Contract Hardening & Scientific Boundary Isolation)**:
  - Purged runtime SUVbw formula computation from TypeScript validators, reserving numerical quantitation strictly for the Python worker (P3).
  - Constrained `SourceLocator` to v1 scope: `local-folder`, `local-file-list`, `archive-entry` (removed premature `dicomweb` and cache locators).
  - Eliminated `| string` nominal dilution on branded UIDs (`StudyInstanceUID`, `SeriesInstanceUID`, `FrameOfReferenceUID`).
  - Aligned `ResourcePriority` in `AssetResidency` with v3 architecture (`visible-interactive`, `visible-read-only`, `prepared-hidden`, `prefetch-candidate`, `unused`).
  - Formalized geometric voxel boundary convention for `AssetGeometry`: `BoundingBox3D` covers outer half-voxel borders (`min = origin - 0.5*spacing`, `max = origin + (dim - 0.5)*spacing`).
  - Refactored matrix validation to `isHomogeneousAffineMatrix4x4`.
  - Stripped direct PHI (`patientName`, `patientBirthDate`) from `PatientReference` for privacy-safe `.ncp` persistence.

- **Phase 1.2 (Geometry Envelopes & Quantitation Provenance)**:
  - Defined `AssetGeometry.bounds` as the LPS axis-aligned envelope of all eight oriented outer voxel corners with oblique-grid regression fixture.
  - Restricted `.ncp` study contracts to non-identifying metadata.
  - Added `PetQuantitationResult` contract with mandatory Python scientific-worker provenance and structural validation.

- **Phase 1.3 (View Contracts)**:
  - Added serializable `MedicalViewState` composition with explicit coordinate transform chain: Patient LPS mm → View Plane → Viewport pixel transforms.
  - Added `ViewSlot`, `ViewGroup`, `PreparedView`, and stable `ViewportSurface` contracts independent of WebGL contexts.
  - Added distinct co-referenced intra-study and relative/transformed inter-study links, granular locks, and local overrides.
  - Added distinct `ComposerViewInstanceId` and registered-transform evidence.
  - Automated test suite in `tests/contracts/view-contracts.test.ts`.

- **Phase 1.3 (Figure Contracts)**:
  - Added serializable Composer view instances, medical bindings, panel framing/layout/decoration and Figure Sheet contracts with explicit millimetre spaces.
  - Added discriminated annotations: patient LPS, panel-content, and sheet anchors (lines, arrows, ROI, text, measurements, scalebars). Persisting raw screen pixels as clinical anchors is strictly forbidden.
  - Added live high-resolution `RenderTarget` and publication output contracts for flattened TIFF/PNG and hybrid PDF with native vector editorial layers.
  - Added branded preview identities, panel membership integrity, `PreparedView` provenance checks, and explicit live-medical vs offline-cached-preview export modes.
  - Automated test suite in `tests/contracts/figure-contracts.test.ts`.

- **Documentation Tooling (TSDoc / TypeDoc & Python PEP 621)**:
  - Configured TypeDoc (`typedoc.json`) and scripts (`npm run docs:ts`, `npm run docs`) generating static HTML API documentation in `docs/api/ts`.
  - Added PEP 621 `python/pyproject.toml` declaring dependencies (`pydicom`, `numpy`, `SimpleITK`), Google docstring standards, and `pdoc`.
  - Implemented `scripts/build_python_docs.py` and master portal at `docs/api/index.html`.

## 2. Files Changed / Created
- `packages/shared-types/src/index.ts`
- `packages/shared-types/src/asset.ts`, `availability.ts`, `geometry.ts`, `identifiers.ts`, `provenance.ts`, `semantics.ts`, `source.ts`, `spatial-transform.ts`, `study.ts`
- `packages/shared-types/src/view-state.ts`, `view-links.ts`, `prepared-view.ts`, `view-workspace.ts`
- `packages/shared-types/src/figure.ts`
- `tests/contracts/validators.ts`
- `tests/contracts/clinical-data-contracts.test.ts`
- `tests/contracts/view-contracts.test.ts`
- `tests/contracts/figure-contracts.test.ts`
- `tests/fixtures/clinical-contracts.fixture.ts`
- `tests/fixtures/view-contracts.fixture.ts`
- `tests/fixtures/figure-contracts.fixture.ts`
- `typedoc.json`
- `python/pyproject.toml`
- `scripts/build_python_docs.py`
- Generated API documentation under `docs/api/` (ignored build artifacts, not versioned source files)

## 3. Architectural Assumptions Made
- Strict mathematical adherence to LPS patient coordinates in millimetres.
- Node/TypeScript layer performs only structural and type validation; numerical execution of SUVbw, decay correction, and rigid/deformable registration belongs solely to Python.
- Viewport surfaces have stable identities independent of transient WebGL contexts.
- Figure annotations anchor to physical spaces (LPS mm or sheet mm); screen pixels are never persisted.
- Offline preview mode is explicitly branded and fail-closed: it never poses as a live medical rendering.

## 4. Tests Added & Executed
- Test suites:
  - `tests/contracts/clinical-data-contracts.test.ts` (19 passing assertions)
  - `tests/contracts/view-contracts.test.ts` (7 passing assertions)
  - `tests/contracts/figure-contracts.test.ts` (7 passing assertions)
- Test command: `npm test` (`node --test`) — 33 tests across 10 suites passing (100% pass rate).
- Typecheck: `npm run typecheck` (`tsc -b`) — 0 errors.

## 5. Documentation, Agentlog & ADR Status
- TSDoc API documentation generated in `docs/api/ts/`.
- Python API documentation generated in `docs/api/python/`.
- Master portal configured at `docs/api/index.html`.
- ADR-001 created in `docs/decisions/ADR-001-two-tier-changelog-and-agentlog.md`.

## 6. Project Model Impact
- Pure contracts established for all entities in `@nuclear/shared-types`.
- Verified non-identifying serialization for `.ncp` projects with zero direct PHI.

## 7. Known Limitations & Technical Debt
- Phase 1 delivers pure headless contracts, validators, and fixtures. No WebGL rendering, Cornerstone3D contexts, or GUI adapters are introduced (intentionally deferred to Phases 2–7).

## 8. Exact Next Recommended Task
- Proceed to Phase 2: Scientific DICOM ingestion worker (`python/dicom/`), Python/Node IPC bridge, and physical metadata parsing.
