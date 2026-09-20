"""Geometry-tag reader and shared regular-grid disposition vocabulary.

Owns the metadata-only :class:`GeometryInstance`, the required geometry tag
table and the reason/diagnostic labels shared by geometry extraction and
validation. No math or DICOM file access happens here.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

from pydicom.dataset import Dataset

from .metadata import (
    Diagnostic,
    integer_from_dataset,
    numbers_from_dataset,
    text_from_dataset,
)

REASON_MISSING_TAG_PREFIX = "missing-required-tag:"
REASON_IRREGULAR_SPACING = "irregular-slice-spacing"
REASON_INCONSISTENT_ORIENTATION = "inconsistent-orientation"
REASON_GANTRY_TILT = "gantry-tilt"
REASON_DUPLICATE_SLICE = "duplicate-slice-position"
REASON_INSUFFICIENT_SLICES = "insufficient-slices"
REASON_INCONSISTENT_PIXEL_SPACING = "inconsistent-pixel-spacing"
REASON_SERIES_NOT_FOUND = "series-not-found"
REASON_NON_FINITE_GEOMETRY = "non-finite-geometry"
REASON_NON_POSITIVE_DIMENSIONS = "non-positive-dimensions"
REASON_NON_POSITIVE_PIXEL_SPACING = "non-positive-pixel-spacing"
REASON_INCONSISTENT_STUDY_UID = "inconsistent-study-uid"
REASON_INCONSISTENT_FRAME_OF_REFERENCE = "inconsistent-frame-of-reference"
REASON_INCONSISTENT_MODALITY = "inconsistent-modality"
REASON_DUPLICATE_SOP_INSTANCE_UID = "duplicate-sop-instance-uid"

DIAGNOSTIC_MISSING_TAG = "dicom.geometry.missing-required-tag"
DIAGNOSTIC_IRREGULAR_SPACING = "dicom.geometry.irregular-slice-spacing"
DIAGNOSTIC_INCONSISTENT_ORIENTATION = "dicom.geometry.inconsistent-orientation"
DIAGNOSTIC_GANTRY_TILT = "dicom.geometry.gantry-tilt"
DIAGNOSTIC_DUPLICATE_SLICE = "dicom.geometry.duplicate-slice-position"
DIAGNOSTIC_INSUFFICIENT_SLICES = "dicom.geometry.insufficient-slices"
DIAGNOSTIC_INCONSISTENT_PIXEL_SPACING = "dicom.geometry.inconsistent-pixel-spacing"
DIAGNOSTIC_NON_FINITE_GEOMETRY = "dicom.geometry.non-finite-geometry"
DIAGNOSTIC_NON_POSITIVE_DIMENSIONS = "dicom.geometry.non-positive-dimensions"
DIAGNOSTIC_NON_POSITIVE_PIXEL_SPACING = "dicom.geometry.non-positive-pixel-spacing"
DIAGNOSTIC_INCONSISTENT_STUDY_UID = "dicom.geometry.inconsistent-study-uid"
DIAGNOSTIC_INCONSISTENT_FRAME_OF_REFERENCE = "dicom.geometry.inconsistent-frame-of-reference"
DIAGNOSTIC_INCONSISTENT_MODALITY = "dicom.geometry.inconsistent-modality"
DIAGNOSTIC_DUPLICATE_SOP_INSTANCE_UID = "dicom.geometry.duplicate-sop-instance-uid"


@dataclass(frozen=True)
class GeometryInstance:
    """Metadata-only geometry tags for one DICOM instance."""

    study_instance_uid: str | None
    series_instance_uid: str | None
    sop_instance_uid: str | None
    modality: str | None
    frame_of_reference_uid: str | None
    rows: int | None
    columns: int | None
    pixel_spacing: tuple[float, float] | None
    image_position_patient: tuple[float, float, float] | None
    image_orientation_patient: tuple[float, ...] | None
    file: str


def geometry_instance_from_dataset(dataset: Dataset, file_name: str) -> GeometryInstance:
    """Extract geometry tags from a dataset read with ``stop_before_pixels``."""
    spacing = numbers_from_dataset(dataset, "PixelSpacing")
    position = numbers_from_dataset(dataset, "ImagePositionPatient")
    direction = numbers_from_dataset(dataset, "ImageOrientationPatient")
    return GeometryInstance(
        study_instance_uid=text_from_dataset(dataset, "StudyInstanceUID"),
        series_instance_uid=text_from_dataset(dataset, "SeriesInstanceUID"),
        sop_instance_uid=text_from_dataset(dataset, "SOPInstanceUID"),
        modality=text_from_dataset(dataset, "Modality"),
        frame_of_reference_uid=text_from_dataset(dataset, "FrameOfReferenceUID"),
        rows=integer_from_dataset(dataset, "Rows"),
        columns=integer_from_dataset(dataset, "Columns"),
        pixel_spacing=(spacing[0], spacing[1])
        if spacing is not None and len(spacing) == 2
        else None,
        image_position_patient=(position[0], position[1], position[2])
        if position is not None and len(position) == 3
        else None,
        image_orientation_patient=direction
        if direction is not None and len(direction) == 6
        else None,
        file=file_name,
    )


_REQUIRED_TAGS: tuple[tuple[str, Callable[[GeometryInstance], object]], ...] = (
    ("SOPInstanceUID", lambda item: item.sop_instance_uid),
    ("StudyInstanceUID", lambda item: item.study_instance_uid),
    ("SeriesInstanceUID", lambda item: item.series_instance_uid),
    ("Modality", lambda item: item.modality),
    ("FrameOfReferenceUID", lambda item: item.frame_of_reference_uid),
    ("Rows", lambda item: item.rows),
    ("Columns", lambda item: item.columns),
    ("PixelSpacing", lambda item: item.pixel_spacing),
    ("ImagePositionPatient", lambda item: item.image_position_patient),
    ("ImageOrientationPatient", lambda item: item.image_orientation_patient),
)


def first_missing_geometry_tag(
    members: list[GeometryInstance],
) -> tuple[str, GeometryInstance] | None:
    """Return the first missing required geometry tag and its instance."""
    for tag, accessor in _REQUIRED_TAGS:
        for member in members:
            if accessor(member) is None:
                return tag, member
    return None


def diagnostic(code: str, message: str, file_name: str | None) -> Diagnostic:
    """Build an error diagnostic for a geometry disposition."""
    return Diagnostic(code=code, severity="error", message=message, file=file_name)


def emit_diagnostics(*groups: Sequence[Diagnostic]) -> list[dict[str, str | None]]:
    """Flatten and sort diagnostic groups by ``(code, file)``."""
    collected = [diagnostic_item for group in groups for diagnostic_item in group]
    collected.sort(key=lambda item: (item.code, item.file or ""))
    return [item.as_dict() for item in collected]
