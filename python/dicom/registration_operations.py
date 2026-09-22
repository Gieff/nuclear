"""Handler for ``nuclear.registration`` (NuClear Phase 2B.1/2B.2).

Slice 2B.1 registered the operation and froze its request/evidence schema. Slice
2B.2 adds the **manual-landmark path**: ``mode: 'landmarks'`` performs scientific
validation (R7 same-Frame-of-Reference refusal, structural degeneracy and
reflection fail-closed) and returns a complete, versioned ``SpatialTransform``
with advisory residual evidence. ``mode: 'rigid'`` remains a reserved stub that
raises ``OPERATION_NOT_IMPLEMENTED`` (-32011): automatic Mutual-Information
registration is slice 2B.3 and is not implemented here (no SimpleITK).

The request schema itself lives in :mod:`dicom.registration_schema`; the pure
Procrustes mathematics lives in :mod:`dicom.registration_math`. No scientific
formula is duplicated in TypeScript.

Scope and evidence authority:

    - ``docs/plans/PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md`` (slices 2B.1/2B.2)
    - ``docs/decisions/ADR-002-scientific-worker-stdio-json-rpc.md``
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Any, Literal

from worker.protocol import (
    ERROR_MESSAGES,
    OPERATION_NOT_IMPLEMENTED,
    REGISTRATION_INVALID,
    REGISTRATION_METHOD,
    ProtocolError,
    iso8601_utc,
)

from .registration_math import ProcrustesRefusal, estimate_rigid_transform, homogenise
from .registration_schema import RegistrationRequest, parse_registration_request

Clock = Callable[[], datetime]
RefusalReason = Literal[
    "same-frame-of-reference", "degenerate-landmarks", "reflection-required"
]

TRANSFORM_TYPE = "rigid"
TRANSFORM_UNITS = "mm"
PROVENANCE_METHOD = "manual-alignment"
RIGID_STUB_PHASE_SLICE = "2B.1"


def _refusal(reason: RefusalReason, diagnostic: str) -> ProtocolError:
    """Build the typed ``-32012`` refusal (never carries a transform/matrix)."""
    return ProtocolError(
        REGISTRATION_INVALID,
        ERROR_MESSAGES[REGISTRATION_INVALID],
        {"diagnostic": diagnostic, "mode": "landmarks", "reason": reason},
    )


def _rigid_not_implemented(request: RegistrationRequest) -> ProtocolError:
    """Build the reserved ``-32011`` stub error for the unimplemented rigid path."""
    return ProtocolError(
        OPERATION_NOT_IMPLEMENTED,
        ERROR_MESSAGES[OPERATION_NOT_IMPLEMENTED],
        {
            "diagnostic": (
                f"{REGISTRATION_METHOD} (rigid) schema accepted; automatic "
                "(Mutual Information) registration is scheduled for Phase 2B.3 and "
                "is not implemented. The stub was registered in slice 2B.1."
            ),
            "mode": request.mode,
            "phaseSlice": RIGID_STUB_PHASE_SLICE,
        },
    )


def _landmark_evidence(
    request: RegistrationRequest, *, clock: Clock
) -> dict[str, Any]:
    """Compute the Procrustes evidence or raise a typed ``-32012`` refusal."""
    import worker  # local import avoids a package import cycle at module load

    source_for = request.source_frame_of_reference_uid
    target_for = request.target_frame_of_reference_uid
    assert source_for is not None and target_for is not None
    if source_for == target_for:
        raise _refusal(
            "same-frame-of-reference",
            "source and target Frame of Reference are identical; an inter-study "
            "registration must map distinct frames.",
        )

    source = tuple(pair.source for pair in request.landmarks)
    target = tuple(pair.target for pair in request.landmarks)
    try:
        estimate = estimate_rigid_transform(source, target)
    except ProcrustesRefusal as refusal:
        raise _refusal(refusal.reason, refusal.diagnostic) from refusal

    timestamp = iso8601_utc(clock())
    matrix = homogenise(estimate.rotation, estimate.translation)
    return {
        "transform": {
            "id": request.transform_id,
            "sourceFrameOfReferenceUID": source_for,
            "targetFrameOfReferenceUID": target_for,
            "transformType": TRANSFORM_TYPE,
            "matrix4x4": [float(value) for value in matrix.reshape(-1).tolist()],
            "units": TRANSFORM_UNITS,
            "provenance": {
                "method": PROVENANCE_METHOD,
                "workerVersion": worker.__version__,
                "timestamp": timestamp,
            },
            "validity": {
                "isValid": True,
                "errorMarginMm": estimate.rms_point_error_mm,
                "outOfDomainBehavior": request.out_of_domain_behavior,
            },
        },
        "workerMetadata": {
            "workerVersion": worker.__version__,
            "operation": REGISTRATION_METHOD,
            "timestamp": timestamp,
            "parameters": {
                "mode": "landmarks",
                "pairCount": len(request.landmarks),
                "rmsPointErrorMm": estimate.rms_point_error_mm,
                "maxPointErrorMm": estimate.max_point_error_mm,
            },
        },
    }


def registration_operation(
    params: Mapping[str, Any], *, clock: Clock
) -> dict[str, Any]:
    """Execute ``nuclear.registration``, dispatching on the validated mode.

    ``landmarks`` returns the rigid ``SpatialTransform`` evidence; ``rigid``
    remains the reserved ``-32011`` stub. A schema violation is ``-32602``; a
    scientific refusal is the reserved ``-32012``.

    Args:
        params: Request parameters mapping.
        clock: Injected clock used for the provenance timestamp.

    Returns:
        The ``transform`` + ``workerMetadata`` evidence for the landmarks mode.

    Raises:
        ProtocolError: ``-32602`` (schema), ``-32011`` (rigid stub) or ``-32012``
            (scientific refusal). A ``-32012`` error never carries a transform.
    """
    request = parse_registration_request(params)
    if request.mode == "rigid":
        raise _rigid_not_implemented(request)
    return _landmark_evidence(request, clock=clock)
