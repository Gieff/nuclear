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
"""

__version__ = "0.1.1"
