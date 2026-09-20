"""Deliberately invalid synthetic geometry series for P2.3 negative tests.

These writers never produce pixel data and never represent a clinical case;
they exist only to prove that the extractor fails closed instead of silently
repairing an irregular grid.
"""

from __future__ import annotations

from pathlib import Path

from synthetic_geometry import AXIAL_IOP, geometry_uid, write_series

GANTRY_SERIES_UID = geometry_uid(3005, 2)
DUPLICATE_SERIES_UID = geometry_uid(3006, 2)
INSUFFICIENT_SERIES_UID = geometry_uid(3007, 2)
MISSING_TAG_SERIES_UID = geometry_uid(3008, 2)


def write_geometry_gantry_tilt(directory: Path) -> None:
    """Slice centres are not collinear with the slice normal."""
    write_series(
        directory,
        "geometry-gantry",
        study_uid=geometry_uid(3005, 1),
        series_uid=GANTRY_SERIES_UID,
        sop_root=geometry_uid(3005, 3),
        frame_uid=geometry_uid(3005, 4),
        positions=[(0.0, 0.0, 0.0), (0.0, 0.0, 2.0), (0.0, 0.5, 4.0)],
        orientation=AXIAL_IOP,
    )


def write_geometry_duplicate(directory: Path) -> None:
    """Two instances share a slice position."""
    write_series(
        directory,
        "geometry-duplicate",
        study_uid=geometry_uid(3006, 1),
        series_uid=DUPLICATE_SERIES_UID,
        sop_root=geometry_uid(3006, 3),
        frame_uid=geometry_uid(3006, 4),
        positions=[(0.0, 0.0, 0.0), (0.0, 0.0, 2.0), (0.0, 0.0, 2.0)],
    )


def write_geometry_insufficient(directory: Path) -> None:
    """Only two slices: below the P2.3 regular-grid minimum."""
    write_series(
        directory,
        "geometry-insufficient",
        study_uid=geometry_uid(3007, 1),
        series_uid=INSUFFICIENT_SERIES_UID,
        sop_root=geometry_uid(3007, 3),
        frame_uid=geometry_uid(3007, 4),
        positions=[(0.0, 0.0, 0.0), (0.0, 0.0, 2.0)],
    )


def write_geometry_missing_tag(directory: Path) -> None:
    """One slice omits the required ImagePositionPatient tag."""
    write_series(
        directory,
        "geometry-missing-tag",
        study_uid=geometry_uid(3008, 1),
        series_uid=MISSING_TAG_SERIES_UID,
        sop_root=geometry_uid(3008, 3),
        frame_uid=geometry_uid(3008, 4),
        positions=[None, (0.0, 0.0, 2.0), (0.0, 0.0, 4.0)],
    )
