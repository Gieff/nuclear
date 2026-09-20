"""PET raw acquisition metadata reader and quantitation disposition vocabulary.

Owns the metadata-only :class:`PetInstance` read from a DICOM dataset, the
required PET tag table and the reason/diagnostic labels shared by SUVbw
validation. No formula, no pixel data and no file access happen here.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

from pydicom.dataset import Dataset

from .metadata import Diagnostic, number_from_dataset, text_from_dataset

REQUIRED_PET_TAGS = (
    "PatientWeight",
    "RadionuclideTotalDose",
    "RadionuclideHalfLife",
    "RadiopharmaceuticalStartTime",
    "SeriesTime",
    "Units",
    "DecayCorrection",
)

REASON_MISSING_TAG_PREFIX = "missing-required-tag:"
REASON_SERIES_NOT_FOUND = "series-not-found"
REASON_NOT_A_PET_SERIES = "not-a-pet-series"
REASON_UNSUPPORTED_UNITS = "unsupported-units"
REASON_INVALID_DECAY_CORRECTION = "invalid-decay-correction"
REASON_NON_POSITIVE_PATIENT_WEIGHT = "non-positive-patient-weight"
REASON_NON_POSITIVE_TOTAL_DOSE = "non-positive-total-dose"
REASON_NON_POSITIVE_HALF_LIFE = "non-positive-half-life"
REASON_UNPARSEABLE_TIME = "unparseable-time"
REASON_NEGATIVE_ELAPSED_TIME = "negative-elapsed-time"
REASON_NON_FINITE_PET_METADATA = "non-finite-pet-metadata"
REASON_NON_POSITIVE_DECAYED_DOSE = "non-positive-decayed-dose"
REASON_NON_FINITE_SUV_FACTOR = "non-finite-suv-factor"
REASON_INCONSISTENT_PET_METADATA = "inconsistent-pet-metadata"

DIAGNOSTIC_NON_POSITIVE_DECAYED_DOSE = "dicom.quantitation.non-positive-decayed-dose"

SUPPORTED_UNITS = "BQML"
SUPPORTED_DECAY_CORRECTIONS = frozenset({"START", "ADMIN"})


@dataclass(frozen=True)
class PetInstance:
    """Metadata-only PET acquisition tags for one DICOM instance."""

    study_instance_uid: str | None
    series_instance_uid: str | None
    sop_instance_uid: str | None
    modality: str | None
    units: str | None
    decay_correction: str | None
    radionuclide_half_life_seconds: float | None
    radionuclide_total_dose_bq: float | None
    radiopharmaceutical_start_time: str | None
    series_time: str | None
    patient_weight_kg: float | None
    file: str


def pet_instance_from_dataset(dataset: Dataset, file_name: str) -> PetInstance:
    """Extract PET acquisition tags from a dataset read with ``stop_before_pixels``."""
    return PetInstance(
        study_instance_uid=text_from_dataset(dataset, "StudyInstanceUID"),
        series_instance_uid=text_from_dataset(dataset, "SeriesInstanceUID"),
        sop_instance_uid=text_from_dataset(dataset, "SOPInstanceUID"),
        modality=text_from_dataset(dataset, "Modality"),
        units=text_from_dataset(dataset, "Units"),
        decay_correction=text_from_dataset(dataset, "DecayCorrection"),
        radionuclide_half_life_seconds=number_from_dataset(dataset, "RadionuclideHalfLife"),
        radionuclide_total_dose_bq=number_from_dataset(dataset, "RadionuclideTotalDose"),
        radiopharmaceutical_start_time=text_from_dataset(dataset, "RadiopharmaceuticalStartTime"),
        series_time=text_from_dataset(dataset, "SeriesTime"),
        patient_weight_kg=number_from_dataset(dataset, "PatientWeight"),
        file=file_name,
    )


_PET_ACCESSORS: tuple[tuple[str, Callable[[PetInstance], object]], ...] = (
    ("PatientWeight", lambda item: item.patient_weight_kg),
    ("RadionuclideTotalDose", lambda item: item.radionuclide_total_dose_bq),
    ("RadionuclideHalfLife", lambda item: item.radionuclide_half_life_seconds),
    ("RadiopharmaceuticalStartTime", lambda item: item.radiopharmaceutical_start_time),
    ("SeriesTime", lambda item: item.series_time),
    ("Units", lambda item: item.units),
    ("DecayCorrection", lambda item: item.decay_correction),
)


def first_missing_pet_tag(members: list[PetInstance]) -> tuple[str, PetInstance] | None:
    """Return the first missing required PET tag and its instance."""
    for tag, accessor in _PET_ACCESSORS:
        for member in members:
            if accessor(member) is None:
                return tag, member
    return None


def pet_diagnostic(reason: str, message: str, file_name: str | None) -> Diagnostic:
    """Build an error diagnostic for a quantitation disposition reason."""
    return Diagnostic(
        code=f"dicom.quantitation.{reason}", severity="error", message=message, file=file_name
    )


def emit_diagnostics(*groups: Sequence[Diagnostic]) -> list[dict[str, str | None]]:
    """Flatten and sort diagnostic groups by ``(code, file)``."""
    collected = [item for group in groups for item in group]
    collected.sort(key=lambda item: (item.code, item.file or ""))
    return [item.as_dict() for item in collected]
