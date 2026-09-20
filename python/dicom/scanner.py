"""``nuclear.dicom.inspect`` handler and provenance for the NuClear worker.

Thin orchestration over :mod:`dicom.sources` (locator resolution and
metadata-only reads) and :mod:`dicom.aggregation` (study/series assembly). It
only adds the standard ``workerMetadata`` provenance; the wire result shape is
owned by the aggregation and source modules.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Any

from worker.protocol import DICOM_INSPECT_METHOD, iso8601_utc

from .aggregation import build_inspection_result
from .sources import load_source, parse_locator

Clock = Callable[[], datetime]


def inspect_source(params: Mapping[str, Any], *, clock: Clock) -> dict[str, Any]:
    """Execute the ``nuclear.dicom.inspect`` operation.

    Args:
        params: Request parameters containing the ``locator``.
        clock: Injectable clock for deterministic ``workerMetadata`` timestamps.

    Returns:
        The inspection payload including standard ``workerMetadata`` provenance.

    Raises:
        ProtocolError: ``INVALID_PARAMS`` (-32602) for a malformed locator or
            ``SOURCE_UNAVAILABLE`` (-32010) for an unreadable source.
    """
    import worker  # local import avoids a package import cycle at module load

    locator = parse_locator(params)
    loaded = load_source(locator)
    payload = build_inspection_result(loaded.instances, loaded.skipped, loaded.diagnostics)
    payload["workerMetadata"] = {
        "workerVersion": worker.__version__,
        "operation": DICOM_INSPECT_METHOD,
        "timestamp": iso8601_utc(clock()),
        "parameters": {
            "locatorKind": locator.kind,
            "scannedFileCount": loaded.scanned,
            "skippedFileCount": loaded.skipped,
            "instanceCount": len(loaded.instances),
            "seriesCount": sum(len(study["series"]) for study in payload["studies"]),
            "studyCount": len(payload["studies"]),
        },
    }
    return payload
