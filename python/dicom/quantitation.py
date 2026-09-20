"""Fail-closed SUVbw quantitation result assembly (NuClear P2.4).

Deterministic validation order: series match -> modality -> missing required
tags (``unavailable``) -> non-finite input -> metadata consistency ->
non-positive inputs -> units -> decay correction -> TM parsing -> negative
elapsed time -> formula -> factor finiteness (``invalid``). A ``suvFactor`` key
is emitted only for ``status == "computed"``; no plausible fallback is produced.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

from .metadata import Diagnostic
from .pet_metadata import (
    REASON_INCONSISTENT_PET_METADATA,
    REASON_INVALID_DECAY_CORRECTION,
    REASON_MISSING_TAG_PREFIX,
    REASON_NEGATIVE_ELAPSED_TIME,
    REASON_NON_FINITE_PET_METADATA,
    REASON_NON_FINITE_SUV_FACTOR,
    REASON_NON_POSITIVE_DECAYED_DOSE,
    REASON_NOT_A_PET_SERIES,
    REASON_SERIES_NOT_FOUND,
    REASON_UNPARSEABLE_TIME,
    REASON_UNSUPPORTED_UNITS,
    SUPPORTED_DECAY_CORRECTIONS,
    SUPPORTED_UNITS,
    PetInstance,
    emit_diagnostics,
    first_missing_pet_tag,
    pet_diagnostic,
)
from .quantitation_math import decayed_dose_bq, elapsed_seconds, suv_factor_bw
from .quantitation_validation import (
    all_consistent,
    first_non_finite,
    inconsistent_modality,
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
    if member.radiopharmaceutical_start_time is not None:
        acquisition["radiopharmaceuticalStartTime"] = member.radiopharmaceutical_start_time
    if member.series_time is not None:
        acquisition["seriesTime"] = member.series_time
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
    study_uid = member.study_instance_uid or ""
    acquisition = _pet_acquisition(member)
    if inconsistent_modality(matched):
        return _result(
            "invalid", series_uid, study_uid, acquisition, source_diagnostics,
            reason=REASON_INCONSISTENT_PET_METADATA,
            message="Instances disagree on Modality.", file_name=matched[-1].file)
    if member.modality != "PT":
        return _result(
            "unavailable", series_uid, study_uid, acquisition, source_diagnostics,
            reason=REASON_NOT_A_PET_SERIES, message="Series modality is not PT.",
            file_name=member.file)
    missing = first_missing_pet_tag(matched)
    if missing is not None:
        tag, offender = missing
        return _result(
            "unavailable", series_uid, study_uid, acquisition, source_diagnostics,
            reason=f"{REASON_MISSING_TAG_PREFIX}{tag}",
            message=f"Instance is missing required tag {tag}.", file_name=offender.file,
        )
    non_finite = first_non_finite(matched)
    if non_finite is not None:
        tag, offender = non_finite
        return _result(
            "invalid", series_uid, study_uid, acquisition, source_diagnostics,
            reason=REASON_NON_FINITE_PET_METADATA,
            message=f"Instance has a non-finite {tag}.", file_name=offender.file,
        )
    if not all_consistent(matched):
        return _result(
            "invalid", series_uid, study_uid, acquisition, source_diagnostics,
            reason=REASON_INCONSISTENT_PET_METADATA,
            message="Instances disagree on PET acquisition metadata.", file_name=matched[-1].file)
    positivity = non_positive(member)
    if positivity is not None:
        reason, message = positivity
        return _result(
            "invalid", series_uid, study_uid, acquisition, source_diagnostics,
            reason=reason, message=message, file_name=member.file,
        )
    if member.units != SUPPORTED_UNITS:
        return _result(
            "invalid", series_uid, study_uid, acquisition, source_diagnostics,
            reason=REASON_UNSUPPORTED_UNITS,
            message=f"Units '{member.units}' is not {SUPPORTED_UNITS}.", file_name=member.file)
    if member.decay_correction not in SUPPORTED_DECAY_CORRECTIONS:
        return _result(
            "invalid", series_uid, study_uid, acquisition, source_diagnostics,
            reason=REASON_INVALID_DECAY_CORRECTION,
            message=f"DecayCorrection '{member.decay_correction}' is not START or ADMIN.",
            file_name=member.file)
    start_time = member.radiopharmaceutical_start_time
    series_time = member.series_time
    assert start_time is not None and series_time is not None  # missing check passed
    elapsed = elapsed_seconds(series_time, start_time)
    if elapsed is None:
        return _result(
            "invalid", series_uid, study_uid, acquisition, source_diagnostics,
            reason=REASON_UNPARSEABLE_TIME,
            message="RadiopharmaceuticalStartTime or SeriesTime is not a valid DICOM TM value.",
            file_name=member.file)
    if elapsed < 0.0:
        return _result(
            "invalid", series_uid, study_uid, acquisition, source_diagnostics,
            reason=REASON_NEGATIVE_ELAPSED_TIME,
            message="SeriesTime precedes RadiopharmaceuticalStartTime; cross-midnight handling is deferred.",
            file_name=member.file,
        )
    total_dose = member.radionuclide_total_dose_bq
    half_life = member.radionuclide_half_life_seconds
    weight = member.patient_weight_kg
    assert total_dose is not None and half_life is not None and weight is not None
    decayed = decayed_dose_bq(total_dose, half_life, elapsed)
    if not math.isfinite(decayed) or decayed <= 0.0:
        return _result(
            "invalid", series_uid, study_uid, acquisition, source_diagnostics,
            reason=REASON_NON_POSITIVE_DECAYED_DOSE,
            message="Derived decay-corrected dose is not finite and positive.",
            file_name=member.file)
    factor = suv_factor_bw(weight, decayed)
    if not math.isfinite(factor) or factor <= 0.0:
        return _result(
            "invalid", series_uid, study_uid, acquisition, source_diagnostics,
            reason=REASON_NON_FINITE_SUV_FACTOR,
            message="Derived SUVbw factor is not finite and positive.", file_name=member.file)
    return _result(
        "computed", series_uid, study_uid, acquisition, source_diagnostics,
        elapsed=elapsed, decayed=decayed, factor=factor,
    )
