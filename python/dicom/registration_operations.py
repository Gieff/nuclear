"""Handler for ``nuclear.registration`` (NuClear Phase 2B.1).

This slice registers the inter-study registration operation and freezes its
request/evidence schema only. **No registration algorithm is implemented and no
transform, matrix or provenance is fabricated.** A schema-valid request raises
the reserved ``OPERATION_NOT_IMPLEMENTED`` (-32011) error; the Procrustes
(2B.2) and Mutual-Information (2B.3) handlers land in later slices.

The request schema itself lives in :mod:`dicom.registration_schema`. This module
is deliberately thin: it validates, then refuses to fabricate evidence.

Scope and evidence authority:

    - ``docs/plans/PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md`` (slice 2B.1)
    - ``docs/decisions/ADR-002-scientific-worker-stdio-json-rpc.md``
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from worker.protocol import (
    ERROR_MESSAGES,
    OPERATION_NOT_IMPLEMENTED,
    REGISTRATION_METHOD,
    ProtocolError,
)

from .registration_schema import parse_registration_request


def registration_operation(params: Mapping[str, Any]) -> dict[str, Any]:
    """Validate a registration request, then refuse to fabricate a transform.

    The schema is accepted or rejected fail-closed. A schema-valid request
    raises the reserved ``OPERATION_NOT_IMPLEMENTED`` (-32011) error: the
    Procrustes and Mutual-Information algorithms are not part of slice 2B.1. This
    function imports no numpy/SimpleITK and is deterministic (no clock).

    Args:
        params: Request parameters mapping.

    Returns:
        Never returns in slice 2B.1; the declared return type keeps the handler
        signature uniform with the other operations.

    Raises:
        ProtocolError: ``INVALID_PARAMS`` (-32602) for a schema violation, or
            ``OPERATION_NOT_IMPLEMENTED`` (-32011) for a valid but unbuilt
            algorithm. The error data carries only ``diagnostic``, ``mode`` and
            ``phaseSlice``; it never carries a transform, matrix or any
            fabricated evidence key.
    """
    request = parse_registration_request(params)
    raise ProtocolError(
        OPERATION_NOT_IMPLEMENTED,
        ERROR_MESSAGES[OPERATION_NOT_IMPLEMENTED],
        {
            "diagnostic": (
                f"{REGISTRATION_METHOD} ({request.mode}) schema accepted; the "
                "registration algorithm is scheduled for Phase 2B.2/2B.3 and is "
                "not implemented in slice 2B.1."
            ),
            "mode": request.mode,
            "phaseSlice": "2B.1",
        },
    )
