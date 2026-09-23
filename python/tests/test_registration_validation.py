"""Phase 2B.4 evidence-validity / fail-closed tests (NuClear).

Positive and negative fixture tests for
:func:`dicom.registration_validation.validate_spatial_transform_evidence` and
for the 2B.4 zero-iteration formalisation of
:func:`dicom.registration_mi.outcome_violation`. Every negative case mutates a
single field of an INLINE evidence object; no committed clinical fixture and no
real transform is involved. ``errorMarginMm`` policy: the validator is
policy-neutral (absent is accepted), while a present negative/non-finite value
is refused.
"""

from __future__ import annotations

import copy
from typing import Any

import numpy as np
import pytest

from dicom.registration_mi import MiRefusal, outcome_violation, require_rigid_transform
from dicom.registration_validation import (
    EvidenceRefusal,
    require_valid_matrix4x4,
    validate_spatial_transform_evidence,
)

IDENTITY = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]


def _valid_transform() -> dict[str, Any]:
    """Inline, wire-shape ``SpatialTransform`` object with no defect."""
    return {
        "id": "xform-evidence-1",
        "sourceFrameOfReferenceUID": "1.2.3.4.5",
        "targetFrameOfReferenceUID": "1.2.3.4.6",
        "transformType": "rigid",
        "matrix4x4": list(IDENTITY),
        "units": "mm",
        "provenance": {
            "method": "manual-alignment",
            "workerVersion": "0.3.0",
            "timestamp": "2026-09-22T12:00:00Z",
        },
        "validity": {
            "isValid": True,
            "outOfDomainBehavior": "warn",
            "errorMarginMm": 0.25,
        },
    }


def _expect_refusal(transform: object, reason: str) -> EvidenceRefusal:
    with pytest.raises(EvidenceRefusal) as excinfo:
        validate_spatial_transform_evidence(transform)
    error = excinfo.value
    assert error.reason == reason
    assert isinstance(error.diagnostic, str) and error.diagnostic
    assert not hasattr(error, "matrix")
    return error


def test_valid_evidence_passes() -> None:
    validate_spatial_transform_evidence(_valid_transform())


def test_malformed_transform_is_refused() -> None:
    _expect_refusal([], "malformed-evidence")
    _expect_refusal({"validity": None}, "malformed-evidence")


def test_is_valid_false_is_refused() -> None:
    transform = _valid_transform()
    transform["validity"]["isValid"] = False
    _expect_refusal(transform, "not-valid")


def test_invalid_units_are_refused() -> None:
    transform = _valid_transform()
    transform["units"] = "cm"
    _expect_refusal(transform, "invalid-units")


@pytest.mark.parametrize(
    ("label", "mutate"),
    [
        ("short-matrix", lambda matrix: matrix.__setitem__(slice(None), matrix[:15])),
        ("non-finite", lambda matrix: matrix.__setitem__(1, float("inf"))),
        ("boolean-element", lambda matrix: matrix.__setitem__(1, True)),
        ("non-numeric", lambda matrix: matrix.__setitem__(1, "1.0")),
        ("last-row", lambda matrix: matrix.__setitem__(15, 0.0)),
    ],
)
def test_malformed_matrix_is_refused(label: str, mutate: Any) -> None:
    transform = _valid_transform()
    mutate(transform["matrix4x4"])
    _expect_refusal(transform, "malformed-matrix")


def test_non_orthonormal_rotation_is_refused() -> None:
    transform = _valid_transform()
    transform["matrix4x4"] = [2.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]
    _expect_refusal(transform, "non-rigid-transform")


def test_reflection_determinant_is_refused() -> None:
    transform = _valid_transform()
    transform["matrix4x4"] = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 1.0]
    _expect_refusal(transform, "non-rigid-transform")


def test_identity_typed_identity_matrix_is_accepted() -> None:
    transform = _valid_transform()
    transform["transformType"] = "identity"
    validate_spatial_transform_evidence(transform)


def test_identity_typed_translated_matrix_is_incoherent() -> None:
    transform = _valid_transform()
    transform["transformType"] = "identity"
    transform["matrix4x4"] = [
        1.0, 0.0, 0.0, 5.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]
    _expect_refusal(transform, "incoherent-transform-type")


def test_unknown_transform_type_is_refused() -> None:
    transform = _valid_transform()
    transform["transformType"] = "similarity"
    _expect_refusal(transform, "incoherent-transform-type")


def test_rigid_typed_non_orthonormal_matrix_is_refused() -> None:
    transform = _valid_transform()
    transform["transformType"] = "rigid"
    transform["matrix4x4"] = [
        2.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]
    _expect_refusal(transform, "non-rigid-transform")


def test_affine_typed_scaled_matrix_is_accepted() -> None:
    transform = _valid_transform()
    transform["transformType"] = "affine"
    transform["matrix4x4"] = [
        2.0, 0.0, 0.0, 0.0,
        0.0, 3.0, 0.0, 0.0,
        0.0, 0.0, 4.0, 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]
    validate_spatial_transform_evidence(transform)


def test_affine_typed_non_homogeneous_matrix_is_refused() -> None:
    transform = _valid_transform()
    transform["transformType"] = "affine"
    transform["matrix4x4"] = [
        2.0, 0.0, 0.0, 0.0,
        0.0, 3.0, 0.0, 0.0,
        0.0, 0.0, 4.0, 0.0,
        1.0, 0.0, 0.0, 1.0,
    ]
    _expect_refusal(transform, "malformed-matrix")


def test_empty_frame_of_reference_is_refused() -> None:
    transform = _valid_transform()
    transform["sourceFrameOfReferenceUID"] = ""
    _expect_refusal(transform, "empty-frame-of-reference")


def test_same_frame_of_reference_is_refused() -> None:
    transform = _valid_transform()
    transform["targetFrameOfReferenceUID"] = transform["sourceFrameOfReferenceUID"]
    _expect_refusal(transform, "same-frame-of-reference")


@pytest.mark.parametrize(
    "mutate",
    [
        lambda provenance: provenance.__setitem__("method", "invented"),
        lambda provenance: provenance.__setitem__("workerVersion", ""),
        lambda provenance: provenance.__setitem__("timestamp", "not-an-instant"),
    ],
)
def test_incomplete_provenance_is_refused(mutate: Any) -> None:
    transform = _valid_transform()
    mutate(transform["provenance"])
    _expect_refusal(transform, "incomplete-provenance")


def test_absent_error_margin_is_accepted_policy_neutral() -> None:
    transform = _valid_transform()
    del transform["validity"]["errorMarginMm"]
    validate_spatial_transform_evidence(transform)


@pytest.mark.parametrize("value", [-0.5, float("nan"), float("inf"), True])
def test_present_invalid_error_margin_is_refused(value: Any) -> None:
    transform = _valid_transform()
    transform["validity"]["errorMarginMm"] = value
    _expect_refusal(transform, "invalid-error-margin")


def test_require_valid_matrix_accepts_identity_and_refuses_non_rigid() -> None:
    require_valid_matrix4x4(list(IDENTITY))
    with pytest.raises(EvidenceRefusal) as excinfo:
        require_valid_matrix4x4([1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0])
    assert excinfo.value.reason == "non-rigid-transform"


def test_mi_zero_iteration_is_accepted_only_with_structural_evidence() -> None:
    # Zero iterations is not automatically an error: the geometry-based
    # initialisation may already be converged.
    assert outcome_violation(0.5, "Step too small after 0 iterations.", iterations=0) is None
    require_rigid_transform(np.eye(4))
    # ... but an absent/empty or explicitly failing stop condition is refused.
    assert outcome_violation(0.5, "", iterations=0) == "optimisation-failed"
    assert (
        outcome_violation(0.5, "Optimizer exception thrown", iterations=0)
        == "optimisation-failed"
    )
    assert outcome_violation(0.5, "Step too small.", iterations=-1) == "optimisation-failed"
    assert outcome_violation(float("nan"), "Step too small.", iterations=0) == "invalid-metric"
    # ... and a non-rigid transform is refused through the shared validator.
    with pytest.raises(MiRefusal) as excinfo:
        require_rigid_transform(np.diag([1.0, 1.0, 0.0, 1.0]))
    assert excinfo.value.reason == "non-rigid-transform"


def test_landmark_operation_evidence_passes_the_validator() -> None:
    from datetime import datetime, timezone

    from dicom.registration_operations import registration_operation

    request = {
        "mode": "landmarks",
        "transformId": "xform-2b4-1",
        "outOfDomainBehavior": "warn",
        "sourceFrameOfReferenceUID": "1.2.3.4.5",
        "targetFrameOfReferenceUID": "1.2.3.4.6",
        "landmarks": [
            {"source": [0.0, 0.0, 0.0], "target": [1.0, 1.0, 1.0]},
            {"source": [1.0, 0.0, 0.0], "target": [2.0, 1.0, 1.0]},
            {"source": [0.0, 1.0, 0.0], "target": [1.0, 2.0, 1.0]},
        ],
    }
    clock = lambda: datetime(2026, 9, 22, 12, 0, 0, tzinfo=timezone.utc)  # noqa: E731
    evidence = registration_operation(copy.deepcopy(request), clock=clock)
    validate_spatial_transform_evidence(evidence["transform"])
