"""Authoritative SUVbw formula, DICOM TM parsing and named FP tolerances.

Formula (nuclear-dicom runbook §C, implemented verbatim)::

    elapsedSeconds = SeriesTime - RadiopharmaceuticalStartTime   # same day
    decayedDoseBq  = radionuclideTotalDoseBq
                     * exp(-ln(2) * elapsedSeconds / radionuclideHalfLifeSeconds)
    suvFactor      = patientWeightKg * 1000 / decayedDoseBq     # g/Bq

No SUV value and no pixel data are produced here.

The named tolerances are floating-point comparison tolerances for deterministic
synthetic fixtures. They are **not clinical acceptance thresholds**; real-world
tolerance policy is explicitly deferred.
"""

from __future__ import annotations

import math

SUV_FACTOR_RELATIVE_TOLERANCE = 1e-9  # relative FP comparison for suvFactor
ELAPSED_SECONDS_EPSILON = 1e-6  # seconds; TM parsing / decay comparison
PET_METADATA_RELATIVE_TOLERANCE = 1e-9  # numeric PET tag consistency
LN2 = math.log(2.0)


def parse_dicom_time(value: str) -> float | None:
    """Parse a DICOM TM value into seconds since midnight.

    Accepts ``HH``, ``HHMM``, ``HHMMSS`` with optional ``.FFFFFF`` fractional
    seconds.

    Args:
        value: Raw DICOM TM string.

    Returns:
        Seconds since midnight, or ``None`` when the value is not a valid TM.
    """
    text = value.strip()
    if not text:
        return None
    main, _, fraction = text.partition(".")
    if not main.isdigit() or (fraction and not fraction.isdigit()):
        return None
    if len(main) == 2:
        hours, minutes, seconds = int(main), 0, 0
    elif len(main) == 4:
        hours, minutes, seconds = int(main[:2]), int(main[2:4]), 0
    elif len(main) == 6:
        hours, minutes, seconds = int(main[:2]), int(main[2:4]), int(main[4:6])
    else:
        return None
    if hours > 23 or minutes > 59 or seconds > 60:
        return None
    fractional = float(f"0.{fraction}") if fraction else 0.0
    return hours * 3600 + minutes * 60 + seconds + fractional


def elapsed_seconds(series_time: str, start_time: str) -> float | None:
    """Return ``SeriesTime - RadiopharmaceuticalStartTime`` in seconds (same day)."""
    series = parse_dicom_time(series_time)
    start = parse_dicom_time(start_time)
    if series is None or start is None:
        return None
    return series - start


def decayed_dose_bq(
    radionuclide_total_dose_bq: float, radionuclide_half_life_seconds: float, elapsed: float
) -> float:
    """Return the decay-corrected injected dose in becquerels."""
    return radionuclide_total_dose_bq * math.exp(
        -LN2 * elapsed / radionuclide_half_life_seconds
    )


def suv_factor_bw(patient_weight_kg: float, decayed_dose_bq: float) -> float:
    """Return the body-weight SUV scaling factor in grams per becquerel (g/Bq)."""
    return patient_weight_kg * 1000.0 / decayed_dose_bq


def is_close(left: float, right: float) -> bool:
    """Return whether two PET metadata floats agree within the named tolerance."""
    if left == right:
        return True
    return abs(left - right) <= PET_METADATA_RELATIVE_TOLERANCE * max(abs(left), abs(right))
