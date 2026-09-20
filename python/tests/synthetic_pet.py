"""Deterministic synthetic PET datasets for the P2.4 quantitation fixtures.

Conformant structure (DICOM PS3.3 C.8.9):
- ``RadiopharmaceuticalInformationSequence`` (0054,0016) carries exactly one
  item holding ``RadionuclideTotalDose``, ``RadionuclideHalfLife`` and
  ``RadiopharmaceuticalStartDateTime``;
- root ``Units`` (0054,1001), ``DecayCorrection`` (0054,1102) and
  ``PatientWeight`` (0010,1030);
- root ``AcquisitionDateTime`` (0008,002A) for the acquisition start instant.

All datasets are metadata-only (no pixels) with fixed UIDs. Individual writers
omit or alter exactly one input so every disposition is reproducible.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from synthetic_common import write_metadata_dataset

from dicom.metadata import PET_IMAGE_STORAGE

WEIGHT_KG = 70.0
TOTAL_DOSE_BQ = 370_000_000.0
HALF_LIFE_SECONDS = 6586.2
START_DATETIME = "20260920090000"
ACQUISITION_DATETIME = "20260920100000"


def pet_uid(block: int, suffix: int) -> str:
    """Return a fixed valid UID inside the P2.4 synthetic UID root."""
    return f"1.2.826.0.1.3680043.10.{block}.{suffix}"


BQML_SERIES_UID = pet_uid(4001, 2)
MISSING_WEIGHT_SERIES_UID = pet_uid(4002, 2)
UNSUPPORTED_UNITS_SERIES_UID = pet_uid(4003, 2)
INVALID_DECAY_SERIES_UID = pet_uid(4004, 2)
MISSING_SEQUENCE_SERIES_UID = pet_uid(4005, 2)
AMBIGUOUS_SERIES_UID = pet_uid(4006, 2)
MISSING_DOSE_SERIES_UID = pet_uid(4007, 2)
MISSING_HALF_LIFE_SERIES_UID = pet_uid(4008, 2)
MISSING_START_DATETIME_SERIES_UID = pet_uid(4009, 2)
ADMIN_SERIES_UID = pet_uid(4010, 2)
INCONSISTENT_STUDY_SERIES_UID = pet_uid(4011, 2)
DUPLICATE_SOP_SERIES_UID = pet_uid(4012, 2)
DATETIME_FALLBACK_SERIES_UID = pet_uid(4013, 2)


def information_item(
    *,
    dose: float | None = TOTAL_DOSE_BQ,
    half_life: float | None = HALF_LIFE_SECONDS,
    start_datetime: str | None = START_DATETIME,
    legacy_start_time: str | None = None,
) -> list[tuple[str, Any]]:
    """Build one ``RadiopharmaceuticalInformationSequence`` item tag list."""
    tags: list[tuple[str, Any]] = []
    if dose is not None:
        tags.append(("RadionuclideTotalDose", float(dose)))
    if half_life is not None:
        tags.append(("RadionuclideHalfLife", float(half_life)))
    if start_datetime is not None:
        tags.append(("RadiopharmaceuticalStartDateTime", start_datetime))
    if legacy_start_time is not None:
        tags.append(("RadiopharmaceuticalStartTime", legacy_start_time))
    return tags


def write_pet_instance(
    directory: Path,
    file_name: str,
    *,
    block: int,
    index: int = 1,
    study_uid: str | None = None,
    series_uid: str | None = None,
    sop_uid: str | None = None,
    modality: str = "PT",
    units: str | None = "BQML",
    decay_correction: str | None = "START",
    weight: float | None = WEIGHT_KG,
    acquisition_datetime: str | None = ACQUISITION_DATETIME,
    acquisition_date: str | None = None,
    acquisition_time: str | None = None,
    information_items: list[list[tuple[str, Any]]] | None = None,
    include_information_sequence: bool = True,
) -> None:
    """Write one metadata-only PET instance in the conformant structure."""
    items = [information_item()] if information_items is None else information_items
    write_metadata_dataset(
        directory,
        file_name,
        study_uid=study_uid or pet_uid(block, 1),
        series_uid=series_uid or pet_uid(block, 2),
        sop_uid=sop_uid or f"{pet_uid(block, 3)}.{index}",
        sop_class_uid=PET_IMAGE_STORAGE,
        modality=modality,
        image_type=("ORIGINAL", "PRIMARY"),
        series_number=1,
        frame_of_reference_uid=pet_uid(block, 4),
        units=units,
        decay_correction=decay_correction,
        patient_weight=weight,
        acquisition_datetime=acquisition_datetime,
        acquisition_date=acquisition_date,
        acquisition_time=acquisition_time,
        radiopharmaceutical_information=items if include_information_sequence else None,
    )


def write_pet_series(
    directory: Path,
    prefix: str,
    *,
    block: int,
    modality: str = "PT",
    units: str | None = "BQML",
    decay_correction: str | None = "START",
    weight: float | None = WEIGHT_KG,
    acquisition_datetime: str | None = ACQUISITION_DATETIME,
    acquisition_date: str | None = None,
    acquisition_time: str | None = None,
    information_items: list[list[tuple[str, Any]]] | None = None,
    include_information_sequence: bool = True,
) -> None:
    """Write two identical PET instances sharing one series UID."""
    for index in (1, 2):
        write_pet_instance(
            directory,
            f"{prefix}-{index}.dcm",
            block=block,
            index=index,
            modality=modality,
            units=units,
            decay_correction=decay_correction,
            weight=weight,
            acquisition_datetime=acquisition_datetime,
            acquisition_date=acquisition_date,
            acquisition_time=acquisition_time,
            information_items=information_items,
            include_information_sequence=include_information_sequence,
        )


def write_pet_bqml(directory: Path) -> None:
    """Valid BQML / START PET series with one complete sequence item."""
    write_pet_series(directory, "pet-bqml", block=4001)


def write_pet_missing_weight(directory: Path) -> None:
    """Valid PET series with the required PatientWeight tag absent."""
    write_pet_series(directory, "pet-missing-weight", block=4002, weight=None)


def write_pet_unsupported_units(directory: Path) -> None:
    """PET series whose Units value is CNTS, not BQML."""
    write_pet_series(directory, "pet-unsupported-units", block=4003, units="CNTS")


def write_pet_invalid_decay(directory: Path) -> None:
    """PET series whose DecayCorrection is NONE."""
    write_pet_series(directory, "pet-invalid-decay", block=4004, decay_correction="NONE")


def write_pet_missing_sequence(directory: Path) -> None:
    """PET series with no RadiopharmaceuticalInformationSequence at all."""
    write_pet_series(
        directory, "pet-missing-sequence", block=4005, include_information_sequence=False
    )


def write_pet_multiple_sequence_items(directory: Path) -> None:
    """PET series whose sequence has two items (ambiguous)."""
    write_pet_series(
        directory,
        "pet-ambiguous",
        block=4006,
        information_items=[information_item(), information_item()],
    )


def write_pet_missing_dose(directory: Path) -> None:
    """Sequence item omits RadionuclideTotalDose."""
    write_pet_series(
        directory, "pet-missing-dose", block=4007, information_items=[information_item(dose=None)]
    )


def write_pet_missing_half_life(directory: Path) -> None:
    """Sequence item omits RadionuclideHalfLife."""
    write_pet_series(
        directory,
        "pet-missing-half-life",
        block=4008,
        information_items=[information_item(half_life=None)],
    )


def write_pet_missing_start_datetime(directory: Path) -> None:
    """Sequence item omits RadiopharmaceuticalStartDateTime."""
    write_pet_series(
        directory,
        "pet-missing-start",
        block=4009,
        information_items=[information_item(start_datetime=None)],
    )


def write_pet_admin_decay(directory: Path) -> None:
    """PET series whose DecayCorrection is ADMIN (deferred in v1)."""
    write_pet_series(directory, "pet-admin", block=4010, decay_correction="ADMIN")


def write_pet_inconsistent_study(directory: Path) -> None:
    """Two instances of one series disagree on StudyInstanceUID."""
    write_pet_instance(directory, "pet-study-1.dcm", block=4011, index=1)
    write_pet_instance(
        directory, "pet-study-2.dcm", block=4011, index=2, study_uid=pet_uid(4011, 9)
    )


def write_pet_duplicate_sop(directory: Path) -> None:
    """Two instances of one series share a SOPInstanceUID."""
    sop = f"{pet_uid(4012, 3)}.1"
    write_pet_instance(directory, "pet-sop-1.dcm", block=4012, index=1, sop_uid=sop)
    write_pet_instance(directory, "pet-sop-2.dcm", block=4012, index=2, sop_uid=sop)


def write_pet_acquisition_date_time(directory: Path) -> None:
    """Valid PET series whose acquisition start uses AcquisitionDate + AcquisitionTime."""
    write_pet_series(
        directory,
        "pet-da-tm",
        block=4013,
        acquisition_datetime=None,
        acquisition_date="20260920",
        acquisition_time="100000",
    )
