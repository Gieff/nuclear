"""Regular-grid DICOM geometry extraction in LPS millimetres (NuClear P2.3).

Conventions, the ``geometricDigest`` v1 convention and the named (non-clinical)
comparison tolerances are documented in :mod:`dicom.geometry_math`. Geometry-tag
reading and the disposition vocabulary live in :mod:`dicom.geometry_metadata`;
per-instance invariant checks live in :mod:`dicom.geometry_validation`.

``spacing[2]`` is the arithmetic mean of the consecutive slice-position
differences, computed only after the ``max - min <= SPACING_EPSILON_MM``
regularity check; any residual deviation is bounded by that named tolerance.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .classification import normalize_modality
from .geometry_math import (
    COLLINEARITY_EPSILON_MM,
    MIN_SLICES,
    SPACING_EPSILON_MM,
    calculate_bounds,
    cross,
    dot,
    geometric_digest,
    norm,
)
from .geometry_metadata import (
    DIAGNOSTIC_DUPLICATE_SLICE,
    DIAGNOSTIC_GANTRY_TILT,
    DIAGNOSTIC_INSUFFICIENT_SLICES,
    DIAGNOSTIC_IRREGULAR_SPACING,
    DIAGNOSTIC_MISSING_TAG,
    REASON_DUPLICATE_SLICE,
    REASON_GANTRY_TILT,
    REASON_INCONSISTENT_ORIENTATION,
    REASON_INCONSISTENT_PIXEL_SPACING,
    REASON_INSUFFICIENT_SLICES,
    REASON_IRREGULAR_SPACING,
    REASON_MISSING_TAG_PREFIX,
    REASON_SERIES_NOT_FOUND,
    GeometryInstance,
    diagnostic,
    emit_diagnostics,
    first_missing_geometry_tag,
)
from .geometry_validation import grid_diagnostic, orientation_diagnostic
from .metadata import Diagnostic


def _reject(
    series_uid: str,
    study_uid: str,
    reason: str,
    diagnostic_item: Diagnostic,
    source_diagnostics: Sequence[Diagnostic],
) -> dict[str, Any]:
    return {
        "status": "rejected",
        "seriesInstanceUID": series_uid,
        "studyInstanceUID": study_uid,
        "reason": reason,
        "diagnostics": emit_diagnostics([diagnostic_item], source_diagnostics),
    }


def _ordered_slices(
    members: list[GeometryInstance], direction: list[float]
) -> tuple[list[tuple[float, tuple[float, float, float]]], list[float]]:
    normal = cross(direction[:3], direction[3:])
    ordered: list[tuple[float, tuple[float, float, float]]] = []
    for member in members:
        position = member.image_position_patient
        assert position is not None
        ordered.append((dot(position, normal), position))
    ordered.sort(key=lambda item: item[0])
    return ordered, normal


def _build_computed(
    members: list[GeometryInstance],
    series_uid: str,
    study_uid: str,
    source_diagnostics: Sequence[Diagnostic],
) -> dict[str, Any]:
    direction = list(members[0].image_orientation_patient or ())
    orientation = orientation_diagnostic(members)
    if orientation is not None:
        return _reject(
            series_uid, study_uid, REASON_INCONSISTENT_ORIENTATION, orientation, source_diagnostics
        )
    grid = grid_diagnostic(members)
    if grid is not None:
        return _reject(
            series_uid, study_uid, REASON_INCONSISTENT_PIXEL_SPACING, grid, source_diagnostics
        )
    ordered, normal = _ordered_slices(members, direction)
    spacings = [ordered[index + 1][0] - ordered[index][0] for index in range(len(ordered) - 1)]
    if any(value <= SPACING_EPSILON_MM for value in spacings):
        return _reject(
            series_uid,
            study_uid,
            REASON_DUPLICATE_SLICE,
            diagnostic(DIAGNOSTIC_DUPLICATE_SLICE, "Two instances share a slice position.", members[0].file),
            source_diagnostics,
        )
    origin_position = ordered[0][1]
    base = ordered[0][0]
    for position_s, position in ordered:
        offset = [
            position[axis] - origin_position[axis] - (position_s - base) * normal[axis]
            for axis in range(3)
        ]
        if norm(offset) > COLLINEARITY_EPSILON_MM:
            return _reject(
                series_uid,
                study_uid,
                REASON_GANTRY_TILT,
                diagnostic(
                    DIAGNOSTIC_GANTRY_TILT,
                    "Slice positions are not collinear with the slice normal.",
                    members[0].file,
                ),
                source_diagnostics,
            )
    if max(spacings) - min(spacings) > SPACING_EPSILON_MM:
        return _reject(
            series_uid,
            study_uid,
            REASON_IRREGULAR_SPACING,
            diagnostic(DIAGNOSTIC_IRREGULAR_SPACING, "Slice spacing is not regular.", members[0].file),
            source_diagnostics,
        )
    member = members[0]
    spacing_pair = member.pixel_spacing
    rows = member.rows
    columns = member.columns
    frame = member.frame_of_reference_uid
    assert spacing_pair is not None and rows is not None and columns is not None and frame is not None
    dimensions = [columns, rows, len(ordered)]
    spacing = [float(spacing_pair[1]), float(spacing_pair[0]), float(sum(spacings) / len(spacings))]
    origin = [float(value) for value in origin_position]
    direction_values = [float(value) for value in direction]
    bounds = calculate_bounds(dimensions, spacing, origin, direction_values)
    geometry = {
        "frameOfReferenceUID": frame,
        "dimensions": dimensions,
        "spacing": spacing,
        "origin": origin,
        "direction": direction_values,
        "sliceNormal": [float(value) for value in normal],
        "slicePositionsLpsMm": [[float(value) for value in position] for _, position in ordered],
        "bounds": bounds,
        "geometricDigest": geometric_digest(
            frame, dimensions, spacing, origin, direction_values, bounds
        ),
    }
    return {
        "status": "computed",
        "seriesInstanceUID": series_uid,
        "studyInstanceUID": study_uid,
        "modality": normalize_modality(member.modality),
        "instanceCount": len(ordered),
        "geometry": geometry,
        "diagnostics": emit_diagnostics(source_diagnostics),
    }


def extract_series_geometry(
    instances: list[GeometryInstance], series_uid: str, source_diagnostics: Sequence[Diagnostic]
) -> dict[str, Any]:
    """Extract a regular-grid geometry result for one series UID.

    Args:
        instances: Geometry metadata records read from the source.
        series_uid: Requested ``SeriesInstanceUID``.
        source_diagnostics: Skip diagnostics produced while reading the source.

    Returns:
        A ``computed`` payload, or a ``rejected``/``unavailable`` disposition.
        A geometry object is never emitted for an invalid grid.
    """
    matched = [item for item in instances if item.series_instance_uid == series_uid]
    if not matched:
        return {
            "status": "unavailable",
            "seriesInstanceUID": series_uid,
            "reason": REASON_SERIES_NOT_FOUND,
            "diagnostics": emit_diagnostics(source_diagnostics),
        }
    study_uid = matched[0].study_instance_uid or ""
    missing = first_missing_geometry_tag(matched)
    if missing is not None:
        tag, member = missing
        return _reject(
            series_uid,
            study_uid,
            f"{REASON_MISSING_TAG_PREFIX}{tag}",
            diagnostic(DIAGNOSTIC_MISSING_TAG, f"Instance is missing required tag {tag}.", member.file),
            source_diagnostics,
        )
    if len(matched) < MIN_SLICES:
        return _reject(
            series_uid,
            study_uid,
            REASON_INSUFFICIENT_SLICES,
            diagnostic(
                DIAGNOSTIC_INSUFFICIENT_SLICES,
                f"Series has {len(matched)} slice instance(s); at least {MIN_SLICES} are required.",
                matched[0].file,
            ),
            source_diagnostics,
        )
    return _build_computed(matched, series_uid, study_uid, source_diagnostics)
