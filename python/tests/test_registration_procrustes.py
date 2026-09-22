"""Phase 2B.2 evidence for the manual-landmark Procrustes registration path.

Covers the ratified fixture criteria 2B-T3 (exactness on exact correspondences)
and 2B-T1 (recovery on the noisy phantom), the strict ``P_target = M · P_source``
convention, the residual evidence (RMS = ``validity.errorMarginMm`` plus the
maximum in ``workerMetadata.parameters``), determinism, and the fail-closed
``-32012`` refusals (same Frame of Reference, coincident, collinear,
reflection-required). Point/rotation arithmetic here is independent pure-Python
recomputation from :mod:`registration_procrustes_support`, not worker code.

The numeric near-degeneracy threshold candidate is NOT ratified: the
sensitivity fixture records the measured singular-value ratio without asserting
any threshold-dependent behaviour.
"""

from __future__ import annotations

import json
import math

import pytest
from registration_procrustes_support import (
    EXACT_TOLERANCE_DEG,
    EXACT_TOLERANCE_MM,
    FROZEN_NOW,
    FROZEN_TIMESTAMP,
    NOISY_TOLERANCE_DEG,
    NOISY_TOLERANCE_MM,
    apply_rigid,
    det3,
    expect_refusal,
    geodesic_rotation_error_deg,
    point_errors,
    rms,
    rotation_block,
    run,
)
from synthetic_registration import (
    COINCIDENT_SOURCE_LANDMARKS,
    COLLINEAR_SOURCE_LANDMARKS,
    EXACT_SOURCE_LANDMARKS,
    EXACT_TARGET_LANDMARKS,
    GROUND_TRUTH_ROTATION,
    NEAR_DEGENERATE_SOURCE_LANDMARKS,
    NEAR_DEGENERATE_TARGET_LANDMARKS,
    NOISY_TARGET_LANDMARKS,
    NON_DEGENERATE_TARGET_LANDMARKS,
    OUT_OF_DOMAIN_BEHAVIOR,
    REFLECTION_SOURCE_LANDMARKS,
    REFLECTION_TARGET_LANDMARKS,
    SOURCE_FRAME_OF_REFERENCE_UID,
    TARGET_FRAME_OF_REFERENCE_UID,
    TRANSFORM_ID,
)

from dicom.registration_math import (
    NEAR_DEGENERACY_CONDITION_CANDIDATE,
    estimate_rigid_transform,
)
from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import (
    PROTOCOL_VERSION,
    REGISTRATION_INVALID,
    REGISTRATION_METHOD,
)

TRUTH_ROTATION = [list(row) for row in GROUND_TRUTH_ROTATION]


def test_exact_correspondences_recover_the_ground_truth_to_machine_precision() -> None:
    matrix = run(EXACT_SOURCE_LANDMARKS, EXACT_TARGET_LANDMARKS)["transform"]["matrix4x4"]
    assert len(matrix) == 16
    assert all(math.isfinite(value) for value in matrix)
    assert matrix[12:16] == [0.0, 0.0, 0.0, 1.0]
    rotation = rotation_block(matrix)
    assert det3(rotation) == pytest.approx(1.0, abs=1e-9)
    errors = point_errors(matrix, EXACT_SOURCE_LANDMARKS, EXACT_TARGET_LANDMARKS)
    assert max(errors) <= EXACT_TOLERANCE_MM
    assert rms(errors) <= EXACT_TOLERANCE_MM
    assert geodesic_rotation_error_deg(rotation, TRUTH_ROTATION) <= EXACT_TOLERANCE_DEG


def test_noisy_phantom_recovers_within_ratified_fixture_tolerances() -> None:
    result = run(EXACT_SOURCE_LANDMARKS, NOISY_TARGET_LANDMARKS)
    matrix = result["transform"]["matrix4x4"]
    errors = point_errors(matrix, EXACT_SOURCE_LANDMARKS, NOISY_TARGET_LANDMARKS)
    rms_error = rms(errors)
    maximum = max(errors)
    angle = geodesic_rotation_error_deg(rotation_block(matrix), TRUTH_ROTATION)
    print(
        f"[2B-T1] noisy phantom rms={rms_error:.6f} mm "
        f"max={maximum:.6f} mm rotation={angle:.6f} deg"
    )
    assert rms_error <= NOISY_TOLERANCE_MM
    assert maximum <= NOISY_TOLERANCE_MM
    assert angle <= NOISY_TOLERANCE_DEG
    assert result["transform"]["validity"]["errorMarginMm"] == pytest.approx(
        rms_error, abs=1e-12
    )


def test_transform_convention_maps_source_points_onto_targets() -> None:
    matrix = run(EXACT_SOURCE_LANDMARKS, EXACT_TARGET_LANDMARKS)["transform"]["matrix4x4"]
    for source, target in zip(EXACT_SOURCE_LANDMARKS, EXACT_TARGET_LANDMARKS):
        assert math.dist(apply_rigid(matrix, source), target) <= EXACT_TOLERANCE_MM


def test_success_evidence_carries_ratified_provenance_and_echoes_caller_fields() -> None:
    import worker

    result = run(EXACT_SOURCE_LANDMARKS, EXACT_TARGET_LANDMARKS)
    transform = result["transform"]
    assert transform["transformType"] == "rigid"
    assert transform["units"] == "mm"
    assert transform["id"] == TRANSFORM_ID
    assert transform["sourceFrameOfReferenceUID"] == SOURCE_FRAME_OF_REFERENCE_UID
    assert transform["targetFrameOfReferenceUID"] == TARGET_FRAME_OF_REFERENCE_UID
    assert transform["provenance"]["method"] == "manual-alignment"
    assert transform["provenance"]["workerVersion"] == worker.__version__
    assert transform["provenance"]["timestamp"] == FROZEN_TIMESTAMP
    assert transform["validity"]["isValid"] is True
    assert transform["validity"]["outOfDomainBehavior"] == OUT_OF_DOMAIN_BEHAVIOR
    assert result["workerMetadata"]["operation"] == REGISTRATION_METHOD
    assert result["workerMetadata"]["timestamp"] == FROZEN_TIMESTAMP


def test_residual_and_maximum_are_carried_in_worker_metadata_parameters() -> None:
    result = run(EXACT_SOURCE_LANDMARKS, NOISY_TARGET_LANDMARKS)
    errors = point_errors(
        result["transform"]["matrix4x4"], EXACT_SOURCE_LANDMARKS, NOISY_TARGET_LANDMARKS
    )
    parameters = result["workerMetadata"]["parameters"]
    assert parameters["mode"] == "landmarks"
    assert parameters["pairCount"] == len(EXACT_SOURCE_LANDMARKS)
    assert parameters["rmsPointErrorMm"] == pytest.approx(rms(errors), abs=1e-12)
    assert parameters["maxPointErrorMm"] == pytest.approx(max(errors), abs=1e-12)
    assert result["transform"]["validity"]["errorMarginMm"] == pytest.approx(
        parameters["rmsPointErrorMm"], abs=0.0
    )


def test_estimate_is_deterministic_across_runs() -> None:
    first = run(EXACT_SOURCE_LANDMARKS, NOISY_TARGET_LANDMARKS)["transform"]["matrix4x4"]
    second = run(EXACT_SOURCE_LANDMARKS, NOISY_TARGET_LANDMARKS)["transform"]["matrix4x4"]
    assert first == second


def test_same_frame_of_reference_is_refused() -> None:
    expect_refusal(
        EXACT_SOURCE_LANDMARKS,
        EXACT_TARGET_LANDMARKS,
        "same-frame-of-reference",
        source_for="1.2.826.0.1.3680043.10.2025.1",
        target_for="1.2.826.0.1.3680043.10.2025.1",
    )


def test_coincident_landmarks_are_refused() -> None:
    expect_refusal(
        COINCIDENT_SOURCE_LANDMARKS,
        NON_DEGENERATE_TARGET_LANDMARKS,
        "degenerate-landmarks",
    )


def test_collinear_landmarks_are_refused() -> None:
    expect_refusal(
        COLLINEAR_SOURCE_LANDMARKS,
        NON_DEGENERATE_TARGET_LANDMARKS,
        "degenerate-landmarks",
    )


def test_reflection_is_refused_not_silently_mirrored() -> None:
    expect_refusal(
        REFLECTION_SOURCE_LANDMARKS,
        REFLECTION_TARGET_LANDMARKS,
        "reflection-required",
    )


def test_envelope_maps_scientific_refusal_to_versioned_registration_invalid() -> None:
    dispatcher = build_dispatcher(now=lambda: FROZEN_NOW)
    request = {
        "jsonrpc": "2.0",
        "id": "req-reg-2b2",
        "protocolVersion": PROTOCOL_VERSION,
        "method": REGISTRATION_METHOD,
        "params": {
            "mode": "landmarks",
            "transformId": TRANSFORM_ID,
            "outOfDomainBehavior": OUT_OF_DOMAIN_BEHAVIOR,
            "sourceFrameOfReferenceUID": "1.2.826.0.1.3680043.10.2025.1",
            "targetFrameOfReferenceUID": "1.2.826.0.1.3680043.10.2025.1",
            "landmarks": [
                {"source": list(s), "target": list(t)}
                for s, t in zip(EXACT_SOURCE_LANDMARKS, EXACT_TARGET_LANDMARKS)
            ],
        },
    }
    response = process_record(json.dumps(request), 0, dispatcher)
    assert "result" not in response
    assert response["error"]["code"] == REGISTRATION_INVALID
    assert response["error"]["data"]["reason"] == "same-frame-of-reference"


def test_near_degenerate_sensitivity_records_singular_value_ratio_only() -> None:
    estimate = estimate_rigid_transform(
        NEAR_DEGENERATE_SOURCE_LANDMARKS, NEAR_DEGENERATE_TARGET_LANDMARKS
    )
    ratio = estimate.singular_value_ratio
    print(
        f"[R6 sensitivity] near-degenerate centred singular-value ratio s0/s1={ratio:.6e}; "
        f"candidate bound {NEAR_DEGENERACY_CONDITION_CANDIDATE:.0e} is [TO RATIFY] and "
        "not asserted"
    )
    assert math.isfinite(ratio)
