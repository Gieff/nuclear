"""Per-instance regular-grid validation for P2.3 geometry extraction.

Each function returns an error :class:`~dicom.metadata.Diagnostic` when the
series is invalid, or ``None`` when the relevant invariant holds. These checks
fail closed; they never repair or average inconsistent metadata.
"""

from __future__ import annotations

from .geometry_math import DIRECTION_COSINE_EPSILON, SPACING_EPSILON_MM, is_direction_cosines_valid
from .geometry_metadata import (
    DIAGNOSTIC_INCONSISTENT_ORIENTATION,
    DIAGNOSTIC_INCONSISTENT_PIXEL_SPACING,
    GeometryInstance,
    diagnostic,
)
from .metadata import Diagnostic


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
