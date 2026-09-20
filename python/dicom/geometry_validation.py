"""Per-instance regular-grid validation for P2.3 geometry extraction.

Each function returns an error :class:`~dicom.metadata.Diagnostic` when the
series is invalid, or ``None`` when the relevant invariant holds. These checks
fail closed; they never repair or average inconsistent metadata.
"""

from __future__ import annotations

import math

from .geometry_math import DIRECTION_COSINE_EPSILON, SPACING_EPSILON_MM, is_direction_cosines_valid
from .geometry_metadata import (
    DIAGNOSTIC_DUPLICATE_SOP_INSTANCE_UID,
    DIAGNOSTIC_INCONSISTENT_FRAME_OF_REFERENCE,
    DIAGNOSTIC_INCONSISTENT_MODALITY,
    DIAGNOSTIC_INCONSISTENT_ORIENTATION,
    DIAGNOSTIC_INCONSISTENT_PIXEL_SPACING,
    DIAGNOSTIC_INCONSISTENT_STUDY_UID,
    DIAGNOSTIC_NON_FINITE_GEOMETRY,
    DIAGNOSTIC_NON_POSITIVE_DIMENSIONS,
    DIAGNOSTIC_NON_POSITIVE_PIXEL_SPACING,
    GeometryInstance,
    diagnostic,
)
from .metadata import Diagnostic


def _non_finite(values: tuple[float, ...] | None) -> bool:
    return values is not None and any(not math.isfinite(value) for value in values)


def numeric_diagnostic(members: list[GeometryInstance]) -> Diagnostic | None:
    """Return a diagnostic for non-finite or non-positive geometry values.

    Checked first: non-finite coordinates/cosines/spacing, then non-positive
    Rows/Columns, then non-positive PixelSpacing. ``AssetGeometry`` requires
    finite values and strictly positive dimensions and spacing.
    """
    for member in members:
        if _non_finite(member.image_position_patient):
            return diagnostic(
                DIAGNOSTIC_NON_FINITE_GEOMETRY,
                "Instance has a non-finite ImagePositionPatient component.",
                member.file,
            )
        if _non_finite(member.image_orientation_patient):
            return diagnostic(
                DIAGNOSTIC_NON_FINITE_GEOMETRY,
                "Instance has a non-finite ImageOrientationPatient component.",
                member.file,
            )
        if _non_finite(member.pixel_spacing):
            return diagnostic(
                DIAGNOSTIC_NON_FINITE_GEOMETRY,
                "Instance has a non-finite PixelSpacing component.",
                member.file,
            )
    for member in members:
        if member.rows is None or member.columns is None or member.rows <= 0 or member.columns <= 0:
            return diagnostic(
                DIAGNOSTIC_NON_POSITIVE_DIMENSIONS,
                "Rows and Columns must be positive.",
                member.file,
            )
    for member in members:
        spacing = member.pixel_spacing
        if spacing is None or spacing[0] <= 0 or spacing[1] <= 0:
            return diagnostic(
                DIAGNOSTIC_NON_POSITIVE_PIXEL_SPACING,
                "PixelSpacing components must be positive.",
                member.file,
            )
    return None


def identity_diagnostic(members: list[GeometryInstance]) -> Diagnostic | None:
    """Return a diagnostic when series identity tags disagree or SOPs repeat.

    Deterministic precedence: StudyInstanceUID, FrameOfReferenceUID, Modality,
    then SOPInstanceUID uniqueness.
    """
    first = members[0]
    for member in members[1:]:
        if member.study_instance_uid != first.study_instance_uid:
            return diagnostic(
                DIAGNOSTIC_INCONSISTENT_STUDY_UID,
                "Instances disagree on StudyInstanceUID.",
                member.file,
            )
    for member in members[1:]:
        if member.frame_of_reference_uid != first.frame_of_reference_uid:
            return diagnostic(
                DIAGNOSTIC_INCONSISTENT_FRAME_OF_REFERENCE,
                "Instances disagree on FrameOfReferenceUID.",
                member.file,
            )
    for member in members[1:]:
        if member.modality != first.modality:
            return diagnostic(
                DIAGNOSTIC_INCONSISTENT_MODALITY,
                "Instances disagree on Modality.",
                member.file,
            )
    seen: set[str] = set()
    for member in members:
        sop = member.sop_instance_uid
        if sop is not None and sop in seen:
            return diagnostic(
                DIAGNOSTIC_DUPLICATE_SOP_INSTANCE_UID,
                "SOPInstanceUID must be unique within a series.",
                member.file,
            )
        if sop is not None:
            seen.add(sop)
    return None


def orientation_diagnostic(members: list[GeometryInstance]) -> Diagnostic | None:
    """Return a diagnostic when direction cosines are invalid or inconsistent."""
    first = members[0].image_orientation_patient
    assert first is not None  # required-tag check passed
    if not is_direction_cosines_valid(first):
        return diagnostic(
            DIAGNOSTIC_INCONSISTENT_ORIENTATION,
            "ImageOrientationPatient is not an orthonormal basis.",
            members[0].file,
        )
    for member in members[1:]:
        other = member.image_orientation_patient
        if other is None or any(
            abs(a - b) > DIRECTION_COSINE_EPSILON for a, b in zip(first, other)
        ):
            return diagnostic(
                DIAGNOSTIC_INCONSISTENT_ORIENTATION,
                "Instances disagree on ImageOrientationPatient.",
                member.file,
            )
    return None


def grid_diagnostic(members: list[GeometryInstance]) -> Diagnostic | None:
    """Return a diagnostic when Rows, Columns or PixelSpacing disagree."""
    reference = members[0]
    reference_spacing = reference.pixel_spacing
    assert reference_spacing is not None
    for member in members[1:]:
        spacing = member.pixel_spacing
        if (
            member.rows != reference.rows
            or member.columns != reference.columns
            or spacing is None
            or abs(spacing[0] - reference_spacing[0]) > SPACING_EPSILON_MM
            or abs(spacing[1] - reference_spacing[1]) > SPACING_EPSILON_MM
        ):
            return diagnostic(
                DIAGNOSTIC_INCONSISTENT_PIXEL_SPACING,
                "Instances disagree on Rows, Columns or PixelSpacing.",
                member.file,
            )
    return None
