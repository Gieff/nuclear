"""Fail-closed SUVbw quantitation result assembly (NuClear P2.4).

Deterministic validation order: series match -> identity invariants (study UID,
unique SOP, modality) -> exactly one radiopharmaceutical sequence item -> missing
required tags (``unavailable``) -> non-finite input -> metadata consistency ->
non-positive inputs -> units -> decay correction -> DT parsing -> negative
elapsed time -> formula -> derived guards (``invalid``). A ``suvFactor`` key is
emitted only for ``status == "computed"``; no plausible fallback is produced.

Only ``DecayCorrection == START`` computes: it decays to the acquisition start
instant. ``ADMIN`` references radiopharmaceutical administration instead and is
deferred in v1.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

from .metadata import Diagnostic
from .pet_metadata import (
    REASON_AMBIGUOUS_RADIOPHARMACEUTICAL_INFORMATION,
    REASON_AMBIGUOUS_TIME_BASE,
    REASON_DUPLICATE_SOP_INSTANCE_UID,
    REASON_INCONSISTENT_PET_METADATA,
    REASON_INCONSISTENT_STUDY_UID,
    REASON_INVALID_DECAY_CORRECTION,
    REASON_MISSING_TAG_PREFIX,
    REASON_NEGATIVE_ELAPSED_TIME,
    REASON_NON_FINITE_PET_METADATA,
    REASON_NON_FINITE_SUV_FACTOR,
    REASON_NON_POSITIVE_DECAYED_DOSE,
    REASON_NOT_A_PET_SERIES,
    REASON_SERIES_NOT_FOUND,
    REASON_UNPARSEABLE_TIME,
    REASON_UNSUPPORTED_DECAY_CORRECTION,
    REASON_UNSUPPORTED_UNITS,
    SUPPORTED_DECAY_CORRECTIONS,
    SUPPORTED_UNITS,
    PetInstance,
    emit_diagnostics,
    first_missing_pet_tag,
    has_ambiguous_radiopharmaceutical_information,
    pet_diagnostic,
)
from .quantitation_math import decayed_dose_bq, elapsed_seconds, suv_factor_bw, time_base_ambiguous
from .quantitation_validation import (
    all_consistent,
    duplicate_sop_instance_uid,
    first_non_finite,
    inconsistent_modality,
    inconsistent_study_uid,
    non_positive,
)


def _pet_acquisition(member: PetInstance) -> dict[str, Any]:
    """Return the present and finite PET acquisition fields for one instance."""
    acquisition: dict[str, Any] = {}
    if member.units is not None:
        acquisition["units"] = member.units
    if member.decay_correction is not None:
        acquisition["decayCorrection"] = member.decay_correction
    half_life = member.radionuclide_half_life_seconds
    if half_life is not None and math.isfinite(half_life):
        acquisition["radionuclideHalfLifeSeconds"] = half_life
    total_dose = member.radionuclide_total_dose_bq
    if total_dose is not None and math.isfinite(total_dose):
        acquisition["radionuclideTotalDoseBq"] = total_dose
    if member.radiopharmaceutical_start_datetime is not None:
        acquisition["radiopharmaceuticalStartDateTime"] = member.radiopharmaceutical_start_datetime
    if member.acquisition_datetime is not None:
        acquisition["acquisitionDateTime"] = member.acquisition_datetime
    weight = member.patient_weight_kg
    if weight is not None and math.isfinite(weight):
        acquisition["patientWeightKg"] = weight
    return acquisition


def _result(
    status: str,
    series_uid: str,
    study_uid: str | None,
    acquisition: dict[str, Any],
    source_diagnostics: Sequence[Diagnostic],
    *,
    reason: str | None = None,
    message: str | None = None,
    file_name: str | None = None,
    elapsed: float | None = None,
    decayed: float | None = None,
    factor: float | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "method": "suv-bw",
        "status": status,
        "seriesInstanceUID": series_uid,
        "studyInstanceUID": study_uid,
        "petAcquisition": acquisition,
        "elapsedSeconds": elapsed,
        "decayedDoseBq": decayed,
    }
    if factor is not None:
        result["suvFactor"] = factor
    if message is not None:
        result["diagnostic"] = message
    owned = [pet_diagnostic(reason, message, file_name)] if reason is not None and message is not None else []
    result["diagnostics"] = emit_diagnostics(owned, source_diagnostics)
    return result


def _reject(
    reason: str, message: str, member: PetInstance, series_uid: str, study_uid: str | None,
    acquisition: dict[str, Any], source_diagnostics: Sequence[Diagnostic],
) -> dict[str, Any]:
    return _result(
        "invalid", series_uid, study_uid, acquisition, source_diagnostics,
        reason=reason, message=message, file_name=member.file)


def build_quantitation_result(
    instances: list[PetInstance], series_uid: str, source_diagnostics: Sequence[Diagnostic]
) -> dict[str, Any]:
    """Build the deterministic SUVbw result for one series UID.

    Args:
        instances: PET metadata records read from the source.
        series_uid: Requested ``SeriesInstanceUID``.
        source_diagnostics: Skip diagnostics produced while reading the source.

    Returns:
        The ``suv-bw`` payload without ``workerMetadata``. ``suvFactor`` is
        present only when ``status == "computed"``.
    """
    matched = [item for item in instances if item.series_instance_uid == series_uid]
    if not matched:
        return _result(
            "unavailable", series_uid, None, {}, source_diagnostics,
            reason=REASON_SERIES_NOT_FOUND, message="No instance matches the requested series.")
    member = matched[0]
    study_uid = member.study_instance_uid
    acquisition = _pet_acquisition(member)
    def reject(reason: str, message: str) -> dict[str, Any]:
        return _reject(reason, message, member, series_uid, study_uid, acquisition, source_diagnostics)

    if inconsistent_study_uid(matched):
        return reject(REASON_INCONSISTENT_STUDY_UID, "Instances disagree on StudyInstanceUID.")
    if duplicate_sop_instance_uid(matched):
        return reject(REASON_DUPLICATE_SOP_INSTANCE_UID, "SOPInstanceUID must be unique within a series.")
    if inconsistent_modality(matched):
        return reject(REASON_INCONSISTENT_PET_METADATA, "Instances disagree on Modality.")
    if member.modality != "PT":
        return _result(
            "unavailable", series_uid, study_uid, acquisition, source_diagnostics,
            reason=REASON_NOT_A_PET_SERIES, message="Series modality is not PT.",
            file_name=member.file)
    if has_ambiguous_radiopharmaceutical_information(matched):
        return reject(
            REASON_AMBIGUOUS_RADIOPHARMACEUTICAL_INFORMATION,
            "Series has more than one RadiopharmaceuticalInformationSequence item.")
    missing = first_missing_pet_tag(matched)
    if missing is not None:
        tag, offender = missing
        return _result(
            "unavailable", series_uid, study_uid, acquisition, source_diagnostics,
            reason=f"{REASON_MISSING_TAG_PREFIX}{tag}",
            message=f"Instance is missing required tag {tag}.", file_name=offender.file)
    non_finite = first_non_finite(matched)
    if non_finite is not None:
        tag, offender = non_finite
        return _result(
            "invalid", series_uid, study_uid, acquisition, source_diagnostics,
            reason=REASON_NON_FINITE_PET_METADATA,
            message=f"Instance has a non-finite {tag}.", file_name=offender.file)
    if not all_consistent(matched):
        return reject(REASON_INCONSISTENT_PET_METADATA, "Instances disagree on PET acquisition metadata.")
    positivity = non_positive(member)
    if positivity is not None:
        reason, message = positivity
        return reject(reason, message)
    if member.units != SUPPORTED_UNITS:
        return reject(REASON_UNSUPPORTED_UNITS, f"Units '{member.units}' is not {SUPPORTED_UNITS}.")
    if member.decay_correction == "ADMIN":
        return reject(
            REASON_UNSUPPORTED_DECAY_CORRECTION,
            "DecayCorrection ADMIN references radiopharmaceutical administration; deferred in v1.")
    if member.decay_correction not in SUPPORTED_DECAY_CORRECTIONS:
        return reject(
            REASON_INVALID_DECAY_CORRECTION,
            f"DecayCorrection '{member.decay_correction}' is not START.")
    start_datetime = member.radiopharmaceutical_start_datetime
    acquisition_datetime = member.acquisition_datetime
    if start_datetime is None or acquisition_datetime is None:
        missing_tag = (
            "RadiopharmaceuticalStartDateTime" if start_datetime is None else "AcquisitionDateTime"
        )
        return _result(
            "unavailable", series_uid, study_uid, acquisition, source_diagnostics,
            reason=f"{REASON_MISSING_TAG_PREFIX}{missing_tag}",
            message=f"Instance is missing required tag {missing_tag}.", file_name=member.file)
    if time_base_ambiguous(acquisition_datetime, start_datetime):
        return reject(
            REASON_AMBIGUOUS_TIME_BASE,
            "Acquisition and administration timestamps use different time bases "
            "(one declares a UTC offset, the other does not).")
    elapsed = elapsed_seconds(acquisition_datetime, start_datetime)
    if elapsed is None:
        return reject(
            REASON_UNPARSEABLE_TIME,
            "RadiopharmaceuticalStartDateTime or the acquisition instant is not a valid DICOM DT value.")
    if elapsed < 0.0:
        return reject(
            REASON_NEGATIVE_ELAPSED_TIME,
            "Acquisition start precedes radiopharmaceutical administration; negative elapsed is deferred.")
    total_dose = member.radionuclide_total_dose_bq
    half_life = member.radionuclide_half_life_seconds
    weight = member.patient_weight_kg
    if total_dose is None or half_life is None or weight is None:
        missing_tag = next(
            tag for tag, value in (
                ("RadionuclideTotalDose", total_dose),
                ("RadionuclideHalfLife", half_life),
                ("PatientWeight", weight),
            ) if value is None
        )
        return _result(
            "unavailable", series_uid, study_uid, acquisition, source_diagnostics,
            reason=f"{REASON_MISSING_TAG_PREFIX}{missing_tag}",
            message=f"Instance is missing required tag {missing_tag}.", file_name=member.file)
    decayed = decayed_dose_bq(total_dose, half_life, elapsed)
    if not math.isfinite(decayed) or decayed <= 0.0:
        return reject(
            REASON_NON_POSITIVE_DECAYED_DOSE,
            "Derived decay-corrected dose is not finite and positive.")
    factor = suv_factor_bw(weight, decayed)
    if not math.isfinite(factor) or factor <= 0.0:
        return reject(
            REASON_NON_FINITE_SUV_FACTOR, "Derived SUVbw factor is not finite and positive.")
    return _result(
        "computed", series_uid, study_uid, acquisition, source_diagnostics,
        elapsed=elapsed, decayed=decayed, factor=factor)
