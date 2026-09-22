"""Shared helpers for the Phase 2B.2 Procrustes test modules.

Pure-Python recomputation (no numpy, no worker arithmetic) plus deterministic
request builders, imported by both ``test_registration_procrustes.py`` and its
refusal companion. This module is test support and is not collected by pytest.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any

import pytest
from synthetic_registration import (
    OUT_OF_DOMAIN_BEHAVIOR,
    SOURCE_FRAME_OF_REFERENCE_UID,
    TARGET_FRAME_OF_REFERENCE_UID,
    TRANSFORM_ID,
)

from dicom.registration_operations import registration_operation
from worker.protocol import REGISTRATION_INVALID, ProtocolError

Coordinate = tuple[float, float, float]
Row = list[float]

FROZEN_NOW = datetime(2026, 9, 22, 12, 0, 0, tzinfo=timezone.utc)
FROZEN_TIMESTAMP = "2026-09-22T12:00:00Z"
EXACT_TOLERANCE_MM = 1e-6
EXACT_TOLERANCE_DEG = 1e-6
NOISY_TOLERANCE_MM = 0.5
NOISY_TOLERANCE_DEG = 0.5


def request(
    source: Sequence[Coordinate],
    target: Sequence[Coordinate],
    *,
    source_for: str = SOURCE_FRAME_OF_REFERENCE_UID,
    target_for: str = TARGET_FRAME_OF_REFERENCE_UID,
) -> dict[str, Any]:
    """Build a schema-valid ``landmarks`` request from ordered correspondences."""
    return {
        "mode": "landmarks",
        "transformId": TRANSFORM_ID,
        "outOfDomainBehavior": OUT_OF_DOMAIN_BEHAVIOR,
        "sourceFrameOfReferenceUID": source_for,
        "targetFrameOfReferenceUID": target_for,
        "landmarks": [
            {"source": list(s), "target": list(t)} for s, t in zip(source, target)
        ],
    }


def run(
    source: Sequence[Coordinate],
    target: Sequence[Coordinate],
    *,
    source_for: str = SOURCE_FRAME_OF_REFERENCE_UID,
    target_for: str = TARGET_FRAME_OF_REFERENCE_UID,
) -> dict[str, Any]:
    """Run the landmark operation with a frozen clock."""
    params = request(source, target, source_for=source_for, target_for=target_for)
    return registration_operation(params, clock=lambda: FROZEN_NOW)


def rotation_block(matrix: Sequence[float]) -> list[Row]:
    """Extract the 3x3 rotation block from a row-major flat 4x4 matrix."""
    return [list(matrix[0:3]), list(matrix[4:7]), list(matrix[8:11])]


def apply_rigid(matrix: Sequence[float], point: Coordinate) -> Coordinate:
    """Apply the row-major homogeneous 4x4 to one point (column-vector form)."""
    x, y, z = point
    return (
        matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
        matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
        matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11],
    )


def point_errors(
    matrix: Sequence[float],
    source: Sequence[Coordinate],
    target: Sequence[Coordinate],
) -> list[float]:
    """Return per-pair Euclidean residuals for an applied candidate matrix."""
    return [math.dist(apply_rigid(matrix, s), t) for s, t in zip(source, target)]


def rms(errors: Sequence[float]) -> float:
    """Root-mean-square of a non-empty error sequence."""
    return math.sqrt(sum(value * value for value in errors) / len(errors))


def det3(rows: Sequence[Row]) -> float:
    """Determinant of a 3x3 row-major matrix."""
    (a, b, c) = rows
    return (
        a[0] * (b[1] * c[2] - b[2] * c[1])
        - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0])
    )


def geodesic_rotation_error_deg(recovered: Sequence[Row], truth: Sequence[Row]) -> float:
    """Geodesic angle of ``recovered · truthᵀ`` in degrees (orthonormal R)."""
    trace = sum(recovered[i][k] * truth[i][k] for i in range(3) for k in range(3))
    cosine = max(-1.0, min(1.0, (trace - 1.0) / 2.0))
    return math.degrees(math.acos(cosine))


def expect_refusal(
    source: Sequence[Coordinate],
    target: Sequence[Coordinate],
    reason: str,
    *,
    source_for: str = SOURCE_FRAME_OF_REFERENCE_UID,
    target_for: str = TARGET_FRAME_OF_REFERENCE_UID,
) -> None:
    """Assert a typed ``-32012`` refusal with the given reason and no transform."""
    with pytest.raises(ProtocolError) as excinfo:
        run(source, target, source_for=source_for, target_for=target_for)
    error = excinfo.value
    assert error.code == REGISTRATION_INVALID
    assert error.message == "Registration invalid"
    assert set(error.data) == {"diagnostic", "mode", "reason"}
    assert error.data["mode"] == "landmarks"
    assert error.data["reason"] == reason
    assert isinstance(error.data["diagnostic"], str) and error.data["diagnostic"]
    assert "transform" not in error.data
    assert "matrix4x4" not in error.data
