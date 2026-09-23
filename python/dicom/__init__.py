"""NuClear Scientific Worker — DICOM Ingestion & Physical Geometry.

This package provides technical DICOM parsing, metadata extraction,
geometric compatibility verification (FrameOfReferenceUID, ImageOrientationPatient,
PixelSpacing), and quantitative PET SUVbw factor determination.

Modules:
    metadata: Metadata-only instance record and shared tag vocabulary.
    classification: Deterministic standard-tag series classification.
    aggregation: Study/series grouping and result assembly.
    locators: Source-locator validation and structured source errors.
    sources: Source-locator resolution and metadata-only DICOM reading.
    scanner: ``nuclear.dicom.inspect`` handler and provenance.
    geometry_math: Geometry conventions, named tolerances, bounds and digest.
    geometry_metadata: Geometry-tag reader and disposition vocabulary.
    geometry_validation: Per-instance regular-grid invariant checks.
    geometry: Regular-grid extraction and fail-closed dispositions.
    compatibility: Frame-of-reference and orientation compatibility evidence.
    geometry_operations: ``nuclear.dicom.geometry``/``compatibility`` handlers.
    pet_metadata: PET acquisition tag reader and disposition vocabulary.
    quantitation_math: SUVbw formula, DICOM TM parsing and named tolerances.
    quantitation_validation: Per-instance PET validation helpers.
    quantitation: Fail-closed SUVbw validation and result assembly.
    quantitation_operations: ``nuclear.quantitation.suvbw`` handler.
    registration_schema: ``nuclear.registration`` request schema (Phase 2B.1).
    registration_math: Deterministic Procrustes landmark mathematics (Phase 2B.2).
    registration_operations: ``nuclear.registration`` handler (Phase 2B.1/2B.2).
    registration_mi: Deterministic Mutual-Information rigid core (Phase 2B.3a).
    registration_contract: Shared refusal type, numerical guard and 4x4 coherence (2B.4).
    registration_validation: Fail-closed SpatialTransform evidence validator (2B.4).
    volume_payload: Declared scalar payload, limits and DecodedVolume record (2B.3b).
    source_fingerprint: Ratified source-series contentDigest + correlation (2B.3b).
    volume_store: Worker-owned temp root, atomic publication, TTL and release (2B.3b).
    volume_operations: DICOM pixel decode + volume transport handlers (2B.3b).
"""

__version__ = "0.4.0"
