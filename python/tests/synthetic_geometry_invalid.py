"""Deliberately invalid synthetic geometry series for P2.3 negative tests.

These writers never produce pixel data and never represent a clinical case;
they exist only to prove that the extractor fails closed instead of silently
repairing an irregular grid.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from pathlib import Path

from synthetic_common import write_metadata_dataset
from synthetic_geometry import AXIAL_IOP, geometry_uid, write_series

from dicom.metadata import CT_IMAGE_STORAGE

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


# P2.3.1 hardening fixtures: each violates exactly one fail-closed invariant.
NON_FINITE_SERIES_UID = geometry_uid(3011, 2)
NON_POSITIVE_DIMENSIONS_SERIES_UID = geometry_uid(3012, 2)
NON_POSITIVE_SPACING_SERIES_UID = geometry_uid(3013, 2)
INCONSISTENT_STUDY_SERIES_UID = geometry_uid(3014, 2)
INCONSISTENT_FRAME_SERIES_UID = geometry_uid(3015, 2)
INCONSISTENT_MODALITY_SERIES_UID = geometry_uid(3016, 2)
DUPLICATE_SOP_SERIES_UID = geometry_uid(3017, 2)

_HARDENING_POSITIONS = [(0.0, 0.0, 0.0), (0.0, 0.0, 2.0), (0.0, 0.0, 4.0)]


def _hardening_block(
    directory: Path,
    prefix: str,
    block: int,
    *,
    positions: Sequence[Sequence[float]],
    studies: Sequence[str] | None = None,
    frames: Sequence[str] | None = None,
    modalities: Sequence[str] | None = None,
    sops: Sequence[str] | None = None,
    pixel_spacing: Sequence[float] = (0.5, 0.5),
    rows: int = 4,
    columns: int = 4,
) -> None:
    for index, position in enumerate(positions, start=1):
        write_metadata_dataset(
            directory,
            f"{prefix}-{index}.dcm",
            study_uid=studies[index - 1] if studies else geometry_uid(block, 1),
            series_uid=geometry_uid(block, 2),
            sop_uid=sops[index - 1] if sops else f"{geometry_uid(block, 3)}.{index}",
            sop_class_uid=CT_IMAGE_STORAGE,
            modality=modalities[index - 1] if modalities else "CT",
            image_type=("ORIGINAL", "PRIMARY", "AXIAL"),
            series_number=1,
            frame_of_reference_uid=frames[index - 1] if frames else geometry_uid(block, 4),
            image_position_patient=position,
            image_orientation_patient=AXIAL_IOP,
            pixel_spacing=pixel_spacing,
            rows=rows,
            columns=columns,
        )


def write_geometry_non_finite(directory: Path) -> None:
    """One slice has a non-finite ImagePositionPatient component."""
    _hardening_block(
        directory,
        "geometry-non-finite",
        3011,
        positions=[(0.0, 0.0, 0.0), (0.0, 0.0, 2.0), (float("nan"), 0.0, 4.0)],
    )


def write_geometry_non_positive_dimensions(directory: Path) -> None:
    """Rows is zero (non-positive dimensions)."""
    _hardening_block(
        directory, "geometry-non-positive-dimensions", 3012, positions=_HARDENING_POSITIONS, rows=0
    )


def write_geometry_non_positive_spacing(directory: Path) -> None:
    """PixelSpacing contains a zero component."""
    _hardening_block(
        directory,
        "geometry-non-positive-spacing",
        3013,
        positions=_HARDENING_POSITIONS,
        pixel_spacing=(0.0, 0.5),
    )


def write_geometry_inconsistent_study(directory: Path) -> None:
    """One slice carries a different StudyInstanceUID."""
    _hardening_block(
        directory,
        "geometry-inconsistent-study",
        3014,
        positions=_HARDENING_POSITIONS,
        studies=[geometry_uid(3014, 1), geometry_uid(3014, 9), geometry_uid(3014, 1)],
    )


def write_geometry_inconsistent_frame(directory: Path) -> None:
    """One slice carries a different FrameOfReferenceUID."""
    _hardening_block(
        directory,
        "geometry-inconsistent-frame",
        3015,
        positions=_HARDENING_POSITIONS,
        frames=[geometry_uid(3015, 4), geometry_uid(3015, 9), geometry_uid(3015, 4)],
    )


def write_geometry_inconsistent_modality(directory: Path) -> None:
    """One slice carries a different Modality."""
    _hardening_block(
        directory,
        "geometry-inconsistent-modality",
        3016,
        positions=_HARDENING_POSITIONS,
        modalities=["CT", "PT", "CT"],
    )


def write_geometry_duplicate_sop(directory: Path) -> None:
    """Two slices share a SOPInstanceUID."""
    root = geometry_uid(3017, 3)
    _hardening_block(
        directory,
        "geometry-duplicate-sop",
        3017,
        positions=_HARDENING_POSITIONS,
        sops=[f"{root}.1", f"{root}.1", f"{root}.3"],
    )


NON_FINITE_DERIVED_SERIES_UID = geometry_uid(3018, 2)


def write_geometry_non_finite_derived(directory: Path) -> None:
    """A per-component-finite IPP whose slice projection overflows to infinity."""
    root = math.sqrt(0.5)
    write_series(
        directory,
        "geometry-non-finite-derived",
        study_uid=geometry_uid(3018, 1),
        series_uid=NON_FINITE_DERIVED_SERIES_UID,
        sop_root=geometry_uid(3018, 3),
        frame_uid=geometry_uid(3018, 4),
        positions=[(0.0, 0.0, 0.0), (root * 4.0, -root * 4.0, 0.0), (1.6e308, -1.6e308, 0.0)],
        orientation=(root, root, 0.0, 0.0, 0.0, 1.0),
        pixel_spacing=(3.0, 2.0),
        rows=3,
        columns=2,
    )
