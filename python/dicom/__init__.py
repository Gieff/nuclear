"""NuClear Scientific Worker — DICOM Ingestion & Physical Geometry.

This package provides technical DICOM parsing, metadata extraction,
geometric compatibility verification (FrameOfReferenceUID, ImageOrientationPatient,
PixelSpacing), and quantitative PET SUVbw factor determination.

Modules:
    scanner: Multimodal study and series discovery.
    geometry: Physical patient coordinate validation in LPS mm space.
    quantitation: Quantitative SUVbw calibration and decay factor calculation.
"""

__version__ = "0.1.0"
