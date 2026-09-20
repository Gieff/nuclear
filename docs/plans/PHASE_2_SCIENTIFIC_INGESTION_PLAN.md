# Phase 2 — Scientific DICOM Ingestion & Python Worker Bridge

## Objective

Deliver a headless, local scientific path from supported DICOM sources to
verified NuClear clinical contracts. The worker classifies studies and series,
normalizes regular volume geometry, determines PET quantitative eligibility,
and returns versioned provenance through the bridge defined by ADR-002.

```text
local DICOM source
  -> Python worker (pydicom / numpy)
  -> versioned stdio JSON-RPC
  -> ScientificWorkerBridge
  -> ImagingAsset, geometry, availability and quantitation contracts
```

## In Scope

- Local-folder, local-file-list and archive-entry source handling already
  represented by `SourceLocator`.
- Study/series discovery and CT/PT classification; scouts, localizers,
  secondary captures and unsupported data are explicit classifications.
- Regular-grid geometry extraction in LPS mm: Frame of Reference, orientation,
  spacing, ordered slice positions, origin, AABB and geometric fingerprint.
- PET raw metadata extraction and SUVbw eligibility/result through Python only.
- A versioned local stdio JSON-RPC worker and TypeScript bridge facade.
- Positive and negative fixture evidence, including synthetic DICOM generated
  during Python tests and optional ignored local cases under `tests/cases/`.

## Explicitly Excluded

- Cornerstone volume loading, WebGL, residency management or RenderTargets
  (Phase 3).
- Viewer/Composer behaviour and UI.
- DICOMweb, PACS, cloud operation and legacy import.
- Resampling, registration and automatic pairing decisions. The protocol may
  reserve error/result vocabulary but must not claim those operations work.

## Required Decisions and Invariants

- ADR-002 is the transport authority: newline-delimited JSON-RPC 2.0 with a
  NuClear protocol version, correlated request IDs and structured errors.
- Python is authoritative for DICOM geometry and SUVbw. TypeScript performs
  envelope and contract validation only.
- `FrameOfReferenceUID` equality is necessary but insufficient for direct
  co-reference. Geometry evidence must include orientation, spacing, origin
  and extent.
- Slice ordering must be normalized to the right-handed `row x column` normal
  for a regular grid. Irregular spacing, gantry tilt or inconsistent
  orientation fail closed with diagnostics rather than being silently repaired.
- No clinical tolerance is invented in this phase. Synthetic exact fixtures
  use declared numerical tolerances; real-world compatibility remains an
  explicit worker result with evidence.

## Delivery Slices

| Slice | Owner | Deliverable | Acceptance evidence |
| --- | --- | --- | --- |
| P2.0 | orchestrator | Buildable Python package baseline (including the declared package README), Python test command, fixture manifest and protocol examples | Environment reports real dependency state; package metadata resolves; no absent runner is reported as PASS |
| P2.1 | scientific engineer | JSON-RPC worker envelope, handshake, error schema and stdio supervisor contract | Valid request, malformed JSON, unknown method, protocol mismatch and worker crash/restart tests |
| P2.2 | scientific engineer | DICOM study/series inspection and classification | Synthetic CT/PT/unsupported fixtures; negative localizer, secondary capture and missing-tag cases |
| P2.3 | scientific engineer | Regular-grid geometry extraction and compatibility evidence | Axial and oblique positive cases; irregular spacing, differing Frame of Reference and inconsistent orientation failures |
| P2.4 | scientific engineer | PET raw metadata and `PetQuantitationResult` production | BQML positive result; missing weight/dose/time, unsupported units and invalid decay correction failures |
| P2.5 | engine engineer | `ScientificWorkerBridge` facade in `medical-engine` | Correlation, timeout, restart, typed mapping, provenance preservation and no duplicated formula tests |
| P2.6 | reviewer + QA | Independent review, gates and handover | Diff review, Python/TypeScript suites, docs generation and completed eight-point AgentLog |

## Fixture Policy

Committed evidence must be reproducible without private clinical files.

- Create minimal synthetic DICOM instances programmatically with `pydicom`.
- Store expected metadata, geometry and quantitation outcomes as versioned
  fixture data under `tests/fixtures/`.
- `tests/cases/` remains ignored. It may expose implementation defects but can
  never be the sole evidence for a PASS.
- Every tolerance is named in the test. If no defensible tolerance exists, the
  result remains `unknown` or fails closed.

## Completion Gates

| Gate | Required Phase 2 evidence |
| --- | --- |
| AgentLog | Completed eight-point report in `docs/agentlog/phase-2.md` |
| Protocol | Version mismatch, malformed request and unknown method fail explicitly |
| DICOM | CT/PT/unsupported classification and declared source fingerprint evidence |
| Geometry | Axial and oblique success; irregular/inconsistent geometry rejection |
| Quantitation | Python-only SUVbw result with provenance and negative metadata cases |
| Bridge | Correlation, timeout and worker-failure handling without UI dependency |
| Quality | TypeScript typecheck, Node tests, configured Python tests and build all report real results |
| Review | `nuclear-reviewer` and `nuclear-qa` reports attached to the final handover |
