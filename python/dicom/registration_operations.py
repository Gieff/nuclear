"""Handler for ``nuclear.registration`` (NuClear Phase 2B.1/2B.2/2B.3b).

Slice 2B.1 registered the operation and froze its request/evidence schema. Slice
2B.2 added the **manual-landmark path**. Slice 2B.3b wires the **automatic
Mutual-Information path** (``mode: 'rigid'``) to real decoded volumes: each side
is prepared by the shared hydration service
:func:`dicom.volume_operations.prepare_series` (accepted geometry, declared
format and §6 limits preflighted before pixel allocation), its observed
fingerprint and Frame of Reference are correlated against the caller's
expectations, and only then does :func:`dicom.registration_mi.register_rigid`
run on the accepted geometry. The result is self-checked through
:mod:`dicom.registration_validation`. MI evidence carries **no** ``errorMarginMm``
(R11-B); no mm residual is ever fabricated.

``-32012`` refusals always carry exactly ``{diagnostic, mode, reason}`` and never
a transform. Rigid reasons (owner-ratified): ``same-frame-of-reference``,
``optimisation-failed``, ``invalid-evidence``, ``non-rigid-transform``,
``invalid-metric``; landmarks keep ``same-frame-of-reference``,
``degenerate-landmarks``, ``reflection-required``.

Authority: PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN (2B.1–2B.3b), ADR-013 (Accepted),
ADR-002.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Any, Literal

import numpy as np

from worker.protocol import (
    ERROR_MESSAGES,
    REGISTRATION_INVALID,
    REGISTRATION_METHOD,
    ProtocolError,
    iso8601_utc,
)

from .registration_math import ProcrustesRefusal, estimate_rigid_transform, homogenise
from .registration_mi import MiRefusal, register_rigid
from .registration_schema import RegistrationRequest, parse_registration_request
from .registration_validation import EvidenceRefusal, validate_spatial_transform_evidence
from .source_fingerprint import require_expected_frame_of_reference, require_matching_fingerprint
from .volume_operations import prepare_series
from .volume_payload import DecodedVolume, enforce_registration_working_set

Clock = Callable[[], datetime]
RefusalReason = Literal["same-frame-of-reference", "degenerate-landmarks", "reflection-required"]
RigidRefusalReason = Literal[
    "same-frame-of-reference", "optimisation-failed", "invalid-evidence",
    "non-rigid-transform", "invalid-metric",
]

TRANSFORM_TYPE = "rigid"
TRANSFORM_UNITS = "mm"
PROVENANCE_METHOD = "manual-alignment"
RIGID_PROVENANCE_METHOD = "rigid-coregistration"


def _refusal(reason: RefusalReason, diagnostic: str) -> ProtocolError:
    """Build the typed ``-32012`` landmarks refusal (never carries a transform)."""
    return ProtocolError(
        REGISTRATION_INVALID, ERROR_MESSAGES[REGISTRATION_INVALID],
        {"diagnostic": diagnostic, "mode": "landmarks", "reason": reason})


def _rigid_refusal(reason: RigidRefusalReason, diagnostic: str) -> ProtocolError:
    """Build the typed ``-32012`` rigid refusal (never carries a transform)."""
    return ProtocolError(
        REGISTRATION_INVALID, ERROR_MESSAGES[REGISTRATION_INVALID],
        {"diagnostic": diagnostic, "mode": "rigid", "reason": reason})


def to_sitk_image(volume: DecodedVolume) -> Any:
    """Build a 3-D ``sitk.Image`` from a decoded volume and its worker geometry.

    SimpleITK direction-matrix columns are the DICOM row/column cosines and the
    slice normal, so physical points follow the accepted LPS geometry exactly.
    """
    import SimpleITK as _sitk  # local import keeps the base worker import light

    sitk: Any = _sitk
    image = sitk.GetImageFromArray(np.ascontiguousarray(volume.scalar, dtype=np.float32))
    image.SetSpacing([float(value) for value in volume.geometry["spacing"]])
    image.SetOrigin([float(value) for value in volume.geometry["origin"]])
    direction = [float(value) for value in volume.geometry["direction"]]
    normal = [float(value) for value in volume.geometry["sliceNormal"]]
    image.SetDirection([
        direction[0], direction[3], normal[0],
        direction[1], direction[4], normal[1],
        direction[2], direction[5], normal[2],
    ])
    return image


def _evidence_refusal_reason(refusal: EvidenceRefusal) -> RigidRefusalReason:
    """Map a self-check ``EvidenceRefusal`` to a ratified rigid reason (never -32603)."""
    if refusal.reason == "non-rigid-transform":
        return "non-rigid-transform"
    if refusal.reason == "same-frame-of-reference":
        return "same-frame-of-reference"
    return "invalid-evidence"


def _rigid_evidence(request: RegistrationRequest, *, clock: Clock) -> dict[str, Any]:
    """Prepare, correlate, decode and rigidly register the fixed/moving series."""
    import worker  # local import avoids a package import cycle at module load

    assert request.fixed is not None and request.moving is not None
    fixed_uid = request.fixed_series_instance_uid
    moving_uid = request.moving_series_instance_uid
    assert fixed_uid is not None and moving_uid is not None
    fixed = prepare_series(request.fixed, fixed_uid)
    moving = prepare_series(request.moving, moving_uid)
    enforce_registration_working_set([fixed.voxel_count(), moving.voxel_count()], fixed_uid)
    for uid, expected, expected_for, prepared in (
        (fixed_uid, request.fixed_expected_fingerprint, request.fixed_expected_frame_of_reference_uid, fixed),
        (moving_uid, request.moving_expected_fingerprint, request.moving_expected_frame_of_reference_uid, moving),
    ):
        assert expected is not None and expected_for is not None
        observed = prepared.observed_fingerprint()
        require_matching_fingerprint(observed, expected, series_uid=uid)
        require_expected_frame_of_reference(observed.frame_of_reference_uid, expected_for, series_uid=uid)
    source_for = fixed.observed_fingerprint().frame_of_reference_uid
    target_for = moving.observed_fingerprint().frame_of_reference_uid
    if source_for == target_for:
        raise _rigid_refusal(
            "same-frame-of-reference",
            "fixed and moving series share a Frame of Reference; an inter-study "
            "registration must map distinct frames.")
    try:
        estimate = register_rigid(to_sitk_image(fixed.decode()), to_sitk_image(moving.decode()))
    except MiRefusal as refusal:
        raise _rigid_refusal(refusal.reason, refusal.diagnostic) from refusal

    timestamp = iso8601_utc(clock())
    evidence: dict[str, Any] = {
        "transform": {
            "id": request.transform_id,
            "sourceFrameOfReferenceUID": source_for,
            "targetFrameOfReferenceUID": target_for,
            "transformType": TRANSFORM_TYPE,
            "matrix4x4": [float(value) for value in estimate.matrix.reshape(-1).tolist()],
            "units": TRANSFORM_UNITS,
            "provenance": {
                "method": RIGID_PROVENANCE_METHOD,
                "workerVersion": worker.__version__,
                "timestamp": timestamp,
            },
            # R11-B: MI emits no mm residual; ``errorMarginMm`` must stay absent.
            "validity": {"isValid": True, "outOfDomainBehavior": request.out_of_domain_behavior},
        },
        "workerMetadata": {
            "workerVersion": worker.__version__,
            "operation": REGISTRATION_METHOD,
            "timestamp": timestamp,
            "parameters": {
                **dict(estimate.effective_parameters),
                "mode": "rigid",
                "sourceFrameOfReferenceUID": source_for,
                "targetFrameOfReferenceUID": target_for,
            },
        },
    }
    try:
        validate_spatial_transform_evidence(evidence["transform"])
    except EvidenceRefusal as refusal:
        raise _rigid_refusal(_evidence_refusal_reason(refusal), refusal.diagnostic) from refusal
    return evidence


def _landmark_evidence(request: RegistrationRequest, *, clock: Clock) -> dict[str, Any]:
    """Compute the Procrustes evidence or raise a typed ``-32012`` refusal."""
    import worker  # local import avoids a package import cycle at module load

    source_for = request.source_frame_of_reference_uid
    target_for = request.target_frame_of_reference_uid
    assert source_for is not None and target_for is not None
    if source_for == target_for:
        raise _refusal(
            "same-frame-of-reference",
            "source and target Frame of Reference are identical; an inter-study "
            "registration must map distinct frames.")
    source = tuple(pair.source for pair in request.landmarks)
    target = tuple(pair.target for pair in request.landmarks)
    try:
        estimate = estimate_rigid_transform(source, target)
    except ProcrustesRefusal as refusal:
        raise _refusal(refusal.reason, refusal.diagnostic) from refusal

    timestamp = iso8601_utc(clock())
    matrix = homogenise(estimate.rotation, estimate.translation)
    evidence: dict[str, Any] = {
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
                "mode": "landmarks", "pairCount": len(request.landmarks),
                "rmsPointErrorMm": estimate.rms_point_error_mm,
                "maxPointErrorMm": estimate.max_point_error_mm,
            },
        },
    }
    # 2B.4 self-check: the evidence must satisfy the accepted SpatialTransform contract.
    validate_spatial_transform_evidence(evidence["transform"])
    return evidence


def registration_operation(params: Mapping[str, Any], *, clock: Clock) -> dict[str, Any]:
    """Execute ``nuclear.registration``, dispatching on the validated mode.

    ``rigid`` prepares/correlates both series through the shared hydration service
    and runs the ratified R4 MI core; ``landmarks`` returns the Procrustes
    evidence. A schema violation is ``-32602``; a scientific refusal is the
    reserved ``-32012``; a side with no accepted volume evidence is ``-32013``/
    ``-32015``. A refusal never carries a transform.
    """
    request = parse_registration_request(params)
    if request.mode == "rigid":
        return _rigid_evidence(request, clock=clock)
    return _landmark_evidence(request, clock=clock)
