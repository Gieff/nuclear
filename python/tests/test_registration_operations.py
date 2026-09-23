"""Schema, dispatch and real-worker rigid evidence for ``nuclear.registration``.

Schema violations fail closed with ``INVALID_PARAMS`` (-32602) and a non-empty
``violations`` list. The ``landmarks`` mode returns the 2B.2 Procrustes evidence
(see ``test_registration_procrustes.py``); the ``rigid`` mode decodes real
volumes through the shared hydration service and runs the ratified R4 MI core.
The core-level evidence lives in ``test_registration_mi.py``.
"""

from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

import numpy as np
import pytest
from numpy.typing import NDArray
from synthetic_mi_phantom import ground_truth_matrix, probe_points_mm
from test_registration_mi import mi_rigid_request

from dicom.registration_operations import registration_operation
from dicom.registration_schema import parse_registration_request
from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import (
    INVALID_PARAMS,
    PROTOCOL_VERSION,
    REGISTRATION_INVALID,
    REGISTRATION_METHOD,
    SOURCE_UNAVAILABLE,
    VOLUME_FINGERPRINT_MISMATCH,
    ProtocolError,
)

FROZEN_NOW = datetime(2026, 9, 20, 0, 0, 0, tzinfo=timezone.utc)
FIXTURES_ROOT = (
    Path(__file__).resolve().parents[2] / "tests" / "rendering" / "fixtures" / "volumes"
)
MI_RMS_TOLERANCE_MM = 0.5
MI_MAX_TOLERANCE_MM = 0.5
MI_ROTATION_TOLERANCE_DEG = 0.5
FloatArray = NDArray[np.float64]

RIGID_REQUEST: dict[str, Any] = {
    "mode": "rigid",
    "transformId": "xform-rigid-1",
    "outOfDomainBehavior": "clamp",
    "fixed": {
        "locator": {"kind": "local-folder", "path": "/data/fixed"},
        "seriesInstanceUID": "1.2.3.4.5",
        "expectedFingerprint": {
            "studyInstanceUID": "1.2.3.4", "seriesInstanceUID": "1.2.3.4.5",
            "instanceCount": 3, "contentDigest": "sha256:" + "0" * 64,
            "geometricDigest": "sha256:" + "1" * 64},
        "expectedFrameOfReferenceUID": "1.2.3.4.for",
    },
    "moving": {
        "locator": {"kind": "local-folder", "path": "/data/moving"},
        "seriesInstanceUID": "1.2.3.4.6",
        "expectedFingerprint": {
            "studyInstanceUID": "1.2.3.4", "seriesInstanceUID": "1.2.3.4.6",
            "instanceCount": 3, "contentDigest": "sha256:" + "0" * 64,
            "geometricDigest": "sha256:" + "2" * 64},
        "expectedFrameOfReferenceUID": "1.2.3.4.for.2",
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


def _envelope(params: dict[str, Any], request_id: str = "req-reg") -> dict[str, Any]:
    return process_record(
        json.dumps(
            {"jsonrpc": "2.0", "id": request_id, "protocolVersion": PROTOCOL_VERSION,
             "method": REGISTRATION_METHOD, "params": params}
        ),
        0,
        build_dispatcher(now=lambda: FROZEN_NOW),
    )


def _expect_invalid(params: dict[str, Any]) -> ProtocolError:
    with pytest.raises(ProtocolError) as excinfo:
        registration_operation(params, clock=lambda: FROZEN_NOW)
    error = excinfo.value
    assert error.code == INVALID_PARAMS
    violations = error.data["violations"]
    assert isinstance(violations, list) and violations
    assert all(isinstance(item, str) and item for item in violations)
    return error


def test_rigid_request_with_missing_source_fails_closed() -> None:
    with pytest.raises(ProtocolError) as excinfo:
        registration_operation(RIGID_REQUEST, clock=lambda: FROZEN_NOW)
    error = excinfo.value
    assert error.code == SOURCE_UNAVAILABLE == -32010
    assert "transform" not in error.data and "matrix4x4" not in error.data


def test_valid_landmark_request_returns_rigid_evidence() -> None:
    result = registration_operation(LANDMARK_REQUEST, clock=lambda: FROZEN_NOW)
    transform = result["transform"]
    assert transform["transformType"] == "rigid" and transform["units"] == "mm"
    assert transform["id"] == "xform-landmark-1"
    assert transform["sourceFrameOfReferenceUID"] == "1.2.3.4.5"
    assert transform["targetFrameOfReferenceUID"] == "1.2.3.4.6"
    assert len(transform["matrix4x4"]) == 16
    assert transform["validity"]["isValid"] is True
    assert result["workerMetadata"]["operation"] == REGISTRATION_METHOD


def test_parser_returns_the_validated_caller_declared_fields_verbatim() -> None:
    request = parse_registration_request(RIGID_REQUEST)
    assert request.mode == "rigid" and request.transform_id == "xform-rigid-1"
    assert request.out_of_domain_behavior == "clamp" and request.landmarks == ()
    assert request.fixed is not None and request.fixed.kind == "local-folder"
    assert request.fixed_series_instance_uid == "1.2.3.4.5"
    assert request.moving_series_instance_uid == "1.2.3.4.6"

    landmarks = parse_registration_request(LANDMARK_REQUEST)
    assert landmarks.source_frame_of_reference_uid == "1.2.3.4.5"
    assert landmarks.target_frame_of_reference_uid == "1.2.3.4.6"
    assert len(landmarks.landmarks) == 3 and landmarks.fixed is None


@pytest.mark.parametrize(
    ("label", "mutate"),
    [
        ("missing-mode", lambda request: request.pop("mode")),
        ("unknown-mode", lambda request: request.__setitem__("mode", "elastic")),
        ("missing-transform-id", lambda request: request.pop("transformId")),
        ("empty-transform-id", lambda request: request.__setitem__("transformId", "")),
        ("invalid-out-of-domain-behavior", lambda request: request.__setitem__("outOfDomainBehavior", "reflect")),
        ("rigid-missing-moving", lambda request: request.pop("moving")),
        ("rigid-malformed-moving-locator", lambda request: request["moving"].__setitem__("locator", {"kind": "local-folder"})),
        ("rigid-missing-expected-fingerprint", lambda request: request["fixed"].pop("expectedFingerprint")),
        ("rigid-missing-expected-for", lambda request: request["fixed"].pop("expectedFrameOfReferenceUID")),
        ("rigid-malformed-expected-fingerprint", lambda request: request["fixed"]["expectedFingerprint"].pop("contentDigest")),
        ("landmarks-two-pairs", lambda request: request.__setitem__("landmarks", request["landmarks"][:2])),
        ("landmarks-wrong-triple-length", lambda request: request["landmarks"][0].__setitem__("source", [0.0, 0.0])),
        ("landmarks-non-finite-coordinate", lambda request: request["landmarks"][0].__setitem__("target", [0.0, 0.0, float("nan")])),
        ("landmarks-empty-source-for", lambda request: request.__setitem__("sourceFrameOfReferenceUID", "")),
    ],
)
def test_schema_violations_fail_closed_with_violations(label: str, mutate: Any) -> None:
    base = copy.deepcopy(LANDMARK_REQUEST if "landmarks" in label else RIGID_REQUEST)
    mutate(base)
    _expect_invalid(base)


def test_landmark_boolean_coordinate_is_rejected() -> None:
    base = copy.deepcopy(LANDMARK_REQUEST)
    base["landmarks"][0]["source"][0] = True
    _expect_invalid(base)


def test_envelope_returns_reserved_error_without_result() -> None:
    response = _envelope(RIGID_REQUEST, "req-reg-0001")
    assert response["id"] == "req-reg-0001" and "result" not in response
    assert response["error"]["code"] == SOURCE_UNAVAILABLE
    assert response["error"]["data"]["diagnostic"]


def test_envelope_maps_schema_violation_to_invalid_params() -> None:
    response = _envelope({**copy.deepcopy(RIGID_REQUEST), "mode": "elastic"}, "req-reg-0002")
    assert "result" not in response
    assert response["error"]["code"] == INVALID_PARAMS
    assert response["error"]["data"]["violations"]


def test_registration_method_is_registered_in_the_handshake() -> None:
    assert REGISTRATION_METHOD in build_dispatcher(now=lambda: FROZEN_NOW).supported_methods


def _committed_side(name: str, series_uid: str) -> dict[str, Any]:
    fingerprint = json.loads((FIXTURES_ROOT / name / "expected-fingerprint.json").read_text())
    return {
        "locator": {"kind": "local-folder", "path": str(FIXTURES_ROOT / name / "instances")},
        "seriesInstanceUID": series_uid,
        "expectedFingerprint": fingerprint,
        "expectedFrameOfReferenceUID": fingerprint["frameOfReferenceUID"],
    }


def test_rigid_same_frame_of_reference_is_refused_through_the_worker() -> None:
    """R7/R8: the co-referenced fixtures share a FoR, so the rigid path refuses."""
    params = {
        "mode": "rigid",
        "transformId": "xform-same-for",
        "outOfDomainBehavior": "clamp",
        "fixed": _committed_side("ct-axial", "1.2.826.0.1.3680043.10.5001.2"),
        "moving": _committed_side("pt-axial-coreg", "1.2.826.0.1.3680043.10.5001.5"),
    }
    response = _envelope(params, "req-same-for")
    assert "result" not in response
    error = response["error"]
    assert error["code"] == REGISTRATION_INVALID == -32012
    assert error["data"]["mode"] == "rigid"
    assert error["data"]["reason"] == "same-frame-of-reference"
    assert "matrix4x4" not in error["data"] and "transform" not in error["data"]


def _apply(matrix: FloatArray, point: tuple[float, float, float]) -> FloatArray:
    """Apply a row-major homogeneous 4x4 to one column-vector point."""
    homogeneous = np.array([point[0], point[1], point[2], 1.0], dtype=np.float64)
    return np.asarray(matrix @ homogeneous, dtype=np.float64)[:3]


def _geodesic_deg(recovered: FloatArray, truth: FloatArray) -> float:
    """Geodesic angle of ``R_recovered . R_truth^T`` in degrees."""
    cosine = (float(np.trace(recovered @ truth.T)) - 1.0) / 2.0
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))


def _run_rigid(params: dict[str, Any]) -> dict[str, Any]:
    response = _envelope(params, "req-mi-ipc")
    assert "result" in response, response
    return cast(dict[str, Any], response["result"])


def test_rigid_registration_recovers_the_curated_phantom_through_the_worker() -> None:
    """2B.3b: real-worker rigid MI hits the ratified R3 fixture criterion."""
    result = _run_rigid(mi_rigid_request())
    transform = result["transform"]
    assert transform["transformType"] == "rigid" and transform["units"] == "mm"
    assert transform["provenance"]["method"] == "rigid-coregistration"
    assert "errorMarginMm" not in transform["validity"]  # R11-B: MI has no mm residual
    matrix = np.asarray(transform["matrix4x4"], dtype=np.float64).reshape(4, 4)
    truth = ground_truth_matrix()
    residuals = [
        float(np.linalg.norm(_apply(matrix, point) - _apply(truth, point)))
        for point in probe_points_mm()
    ]
    rms = float(np.sqrt(np.mean(np.square(residuals))))
    maximum = float(np.max(residuals))
    rotation = _geodesic_deg(matrix[:3, :3], truth[:3, :3])
    print(f"[2B.3b IPC MI] rms={rms:.6f} mm max={maximum:.6f} mm rotation={rotation:.6f} deg")
    assert rms <= MI_RMS_TOLERANCE_MM
    assert maximum <= MI_MAX_TOLERANCE_MM
    assert rotation <= MI_ROTATION_TOLERANCE_DEG
    assert result["workerMetadata"]["parameters"]["mode"] == "rigid"
    assert result["workerMetadata"]["parameters"]["metric"] == "MattesMutualInformation"


def test_rigid_registration_is_bitwise_deterministic_through_the_worker() -> None:
    """R4: same locked environment => bitwise-identical transform and parameters."""
    params = mi_rigid_request()
    first = _run_rigid(params)
    second = _run_rigid(params)
    assert first["transform"]["matrix4x4"] == second["transform"]["matrix4x4"]
    assert first["workerMetadata"]["parameters"] == second["workerMetadata"]["parameters"]


@pytest.mark.parametrize(
    ("field", "value", "reason"),
    [
        ("contentDigest", "sha256:" + "0" * 64, "content-digest"),
        ("instanceCount", 99, "instance-count"),
    ],
)
def test_rigid_expected_fingerprint_mismatch_is_refused(field: str, value: Any, reason: str) -> None:
    params = mi_rigid_request()
    params["fixed"]["expectedFingerprint"][field] = value
    error = _envelope(params, "req-fp")["error"]
    assert error["code"] == VOLUME_FINGERPRINT_MISMATCH == -32015
    assert error["data"]["reason"] == reason
    assert "matrix4x4" not in error["data"] and "transform" not in error["data"]


def test_rigid_expected_frame_of_reference_mismatch_is_refused() -> None:
    params = mi_rigid_request()
    params["fixed"]["expectedFrameOfReferenceUID"] = "9.9.9"
    error = _envelope(params, "req-for")["error"]
    assert error["code"] == VOLUME_FINGERPRINT_MISMATCH
    assert error["data"]["reason"] == "frame-of-reference"
