"""Per-instance PET validation helpers for SUVbw quantitation (NuClear P2.4).

Each helper is a deterministic, fail-closed predicate over the matched series
instances; the caller in :mod:`dicom.quantitation` maps them to dispositions.
"""

from __future__ import annotations

import math
from collections.abc import Callable

from .pet_metadata import (
    REASON_NON_POSITIVE_HALF_LIFE,
    REASON_NON_POSITIVE_PATIENT_WEIGHT,
    REASON_NON_POSITIVE_TOTAL_DOSE,
    PetInstance,
)
from .quantitation_math import is_close


def first_non_finite(members: list[PetInstance]) -> tuple[str, PetInstance] | None:
    """Return the first non-finite numeric PET tag and its instance."""
    numeric: tuple[tuple[str, Callable[[PetInstance], float | None]], ...] = (
        ("PatientWeight", lambda entry: entry.patient_weight_kg),
        ("RadionuclideTotalDose", lambda entry: entry.radionuclide_total_dose_bq),
        ("RadionuclideHalfLife", lambda entry: entry.radionuclide_half_life_seconds),
    )
    for tag, accessor in numeric:
        for member in members:
            value = accessor(member)
            if value is not None and not math.isfinite(value):
                return tag, member
    return None


def all_consistent(members: list[PetInstance]) -> bool:
    """Return whether the PET tags agree across the series within tolerance."""
    first = members[0]
    for member in members[1:]:
        if (
            member.units != first.units
            or member.decay_correction != first.decay_correction
            or member.radiopharmaceutical_start_datetime
            != first.radiopharmaceutical_start_datetime
            or member.acquisition_datetime != first.acquisition_datetime
        ):
            return False
        pairs = (
            (member.patient_weight_kg, first.patient_weight_kg),
            (member.radionuclide_total_dose_bq, first.radionuclide_total_dose_bq),
            (member.radionuclide_half_life_seconds, first.radionuclide_half_life_seconds),
        )
        for left, right in pairs:
            if left is None or right is None or not is_close(left, right):
                return False
    return True


def non_positive(member: PetInstance) -> tuple[str, str] | None:
    """Return the first non-positive input reason/message, or ``None``."""
    if member.patient_weight_kg is not None and member.patient_weight_kg <= 0.0:
        return REASON_NON_POSITIVE_PATIENT_WEIGHT, "PatientWeight must be positive."
    if member.radionuclide_total_dose_bq is not None and member.radionuclide_total_dose_bq <= 0.0:
        return REASON_NON_POSITIVE_TOTAL_DOSE, "RadionuclideTotalDose must be positive."
    if (
        member.radionuclide_half_life_seconds is not None
        and member.radionuclide_half_life_seconds <= 0.0
    ):
        return REASON_NON_POSITIVE_HALF_LIFE, "RadionuclideHalfLife must be positive."
    return None


def inconsistent_modality(members: list[PetInstance]) -> bool:
    """Return whether the series instances disagree on Modality."""
    return len({member.modality for member in members}) > 1


def inconsistent_study_uid(members: list[PetInstance]) -> bool:
    """Return whether the series instances disagree on StudyInstanceUID."""
    return len({member.study_instance_uid for member in members}) > 1


def duplicate_sop_instance_uid(members: list[PetInstance]) -> bool:
    """Return whether two instances share a non-null SOPInstanceUID."""
    seen: set[str] = set()
    for member in members:
        sop = member.sop_instance_uid
        if sop is None:
            continue
        if sop in seen:
            return True
        seen.add(sop)
    return False
