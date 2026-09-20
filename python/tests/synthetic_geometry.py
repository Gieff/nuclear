"""Deterministic synthetic geometry series for the P2.3 fixture suite.

All datasets are metadata-only (no pixels) with fixed UIDs. This module owns the
regular-grid and compatibility writers; deliberately invalid grids live in
:mod:`synthetic_geometry_invalid`.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from pathlib import Path

from synthetic_common import write_metadata_dataset

from dicom.metadata import CT_IMAGE_STORAGE


def geometry_uid(block: int, suffix: int) -> str:
    """Return a fixed valid UID inside the P2.3 synthetic UID root."""
    return f"1.2.826.0.1.3680043.10.{block}.{suffix}"


AXIAL_SERIES_UID = geometry_uid(3001, 2)
ECHO_SERIES_UID = geometry_uid(3001, 5)
OBLIQUE_SERIES_UID = geometry_uid(3002, 2)
IRREGULAR_SERIES_UID = geometry_uid(3003, 2)
ORIENTATION_SERIES_UID = geometry_uid(3004, 2)
CORONAL_SERIES_UID = geometry_uid(3009, 2)
SHUFFLED_SERIES_UID = geometry_uid(3010, 2)

AXIAL_IOP = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0)
CORONAL_IOP = (1.0, 0.0, 0.0, 0.0, 0.0, 1.0)
AXIAL_ROW_SPACING = 0.5
AXIAL_COL_SPACING = 0.5
AXIAL_ROWS = 4
AXIAL_COLUMNS = 4
AXIAL_POSITIONS = [(0.0, 0.0, 0.0), (0.0, 0.0, 2.0), (0.0, 0.0, 4.0)]


def write_series(
    directory: Path,
    prefix: str,
    *,
    study_uid: str,
    series_uid: str,
    sop_root: str,
    frame_uid: str,
    positions: Sequence[Sequence[float] | None],
    orientation: Sequence[float] = AXIAL_IOP,
    pixel_spacing: Sequence[float] = (AXIAL_ROW_SPACING, AXIAL_COL_SPACING),
    rows: int = AXIAL_ROWS,
    columns: int = AXIAL_COLUMNS,
) -> None:
    """Write one CT series, one file per position; ``None`` omits IPP."""
    for index, position in enumerate(positions):
        write_metadata_dataset(
            directory,
            f"{prefix}-{index + 1}.dcm",
            study_uid=study_uid,
            series_uid=series_uid,
            sop_uid=f"{sop_root}.{index + 1}",
            sop_class_uid=CT_IMAGE_STORAGE,
            modality="CT",
            image_type=("ORIGINAL", "PRIMARY", "AXIAL"),
            series_number=1,
            frame_of_reference_uid=frame_uid,
            image_position_patient=position,
            image_orientation_patient=orientation,
            pixel_spacing=pixel_spacing,
            rows=rows,
            columns=columns,
        )


def write_geometry_axial(directory: Path) -> None:
    """Axial regular grid: 3 slices, 4x4, 0.5 mm in-plane, 2.0 mm spacing."""
    write_series(
        directory,
        "geometry-axial",
        study_uid=geometry_uid(3001, 1),
        series_uid=AXIAL_SERIES_UID,
        sop_root=geometry_uid(3001, 3),
        frame_uid=geometry_uid(3001, 4),
        positions=AXIAL_POSITIONS,
    )


def write_geometry_shuffled(directory: Path) -> None:
    """Axial grid written out of physical order (positions 4, 0, 2)."""
    write_series(
        directory,
        "geometry-shuffled",
        study_uid=geometry_uid(3010, 1),
        series_uid=SHUFFLED_SERIES_UID,
        sop_root=geometry_uid(3010, 3),
        frame_uid=geometry_uid(3010, 4),
        positions=[(0.0, 0.0, 4.0), (0.0, 0.0, 0.0), (0.0, 0.0, 2.0)],
    )


def write_geometry_oblique(directory: Path) -> None:
    """Oblique regular grid: 3 slices offset along an oblique slice normal."""
    root = math.sqrt(0.5)
    normal = (root, -root, 0.0)
    positions = [
        (10.0 + index * 4.0 * normal[0], 20.0 + index * 4.0 * normal[1], 30.0)
        for index in range(3)
    ]
    write_series(
        directory,
        "geometry-oblique",
        study_uid=geometry_uid(3002, 1),
        series_uid=OBLIQUE_SERIES_UID,
        sop_root=geometry_uid(3002, 3),
        frame_uid=geometry_uid(3002, 4),
        positions=positions,
        orientation=(root, root, 0.0, 0.0, 0.0, 1.0),
        pixel_spacing=(3.0, 2.0),
        rows=3,
        columns=2,
    )


def write_geometry_irregular(directory: Path) -> None:
    """Irregular slice spacing at positions 0, 2.5, 7.5 along the normal."""
    write_series(
        directory,
        "geometry-irregular",
        study_uid=geometry_uid(3003, 1),
        series_uid=IRREGULAR_SERIES_UID,
        sop_root=geometry_uid(3003, 3),
        frame_uid=geometry_uid(3003, 4),
        positions=[(0.0, 0.0, 0.0), (0.0, 0.0, 2.5), (0.0, 0.0, 7.5)],
    )


def write_geometry_orientation_inconsistent(directory: Path) -> None:
    """One slice carries a different ImageOrientationPatient."""
    write_series(
        directory,
        "geometry-orientation",
        study_uid=geometry_uid(3004, 1),
        series_uid=ORIENTATION_SERIES_UID,
        sop_root=geometry_uid(3004, 3),
        frame_uid=geometry_uid(3004, 4),
        positions=[(0.0, 0.0, 0.0), (0.0, 0.0, 2.0)],
    )
    write_series(
        directory,
        "geometry-orientation-shifted",
        study_uid=geometry_uid(3004, 1),
        series_uid=ORIENTATION_SERIES_UID,
        sop_root=geometry_uid(3004, 9),
        frame_uid=geometry_uid(3004, 4),
        positions=[(0.0, 0.0, 4.0)],
        orientation=CORONAL_IOP,
    )


def _echo_series(directory: Path, frame_uid: str) -> None:
    write_series(
        directory,
        "geometry-echo",
        study_uid=geometry_uid(3001, 1),
        series_uid=ECHO_SERIES_UID,
        sop_root=geometry_uid(3001, 6),
        frame_uid=frame_uid,
        positions=[(0.0, 0.0, 1.0), (0.0, 0.0, 3.0), (0.0, 0.0, 5.0)],
        pixel_spacing=(0.8, 0.8),
    )


def write_geometry_for_mismatch(directory: Path) -> None:
    """Same geometry with different FrameOfReferenceUIDs on the two series."""
    write_geometry_axial(directory)
    _echo_series(directory, geometry_uid(3050, 4))


def write_geometry_for_match(directory: Path) -> None:
    """Same FrameOfReferenceUID and orientation with different spacing."""
    write_geometry_axial(directory)
    _echo_series(directory, geometry_uid(3001, 4))


def write_geometry_non_coplanar(directory: Path) -> None:
    """Same FrameOfReferenceUID but a non-coplanar coronal series."""
    write_geometry_axial(directory)
    write_series(
        directory,
        "geometry-coronal",
        study_uid=geometry_uid(3009, 1),
        series_uid=CORONAL_SERIES_UID,
        sop_root=geometry_uid(3009, 3),
        frame_uid=geometry_uid(3001, 4),
        positions=[(0.0, 0.0, 0.0), (0.0, -2.0, 0.0), (0.0, -4.0, 0.0)],
        orientation=CORONAL_IOP,
    )
