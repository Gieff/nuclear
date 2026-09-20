"""Handler for ``nuclear.quantitation.suvbw`` (NuClear P2.4).

Reuses :func:`dicom.sources.load_source` with the PET metadata reader. Malformed
params raise ``INVALID_PARAMS`` (-32602); unreadable sources propagate the
shared ``SOURCE_UNAVAILABLE`` (-32010).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Any

from worker.protocol import (
    ERROR_MESSAGES,
    INVALID_PARAMS,
    QUANTITATION_SUVBW_METHOD,
    ProtocolError,
    iso8601_utc,
)

from .locators import parse_locator
from .pet_metadata import pet_instance_from_dataset
from .quantitation import build_quantitation_result
from .sources import load_source

Clock = Callable[[], datetime]


def _metadata(clock: Clock, parameters: dict[str, Any]) -> dict[str, Any]:
    import worker  # local import avoids a package import cycle at module load

    return {
        "workerVersion": worker.__version__,
        "operation": QUANTITATION_SUVBW_METHOD,
        "timestamp": iso8601_utc(clock()),
        "parameters": parameters,
    }


def _series_uid(params: Mapping[str, Any]) -> str:
    value = params.get("seriesInstanceUID")
    if not isinstance(value, str) or not value:
        raise ProtocolError(
            INVALID_PARAMS,
            ERROR_MESSAGES[INVALID_PARAMS],
            {
                "diagnostic": f"Invalid params for {QUANTITATION_SUVBW_METHOD}.",
                "violations": ["params.seriesInstanceUID must be a non-empty string."],
            },
        )
    return value


def suvbw_operation(params: Mapping[str, Any], *, clock: Clock) -> dict[str, Any]:
    """Execute ``nuclear.quantitation.suvbw`` for one series UID."""
    locator = parse_locator(params, method=QUANTITATION_SUVBW_METHOD)
    series_uid = _series_uid(params)
    loaded = load_source(locator, pet_instance_from_dataset)
    result = build_quantitation_result(loaded.instances, series_uid, loaded.diagnostics)
    result["workerMetadata"] = _metadata(
        clock,
        {
            "locatorKind": locator.kind,
            "seriesInstanceUID": series_uid,
            "instanceCount": len(loaded.instances),
            "status": result["status"],
        },
    )
    return result
