"""Handlers for ``nuclear.dicom.geometry`` and ``nuclear.dicom.compatibility``.

Both operations reuse :func:`dicom.sources.load_source` with the geometry
reader, so folder/file-list/archive resolution is shared with P2.2. Malformed
params raise ``INVALID_PARAMS`` (-32602); unreadable sources propagate the
shared ``SOURCE_UNAVAILABLE`` (-32010).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Any

from worker.protocol import (
    DICOM_COMPATIBILITY_METHOD,
    DICOM_GEOMETRY_METHOD,
    ERROR_MESSAGES,
    INVALID_PARAMS,
    ProtocolError,
    iso8601_utc,
)

from .compatibility import build_compatibility
from .geometry import extract_series_geometry
from .geometry_metadata import geometry_instance_from_dataset
from .locators import SourceLocator, parse_locator
from .sources import load_source

Clock = Callable[[], datetime]


def _metadata(operation: str, clock: Clock, parameters: dict[str, Any]) -> dict[str, Any]:
    import worker  # local import avoids a package import cycle at module load

    return {
        "workerVersion": worker.__version__,
        "operation": operation,
        "timestamp": iso8601_utc(clock()),
        "parameters": parameters,
    }


def _invalid_params(method: str, violations: list[str]) -> ProtocolError:
    return ProtocolError(
        INVALID_PARAMS,
        ERROR_MESSAGES[INVALID_PARAMS],
        {"diagnostic": f"Invalid params for {method}.", "violations": violations},
    )


def _series_uid(mapping: Mapping[str, Any], method: str) -> str:
    value = mapping.get("seriesInstanceUID")
    if not isinstance(value, str) or not value:
        raise _invalid_params(method, ["params.seriesInstanceUID must be a non-empty string."])
    return value


def _side(params: Mapping[str, Any], key: str) -> tuple[SourceLocator, str]:
    side = params.get(key)
    if not isinstance(side, Mapping):
        raise _invalid_params(
            DICOM_COMPATIBILITY_METHOD, [f"params.{key} must be an object."]
        )
    locator = parse_locator(side, method=DICOM_COMPATIBILITY_METHOD)
    return locator, _series_uid(side, DICOM_COMPATIBILITY_METHOD)


def _load_geometry(locator: SourceLocator, series_uid: str) -> dict[str, Any]:
    loaded = load_source(locator, geometry_instance_from_dataset)
    return extract_series_geometry(loaded.instances, series_uid, loaded.diagnostics)


def geometry_operation(params: Mapping[str, Any], *, clock: Clock) -> dict[str, Any]:
    """Execute ``nuclear.dicom.geometry`` for one series UID."""
    locator = parse_locator(params, method=DICOM_GEOMETRY_METHOD)
    series_uid = _series_uid(params, DICOM_GEOMETRY_METHOD)
    loaded = load_source(locator, geometry_instance_from_dataset)
    result = extract_series_geometry(loaded.instances, series_uid, loaded.diagnostics)
    result["workerMetadata"] = _metadata(
        DICOM_GEOMETRY_METHOD,
        clock,
        {
            "locatorKind": locator.kind,
            "seriesInstanceUID": series_uid,
            "instanceCount": len(loaded.instances),
            "status": result["status"],
        },
    )
    return result


def _rejected_side(side: str, result: dict[str, Any], clock: Clock) -> dict[str, Any]:
    return {
        "status": result["status"],
        "side": side,
        "reason": result["reason"],
        "diagnostics": result["diagnostics"],
        "workerMetadata": _metadata(
            DICOM_COMPATIBILITY_METHOD, clock, {"side": side, "reason": result["reason"]}
        ),
    }


def compatibility_operation(params: Mapping[str, Any], *, clock: Clock) -> dict[str, Any]:
    """Execute ``nuclear.dicom.compatibility`` for a left/right series pair."""
    left_locator, left_uid = _side(params, "left")
    right_locator, right_uid = _side(params, "right")
    left = _load_geometry(left_locator, left_uid)
    if left["status"] != "computed":
        return _rejected_side("left", left, clock)
    right = _load_geometry(right_locator, right_uid)
    if right["status"] != "computed":
        return _rejected_side("right", right, clock)
    payload = build_compatibility(left, right)
    payload["workerMetadata"] = _metadata(
        DICOM_COMPATIBILITY_METHOD,
        clock,
        {
            "left": {"locatorKind": left_locator.kind, "seriesInstanceUID": left_uid},
            "right": {"locatorKind": right_locator.kind, "seriesInstanceUID": right_uid},
            "compatible": payload["compatible"],
        },
    )
    return payload
