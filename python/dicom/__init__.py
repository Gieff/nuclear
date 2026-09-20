"""NuClear Scientific Worker — DICOM Ingestion & Physical Geometry.

This package provides technical DICOM parsing, metadata extraction,
geometric compatibility verification (FrameOfReferenceUID, ImageOrientationPatient,
PixelSpacing), and quantitative PET SUVbw factor determination.

Modules:
    metadata: Metadata-only instance record and shared tag vocabulary.
    classification: Deterministic standard-tag series classification.
    aggregation: Study/series grouping and result assembly.
    sources: Source-locator resolution and metadata-only DICOM reading.
    scanner: ``nuclear.dicom.inspect`` handler and provenance.
    geometry: Physical patient coordinate validation in LPS mm space (P2.3).
    quantitation: Quantitative SUVbw calibration and decay factor (P2.4).
"""

__version__ = "0.1.0"
