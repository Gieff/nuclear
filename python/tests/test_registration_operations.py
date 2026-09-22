"""Phase 2B.1 evidence for the schema-only ``nuclear.registration`` operation.

2B.1 registers the operation and freezes the request/evidence schema; it does
not implement any registration algorithm. A schema-valid request must fail
closed with the reserved ``OPERATION_NOT_IMPLEMENTED`` (-32011) error and must
never fabricate a ``transform``/``matrix4x4``. Schema violations must fail
closed with ``INVALID_PARAMS`` (-32602) and a non-empty ``violations`` list.
"""

from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from typing import Any

import pytest

from dicom.registration_operations import registration_operation
from dicom.registration_schema import parse_registration_request
from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import (
    INVALID_PARAMS,
    OPERATION_NOT_IMPLEMENTED,
    PROTOCOL_VERSION,
    REGISTRATION_METHOD,
    ProtocolError,
)

FROZEN_NOW = datetime(2026, 9, 20, 0, 0, 0, tzinfo=timezone.utc)

RIGID_REQUEST: dict[str, Any] = {
    "mode": "rigid",
    "transformId": "xform-rigid-1",
    "outOfDomainBehavior": "clamp",
    "fixed": {
        "locator": {"kind": "local-folder", "path": "/data/fixed"},
        "seriesInstanceUID": "1.2.3.4.5",
    },
    "moving": {
        "locator": {"kind": "local-folder", "path": "/data/moving"},
        "seriesInstanceUID": "1.2.3.4.6",
    },
}

LANDMARK_REQUEST: dict[str, Any] = {
    "mode": "landmarks",
    "transformId": "xform-landmark-1",
    "outOfDomainBehavior": "warn",
    "sourceFrameOfReferenceUID": "1.2.3.4.5",
    "targetFrameOfReferenceUID": "1.2.3.4.6",
    "landmarks": [
        {"source": [0.0, 0.0, 0.0], "target": [1.0, 1.0, 1.0]},
        {"source": [1.0, 0.0, 0.0], "target": [2.0, 1.0, 1.0]},
        {"source": [0.0, 1.0, 0.0], "target": [1.0, 2.0, 1.0]},
    ],
}


def _expect_not_implemented(params: dict[str, Any]) -> ProtocolError:
    with pytest.raises(ProtocolError) as excinfo:
        registration_operation(params)
    error = excinfo.value
    assert error.code == OPERATION_NOT_IMPLEMENTED
    assert error.message == "Operation not implemented"
    assert set(error.data) == {"diagnostic", "mode", "phaseSlice"}
    assert error.data["phaseSlice"] == "2B.1"
    assert isinstance(error.data["diagnostic"], str) and error.data["diagnostic"]
    assert "transform" not in error.data
    assert "matrix4x4" not in error.data
    return error


def _expect_invalid(params: dict[str, Any]) -> ProtocolError:
    with pytest.raises(ProtocolError) as excinfo:
        registration_operation(params)
    error = excinfo.value
    assert error.code == INVALID_PARAMS
    violations = error.data["violations"]
    assert isinstance(violations, list) and violations
    assert all(isinstance(item, str) and item for item in violations)
    return error


def test_valid_rigid_request_fails_closed_as_not_implemented() -> None:
    error = _expect_not_implemented(RIGID_REQUEST)
    assert error.data["mode"] == "rigid"


def test_valid_landmark_request_fails_closed_without_fabricated_evidence() -> None:
    error = _expect_not_implemented(LANDMARK_REQUEST)
    assert error.data["mode"] == "landmarks"


def test_parser_returns_the_validated_caller_declared_fields_verbatim() -> None:
    request = parse_registration_request(RIGID_REQUEST)
    assert request.mode == "rigid"
    assert request.transform_id == "xform-rigid-1"
    assert request.out_of_domain_behavior == "clamp"
    assert request.fixed is not None and request.fixed.kind == "local-folder"
    assert request.fixed_series_instance_uid == "1.2.3.4.5"
    assert request.moving_series_instance_uid == "1.2.3.4.6"
    assert request.landmarks == ()

    landmarks = parse_registration_request(LANDMARK_REQUEST)
    assert landmarks.source_frame_of_reference_uid == "1.2.3.4.5"
    assert landmarks.target_frame_of_reference_uid == "1.2.3.4.6"
    assert len(landmarks.landmarks) == 3
    assert landmarks.fixed is None


@pytest.mark.parametrize(
    ("label", "mutate"),
    [
        ("missing-mode", lambda request: request.pop("mode")),
        ("unknown-mode", lambda request: request.__setitem__("mode", "elastic")),
        ("missing-transform-id", lambda request: request.pop("transformId")),
        ("empty-transform-id", lambda request: request.__setitem__("transformId", "")),
        (
            "invalid-out-of-domain-behavior",
            lambda request: request.__setitem__("outOfDomainBehavior", "reflect"),
        ),
        ("rigid-missing-moving", lambda request: request.pop("moving")),
        (
            "rigid-malformed-moving-locator",
            lambda request: request["moving"].__setitem__("locator", {"kind": "local-folder"}),
        ),
        (
            "landmarks-two-pairs",
            lambda request: request.__setitem__("landmarks", request["landmarks"][:2]),
        ),
        (
            "landmarks-wrong-triple-length",
            lambda request: request["landmarks"][0].__setitem__("source", [0.0, 0.0]),
        ),
        (
            "landmarks-non-finite-coordinate",
            lambda request: request["landmarks"][0].__setitem__(
                "target", [0.0, 0.0, float("nan")]
            ),
        ),
        (
            "landmarks-empty-source-for",
            lambda request: request.__setitem__("sourceFrameOfReferenceUID", ""),
        ),
    ],
)
def test_schema_violations_fail_closed_with_violations(
    label: str, mutate: Any
) -> None:
    base = copy.deepcopy(LANDMARK_REQUEST if "landmarks" in label else RIGID_REQUEST)
    mutate(base)
    _expect_invalid(base)


def test_landmark_boolean_coordinate_is_rejected() -> None:
    base = copy.deepcopy(LANDMARK_REQUEST)
    base["landmarks"][0]["source"][0] = True
    _expect_invalid(base)


def test_envelope_returns_reserved_error_without_result() -> None:
    dispatcher = build_dispatcher(now=lambda: FROZEN_NOW)
    request = {
        "jsonrpc": "2.0",
        "id": "req-reg-0001",
        "protocolVersion": PROTOCOL_VERSION,
        "method": REGISTRATION_METHOD,
        "params": RIGID_REQUEST,
    }
    response = process_record(json.dumps(request), 0, dispatcher)

    assert response["id"] == "req-reg-0001"
    assert "result" not in response
    error = response["error"]
    assert error["code"] == OPERATION_NOT_IMPLEMENTED
    assert error["data"]["phaseSlice"] == "2B.1"
    assert error["data"]["mode"] == "rigid"


def test_envelope_maps_schema_violation_to_invalid_params() -> None:
    dispatcher = build_dispatcher(now=lambda: FROZEN_NOW)
    request = {
        "jsonrpc": "2.0",
        "id": "req-reg-0002",
        "protocolVersion": PROTOCOL_VERSION,
        "method": REGISTRATION_METHOD,
        "params": {**copy.deepcopy(RIGID_REQUEST), "mode": "elastic"},
    }
    response = process_record(json.dumps(request), 0, dispatcher)

    assert "result" not in response
    assert response["error"]["code"] == INVALID_PARAMS
    assert response["error"]["data"]["violations"]


def test_registration_method_is_registered_in_the_handshake() -> None:
    dispatcher = build_dispatcher(now=lambda: FROZEN_NOW)
    assert REGISTRATION_METHOD in dispatcher.supported_methods
