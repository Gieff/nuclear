"""Authoritative SUVbw formula, DICOM DT parsing and named FP tolerances.

Formula (nuclear-dicom runbook §C; DICOM PS3.3 C.8.9.1.1.5)::

    elapsedSeconds = acquisitionStart - radiopharmaceuticalAdministration
    decayedDoseBq  = radionuclideTotalDoseBq
                     * exp(-ln(2) * elapsedSeconds / radionuclideHalfLifeSeconds)
    suvFactor      = patientWeightKg * 1000 / decayedDoseBq     # g/Bq

``START`` decays to the acquisition start instant; ``ADMIN`` would reference the
administration instant instead and is deferred in v1 (see ``quantitation.py``).
Both timestamps of one computation must use the same timezone convention: an
offset-aware and an offset-less DT are an ambiguous time base and fail closed.
No SUV value and no pixel data are produced here.

The named tolerances are floating-point comparison tolerances for deterministic
synthetic fixtures. They are **not clinical acceptance thresholds**; real-world
tolerance policy is explicitly deferred.
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timedelta, timezone

SUV_FACTOR_RELATIVE_TOLERANCE = 1e-9  # relative FP comparison for suvFactor
ELAPSED_SECONDS_EPSILON = 1e-6  # seconds; DT parsing / decay comparison
PET_METADATA_RELATIVE_TOLERANCE = 1e-9  # numeric PET tag consistency
LN2 = math.log(2.0)

_DT_PATTERN = re.compile(
    r"^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d{1,6}))?(?:([+-])(\d{2})(\d{2}))?$"
)


def parse_dicom_datetime_parts(value: str) -> tuple[float, bool] | None:
    """Parse a DICOM DT value into ``(epoch_seconds, has_explicit_offset)``.

    Accepts ``YYYYMMDDHHMMSS`` with optional ``.FFFFFF`` fractional seconds and
    an optional ``+HHMM``/``-HHMM`` offset. An offset-less value is treated as
    UTC so that two offset-less instants compare deterministically.

    Per DICOM PS3.5 §6.2 the offset ``&ZZXX`` is 4 digits in the range
    ``-1200``..``+1400``: minutes are ``00``-``59``; ``+HH`` is ``00``-``14``
    with minutes ``00`` when ``HH == 14``; ``-HH`` is ``00``-``12`` with minutes
    ``00`` when ``HH == 12``; ``-0000`` is not allowed while ``+0000`` is the
    UTC offset and is allowed.

    Args:
        value: Raw DICOM DT string.

    Returns:
        The epoch seconds and whether an explicit offset was present, or
        ``None`` when the value is not a valid DT (including an invalid offset).
    """
    match = _DT_PATTERN.match(value.strip())
    if match is None:
        return None
    year, month, day, hour, minute, second = (int(match.group(index)) for index in range(1, 7))
    fraction = match.group(7) or ""
    microsecond = int(fraction.ljust(6, "0")) if fraction else 0
    tzinfo = timezone.utc
    sign = match.group(8)
    if sign is not None:
        offset_hours, offset_minutes = int(match.group(9)), int(match.group(10))
        hour_limit = 14 if sign == "+" else 12
        if offset_minutes > 59 or offset_hours > hour_limit:
            return None
        if offset_hours == hour_limit and offset_minutes != 0:
            return None
        if sign == "-" and offset_hours == 0 and offset_minutes == 0:
            return None
        offset = timedelta(hours=offset_hours, minutes=offset_minutes)
        tzinfo = timezone(-offset if sign == "-" else offset)
    try:
        moment = datetime(year, month, day, hour, minute, second, microsecond, tzinfo=tzinfo)
    except ValueError:
        return None
    return moment.timestamp(), sign is not None


def parse_dicom_datetime(value: str) -> float | None:
    """Parse a DICOM DT value into epoch seconds, or ``None`` when invalid."""
    parts = parse_dicom_datetime_parts(value)
    return None if parts is None else parts[0]


def time_base_ambiguous(acquisition_datetime: str, administration_datetime: str) -> bool:
    """Return whether two DTs disagree on offset presence (mixed time base).

    Args:
        acquisition_datetime: DICOM DT of the acquisition start instant.
        administration_datetime: DICOM DT of radiopharmaceutical administration.

    Returns:
        ``True`` only when both values parse and exactly one declares an offset.
    """
    acquisition = parse_dicom_datetime_parts(acquisition_datetime)
    administration = parse_dicom_datetime_parts(administration_datetime)
    if acquisition is None or administration is None:
        return False
    return acquisition[1] != administration[1]


def elapsed_seconds(acquisition_datetime: str, administration_datetime: str) -> float | None:
    """Return ``acquisitionStart - administration`` in seconds.

    Args:
        acquisition_datetime: DICOM DT of the acquisition start instant.
        administration_datetime: DICOM DT of radiopharmaceutical administration.

    Returns:
        Elapsed seconds, or ``None`` when either DT is unparseable.
    """
    acquisition = parse_dicom_datetime(acquisition_datetime)
    administration = parse_dicom_datetime(administration_datetime)
    if acquisition is None or administration is None:
        return None
    return acquisition - administration


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
