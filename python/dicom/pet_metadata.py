"""PET raw acquisition metadata reader and quantitation disposition vocabulary.

Dose, half-life and the administration instant are read from the single item of
``RadiopharmaceuticalInformationSequence`` (0054,0016), never from the dataset
root (DICOM PS3.3 C.8.9.2). ``Units`` (0054,1001), ``DecayCorrection``
(0054,1102) and ``PatientWeight`` (0010,1030) are root-level (PET Series
Module). Acquisition start comes from ``AcquisitionDateTime`` (0008,002A) or
``AcquisitionDate`` (0008,0022) + ``AcquisitionTime`` (0008,0032). No formula,
no pixel data and no file access happen here.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

from pydicom.dataset import Dataset

from .metadata import Diagnostic, number_from_dataset, text_from_dataset

REQUIRED_PET_TAGS = (
    "StudyInstanceUID",
    "RadiopharmaceuticalInformationSequence",
    "PatientWeight",
    "Units",
    "DecayCorrection",
    "RadionuclideTotalDose",
    "RadionuclideHalfLife",
    "RadiopharmaceuticalStartDateTime",
    "AcquisitionDateTime",
)

REASON_MISSING_TAG_PREFIX = "missing-required-tag:"
REASON_SERIES_NOT_FOUND = "series-not-found"
REASON_NOT_A_PET_SERIES = "not-a-pet-series"
REASON_UNSUPPORTED_UNITS = "unsupported-units"
REASON_INVALID_DECAY_CORRECTION = "invalid-decay-correction"
REASON_UNSUPPORTED_DECAY_CORRECTION = "unsupported-decay-correction"
REASON_AMBIGUOUS_RADIOPHARMACEUTICAL_INFORMATION = "ambiguous-radiopharmaceutical-information"
REASON_NON_POSITIVE_PATIENT_WEIGHT = "non-positive-patient-weight"
REASON_NON_POSITIVE_TOTAL_DOSE = "non-positive-total-dose"
REASON_NON_POSITIVE_HALF_LIFE = "non-positive-half-life"
REASON_UNPARSEABLE_TIME = "unparseable-time"
REASON_NEGATIVE_ELAPSED_TIME = "negative-elapsed-time"
REASON_AMBIGUOUS_TIME_BASE = "ambiguous-time-base"
REASON_NON_FINITE_PET_METADATA = "non-finite-pet-metadata"
REASON_NON_POSITIVE_DECAYED_DOSE = "non-positive-decayed-dose"
REASON_NON_FINITE_SUV_FACTOR = "non-finite-suv-factor"
REASON_INCONSISTENT_PET_METADATA = "inconsistent-pet-metadata"
REASON_INCONSISTENT_STUDY_UID = "inconsistent-study-uid"
REASON_DUPLICATE_SOP_INSTANCE_UID = "duplicate-sop-instance-uid"

DIAGNOSTIC_NON_POSITIVE_DECAYED_DOSE = "dicom.quantitation.non-positive-decayed-dose"
DIAGNOSTIC_UNSUPPORTED_DECAY_CORRECTION = "dicom.quantitation.unsupported-decay-correction"
DIAGNOSTIC_AMBIGUOUS_TIME_BASE = "dicom.quantitation.ambiguous-time-base"
DIAGNOSTIC_AMBIGUOUS_RADIOPHARMACEUTICAL_INFORMATION = (
    "dicom.quantitation.ambiguous-radiopharmaceutical-information"
)

SUPPORTED_UNITS = "BQML"
SUPPORTED_DECAY_CORRECTIONS = frozenset({"START"})  # ADMIN references a different event (deferred)


@dataclass(frozen=True)
class PetInstance:
    """Metadata-only PET acquisition tags for one DICOM instance."""

    study_instance_uid: str | None
    series_instance_uid: str | None
    sop_instance_uid: str | None
    modality: str | None
    units: str | None
    decay_correction: str | None
    patient_weight_kg: float | None
    radiopharmaceutical_sequence_count: int
    radionuclide_half_life_seconds: float | None
    radionuclide_total_dose_bq: float | None
    radiopharmaceutical_start_datetime: str | None
    acquisition_datetime: str | None
    file: str


def _sequence_items(dataset: Dataset) -> list[Dataset]:
    value = dataset.get("RadiopharmaceuticalInformationSequence")
    if value is None or isinstance(value, (str, bytes)) or not hasattr(value, "__iter__"):
        return []
    return [item for item in value if isinstance(item, Dataset)]


def _acquisition_datetime(dataset: Dataset) -> str | None:
    explicit = text_from_dataset(dataset, "AcquisitionDateTime")
    if explicit is not None:
        return explicit
    date_value = text_from_dataset(dataset, "AcquisitionDate")
    time_value = text_from_dataset(dataset, "AcquisitionTime")
    if date_value is not None and time_value is not None:
        return f"{date_value}{time_value}"
    return None


def pet_instance_from_dataset(dataset: Dataset, file_name: str) -> PetInstance:
    """Extract PET acquisition tags from a dataset read with ``stop_before_pixels``."""
    items = _sequence_items(dataset)
    item = items[0] if len(items) == 1 else None
    return PetInstance(
        study_instance_uid=text_from_dataset(dataset, "StudyInstanceUID"),
        series_instance_uid=text_from_dataset(dataset, "SeriesInstanceUID"),
        sop_instance_uid=text_from_dataset(dataset, "SOPInstanceUID"),
        modality=text_from_dataset(dataset, "Modality"),
        units=text_from_dataset(dataset, "Units"),
        decay_correction=text_from_dataset(dataset, "DecayCorrection"),
        patient_weight_kg=number_from_dataset(dataset, "PatientWeight"),
        radiopharmaceutical_sequence_count=len(items),
        radionuclide_half_life_seconds=number_from_dataset(item, "RadionuclideHalfLife")
        if item is not None
        else None,
        radionuclide_total_dose_bq=number_from_dataset(item, "RadionuclideTotalDose")
        if item is not None
        else None,
        radiopharmaceutical_start_datetime=text_from_dataset(item, "RadiopharmaceuticalStartDateTime")
        if item is not None
        else None,
        acquisition_datetime=_acquisition_datetime(dataset),
        file=file_name,
    )


_PET_ACCESSORS: tuple[tuple[str, Callable[[PetInstance], object]], ...] = (
    ("StudyInstanceUID", lambda entry: entry.study_instance_uid),
    ("PatientWeight", lambda entry: entry.patient_weight_kg),
    ("Units", lambda entry: entry.units),
    ("DecayCorrection", lambda entry: entry.decay_correction),
    ("RadionuclideTotalDose", lambda entry: entry.radionuclide_total_dose_bq),
    ("RadionuclideHalfLife", lambda entry: entry.radionuclide_half_life_seconds),
    ("RadiopharmaceuticalStartDateTime", lambda entry: entry.radiopharmaceutical_start_datetime),
    ("AcquisitionDateTime", lambda entry: entry.acquisition_datetime),
)


def first_missing_pet_tag(members: list[PetInstance]) -> tuple[str, PetInstance] | None:
    """Return the first missing required PET tag and its instance.

    The sequence itself is checked before its item tags, so an absent or empty
    ``RadiopharmaceuticalInformationSequence`` is reported as
    ``missing-required-tag:RadiopharmaceuticalInformationSequence``.
    """
    for member in members:
        if member.radiopharmaceutical_sequence_count == 0:
            return "RadiopharmaceuticalInformationSequence", member
    for tag, accessor in _PET_ACCESSORS:
        for member in members:
            if accessor(member) is None:
                return tag, member
    return None


def has_ambiguous_radiopharmaceutical_information(members: list[PetInstance]) -> bool:
    """Return whether any instance has more than one sequence item."""
    return any(member.radiopharmaceutical_sequence_count > 1 for member in members)


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
