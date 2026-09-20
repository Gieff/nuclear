"""Deterministic synthetic PET datasets for the P2.4 quantitation fixtures.

All datasets are metadata-only (no pixels) with fixed UIDs. The default values
form a valid BQML / START series; individual writers omit or alter exactly one
input so every disposition has a deterministic, reproducible fixture.
"""

from __future__ import annotations

from pathlib import Path

from synthetic_common import write_metadata_dataset

from dicom.metadata import PET_IMAGE_STORAGE

WEIGHT_KG = 70.0
TOTAL_DOSE_BQ = 370_000_000.0
HALF_LIFE_SECONDS = 6586.2
START_TIME = "090000"
SERIES_TIME = "100000"


def pet_uid(block: int, suffix: int) -> str:
    """Return a fixed valid UID inside the P2.4 synthetic UID root."""
    return f"1.2.826.0.1.3680043.10.{block}.{suffix}"


BQML_SERIES_UID = pet_uid(4001, 2)
MISSING_WEIGHT_SERIES_UID = pet_uid(4002, 2)
UNSUPPORTED_UNITS_SERIES_UID = pet_uid(4003, 2)
INVALID_DECAY_SERIES_UID = pet_uid(4004, 2)


def write_pet_instance(
    directory: Path,
    file_name: str,
    *,
    block: int,
    index: int = 1,
    study_uid: str | None = None,
    series_uid: str | None = None,
    modality: str = "PT",
    units: str | None = "BQML",
    decay_correction: str | None = "START",
    half_life: float | None = HALF_LIFE_SECONDS,
    total_dose: float | None = TOTAL_DOSE_BQ,
    start_time: str | None = START_TIME,
    series_time: str | None = SERIES_TIME,
    weight: float | None = WEIGHT_KG,
) -> None:
    """Write one metadata-only PET instance, omitting any ``None`` input tag."""
    write_metadata_dataset(
        directory,
        file_name,
        study_uid=study_uid or pet_uid(block, 1),
        series_uid=series_uid or pet_uid(block, 2),
        sop_uid=f"{pet_uid(block, 3)}.{index}",
        sop_class_uid=PET_IMAGE_STORAGE,
        modality=modality,
        image_type=("ORIGINAL", "PRIMARY"),
        series_number=1,
        frame_of_reference_uid=pet_uid(block, 4),
        units=units,
        decay_correction=decay_correction,
        radionuclide_half_life=half_life,
        radionuclide_total_dose=total_dose,
        radiopharmaceutical_start_time=start_time,
        series_time=series_time,
        patient_weight=weight,
    )


def write_pet_series(
    directory: Path,
    prefix: str,
    *,
    block: int,
    modality: str = "PT",
    units: str | None = "BQML",
    decay_correction: str | None = "START",
    half_life: float | None = HALF_LIFE_SECONDS,
    total_dose: float | None = TOTAL_DOSE_BQ,
    start_time: str | None = START_TIME,
    series_time: str | None = SERIES_TIME,
    weight: float | None = WEIGHT_KG,
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
            half_life=half_life,
            total_dose=total_dose,
            start_time=start_time,
            series_time=series_time,
            weight=weight,
        )


def write_pet_bqml(directory: Path) -> None:
    """Valid BQML / START PET series with all quantitation inputs."""
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
