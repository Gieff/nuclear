"""Focused fail-closed tests for the rigid-side expected-fingerprint geometry.

ADR-013 §5 requires the worker to fail closed on a geometric-digest mismatch.
The shared ``SourceFingerprint.geometricDigest`` is optional, so a caller that
omits it would let ``require_matching_fingerprint`` skip the geometry
comparison entirely. The ``nuclear.registration`` **rigid** schema therefore
makes ``geometricDigest`` mandatory on each ``fixed``/``moving`` expected
fingerprint. The generic ``nuclear.dicom.volume`` expectation keeps the
optional shape; these tests pin both contracts so they cannot be conflated.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import pytest
from test_registration_mi import mi_rigid_request

from dicom.registration_schema import parse_registration_request
from dicom.volume_payload import parse_expected_fingerprint
from worker.protocol import INVALID_PARAMS, ProtocolError

MI_ROOT = Path(__file__).resolve().parents[2] / "tests" / "rendering" / "fixtures" / "volumes"
GEOMETRIC_FIXED = "sha256:" + "a" * 64
GEOMETRIC_MOVING = "sha256:" + "b" * 64


def _fingerprint(series_uid: str, geometric: str | None) -> dict[str, Any]:
    fingerprint: dict[str, Any] = {
        "studyInstanceUID": "1.2.3.4",
        "seriesInstanceUID": series_uid,
        "instanceCount": 3,
        "contentDigest": "sha256:" + "0" * 64,
    }
    if geometric is not None:
        fingerprint["geometricDigest"] = geometric
    return fingerprint


def _rigid_request() -> dict[str, Any]:
    return {
        "mode": "rigid",
        "transformId": "xform-schema-fingerprint",
        "outOfDomainBehavior": "clamp",
        "fixed": {
            "locator": {"kind": "local-folder", "path": "/data/fixed"},
            "seriesInstanceUID": "1.2.3.4.5",
            "expectedFingerprint": _fingerprint("1.2.3.4.5", GEOMETRIC_FIXED),
            "expectedFrameOfReferenceUID": "1.2.3.4.for",
        },
        "moving": {
            "locator": {"kind": "local-folder", "path": "/data/moving"},
            "seriesInstanceUID": "1.2.3.4.6",
            "expectedFingerprint": _fingerprint("1.2.3.4.6", GEOMETRIC_MOVING),
            "expectedFrameOfReferenceUID": "1.2.3.4.for.2",
        },
    }


def _violations(params: dict[str, Any]) -> list[str]:
    with pytest.raises(ProtocolError) as excinfo:
        parse_registration_request(params)
    error = excinfo.value
    assert error.code == INVALID_PARAMS == -32602
    violations = error.data["violations"]
    assert isinstance(violations, list) and violations
    return cast(list[str], violations)


def _geometric_digest_violations(violations: list[str], side: str) -> list[str]:
    marker = f"params.{side}.expectedFingerprint.geometricDigest"
    return [item for item in violations if marker in item]


def test_rigid_accepts_geometric_digest_on_both_sides() -> None:
    request = parse_registration_request(_rigid_request())
    assert request.fixed_expected_fingerprint is not None
    assert request.fixed_expected_fingerprint.geometric_digest == GEOMETRIC_FIXED
    assert request.moving_expected_fingerprint is not None
    assert request.moving_expected_fingerprint.geometric_digest == GEOMETRIC_MOVING


def test_committed_mi_fixture_request_carries_both_geometric_digests() -> None:
    fixed = json.loads((MI_ROOT / "mi-fixed" / "expected-fingerprint.json").read_text())
    moving = json.loads((MI_ROOT / "mi-moving" / "expected-fingerprint.json").read_text())
    request = parse_registration_request(mi_rigid_request())
    assert request.fixed_expected_fingerprint is not None
    assert request.fixed_expected_fingerprint.geometric_digest == fixed["geometricDigest"]
    assert request.moving_expected_fingerprint is not None
    assert request.moving_expected_fingerprint.geometric_digest == moving["geometricDigest"]


@pytest.mark.parametrize("side", ["fixed", "moving"])
def test_missing_geometric_digest_is_refused_on_each_side(side: str) -> None:
    params = _rigid_request()
    params[side]["expectedFingerprint"].pop("geometricDigest")
    violations = _violations(params)
    assert _geometric_digest_violations(violations, side)
    other = "moving" if side == "fixed" else "fixed"
    assert not _geometric_digest_violations(violations, other)


@pytest.mark.parametrize(
    ("side", "value"),
    [("fixed", None), ("fixed", ""), ("moving", None), ("moving", "")],
)
def test_absent_or_empty_geometric_digest_is_refused(side: str, value: Any) -> None:
    params = _rigid_request()
    params[side]["expectedFingerprint"]["geometricDigest"] = value
    violations = _violations(params)
    assert _geometric_digest_violations(violations, side)


def test_landmarks_mode_keeps_no_fingerprint_requirement() -> None:
    request = parse_registration_request(
        {
            "mode": "landmarks",
            "transformId": "xform-schema-landmarks",
            "outOfDomainBehavior": "warn",
            "sourceFrameOfReferenceUID": "1.2.3.4.5",
            "targetFrameOfReferenceUID": "1.2.3.4.6",
            "landmarks": [
                {"source": [0.0, 0.0, 0.0], "target": [1.0, 1.0, 1.0]},
                {"source": [1.0, 0.0, 0.0], "target": [2.0, 1.0, 1.0]},
                {"source": [0.0, 1.0, 0.0], "target": [1.0, 2.0, 1.0]},
            ],
        }
    )
    assert request.fixed_expected_fingerprint is None
    assert request.moving_expected_fingerprint is None


def test_generic_expected_fingerprint_geometric_digest_remains_optional() -> None:
    parsed = parse_expected_fingerprint(
        {
            "studyInstanceUID": "1.2.3.4",
            "seriesInstanceUID": "1.2.3.4.5",
            "instanceCount": 1,
            "contentDigest": "sha256:" + "0" * 64,
        },
        "params.expectedFingerprint",
    )
    assert parsed.geometric_digest is None
