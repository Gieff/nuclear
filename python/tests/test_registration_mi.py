"""Phase 2B.3a evidence for the deterministic Mutual-Information rigid core.

Covers the ratified R4 protocol on the synthetic phantom (2B-T1 recovery), the
strict ``P_target = M . P_source`` convention with an empirical direction check,
bitwise determinism, rigidity/validity, provenance completeness, the fail-closed
refusals (degenerate evidence and a directly-invoked non-rigid guard), and the
re-assertion that the IPC ``mode: 'rigid'`` path still raises ``-32011``.

Residual arithmetic here is independent pure numpy recomputation, not worker
code. R3's bounds are a **fixture criterion**, not a clinical tolerance.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np
import pytest
import SimpleITK as _sitk
from numpy.typing import NDArray
from synthetic_mi_phantom import (
    fixed_image,
    ground_truth_matrix,
    moving_image,
    probe_points_mm,
)

from dicom.registration_math import homogenise
from dicom.registration_mi import (
    GRADIENT_MAGNITUDE_TOLERANCE,
    LEARNING_RATE,
    MIN_STEP,
    NUMBER_OF_HISTOGRAM_BINS,
    NUMBER_OF_ITERATIONS,
    RELAXATION_FACTOR,
    SHRINK_FACTORS_PER_LEVEL,
    SMOOTHING_SIGMAS_PER_LEVEL,
    MiRefusal,
    outcome_violation,
    register_rigid,
    require_rigid_transform,
    rigidity_violation,
    single_threaded,
)
from dicom.registration_operations import registration_operation
from worker.protocol import OPERATION_NOT_IMPLEMENTED, ProtocolError

RMS_TOLERANCE_MM = 0.5
MAX_TOLERANCE_MM = 0.5
ROTATION_TOLERANCE_DEG = 0.5

FROZEN_NOW = datetime(2026, 9, 22, 12, 0, 0, tzinfo=timezone.utc)

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

FloatArray = NDArray[np.float64]

sitk: Any = _sitk
"""Untyped SWIG boundary alias, exactly as in :mod:`dicom.registration_mi`."""


def _apply(matrix: FloatArray, point: tuple[float, float, float]) -> FloatArray:
    """Apply a row-major homogeneous 4x4 to one point (column-vector form)."""
    homogeneous = np.array([point[0], point[1], point[2], 1.0], dtype=np.float64)
    return np.asarray(matrix @ homogeneous, dtype=np.float64)[:3]


def _residuals(matrix: FloatArray, truth: FloatArray) -> FloatArray:
    """Per-probe Euclidean distance between ``matrix`` and ``truth`` images."""
    probes = probe_points_mm()
    return np.array(
        [
            float(np.linalg.norm(_apply(matrix, point) - _apply(truth, point)))
            for point in probes
        ],
        dtype=np.float64,
    )


def _geodesic_deg(recovered: FloatArray, truth: FloatArray) -> float:
    """Geodesic angle of ``R_rec . R_truth^T`` in degrees."""
    cosine = (float(np.trace(recovered @ truth.T)) - 1.0) / 2.0
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))


def test_recovery_meets_the_ratified_fixture_criterion() -> None:
    estimate = register_rigid(fixed_image(), moving_image())
    truth = ground_truth_matrix()
    residuals = _residuals(estimate.matrix, truth)
    rms = float(np.sqrt(np.mean(residuals**2)))
    maximum = float(np.max(residuals))
    rotation = _geodesic_deg(estimate.rotation, truth[:3, :3])
    print(
        f"[2B-T1 MI] rms={rms:.6f} mm max={maximum:.6f} mm "
        f"rotation={rotation:.6f} deg"
    )
    assert rms <= RMS_TOLERANCE_MM
    assert maximum <= MAX_TOLERANCE_MM
    assert rotation <= ROTATION_TOLERANCE_DEG


def test_convention_is_p_target_equals_m_times_p_source() -> None:
    estimate = register_rigid(fixed_image(), moving_image())
    truth = ground_truth_matrix()
    inverse = np.linalg.inv(truth)
    probes = probe_points_mm()
    forward = [
        np.linalg.norm(_apply(estimate.matrix, p) - _apply(truth, p)) for p in probes
    ]
    inverse_only = [
        np.linalg.norm(_apply(estimate.matrix, p) - _apply(inverse, p)) for p in probes
    ]
    assert max(forward) <= MAX_TOLERANCE_MM
    # Empirically pins the direction: the recovered map is the fixed->moving map,
    # not its inverse (source = fixed, target = moving, no inversion).
    assert min(inverse_only) > MAX_TOLERANCE_MM


def test_recovered_transform_is_a_finite_proper_rigid_matrix() -> None:
    estimate = register_rigid(fixed_image(), moving_image())
    matrix = estimate.matrix
    assert matrix.shape == (4, 4)
    assert bool(np.all(np.isfinite(matrix)))
    assert np.allclose(matrix[3], [0.0, 0.0, 0.0, 1.0], rtol=0.0, atol=0.0)
    assert float(np.linalg.det(estimate.rotation)) == pytest.approx(1.0, abs=1e-12)
    assert rigidity_violation(estimate.rotation) is None
    assert matrix[:3, 3].tolist() == estimate.translation.tolist()
    assert np.array_equal(
        homogenise(estimate.rotation, estimate.translation), estimate.matrix
    )


def test_registration_is_bitwise_deterministic_across_runs() -> None:
    first = register_rigid(fixed_image(), moving_image())
    second = register_rigid(fixed_image(), moving_image())
    assert np.array_equal(first.matrix, second.matrix)
    assert first.metric_value == second.metric_value
    assert first.iterations == second.iterations
    assert first.stop_condition == second.stop_condition
    assert dict(first.effective_parameters) == dict(second.effective_parameters)


def test_effective_parameters_carry_every_ratified_r4_value() -> None:

    parameters = dict(
        register_rigid(fixed_image(), moving_image()).effective_parameters
    )
    assert parameters["transform"] == "Euler3DTransform"
    assert parameters["initializer"] == "CenteredTransformInitializer"
    assert parameters["initializerFilter"] == "GEOMETRY"
    assert parameters["metric"] == "MattesMutualInformation"
    assert parameters["numberOfHistogramBins"] == NUMBER_OF_HISTOGRAM_BINS == 50
    assert parameters["metricSamplingStrategy"] == "NONE"
    assert parameters["interpolator"] == "sitkLinear"
    assert parameters["optimizer"] == "RegularStepGradientDescent"
    assert parameters["learningRate"] == LEARNING_RATE == 2.0
    assert parameters["minStep"] == MIN_STEP == 1e-4
    assert parameters["numberOfIterations"] == NUMBER_OF_ITERATIONS == 500
    assert parameters["relaxationFactor"] == RELAXATION_FACTOR == 0.5
    assert (
        parameters["gradientMagnitudeTolerance"]
        == GRADIENT_MAGNITUDE_TOLERANCE
        == 1e-8
    )
    assert parameters["scalesEstimator"] == "PhysicalShift"
    assert parameters["centralRegionRadius"] == 5
    assert parameters["smallParameterVariation"] == 0.01
    assert parameters["shrinkFactorsPerLevel"] == list(SHRINK_FACTORS_PER_LEVEL)
    assert parameters["shrinkFactorsPerLevel"] == [4, 2, 1]
    assert parameters["smoothingSigmasPerLevel"] == list(SMOOTHING_SIGMAS_PER_LEVEL)
    assert parameters["smoothingSigmasInPhysicalUnits"] is True
    assert parameters["pixelType"] == "sitkFloat32"
    assert parameters["simpleItkVersion"] == sitk.Version_VersionString()
    assert parameters["numpyVersion"] == np.__version__
    assert np.isfinite(parameters["finalMetricValue"])
    assert parameters["executedIterations"] >= 1
    assert parameters["stopConditionDescription"]


def test_zero_size_image_is_refused_fail_closed() -> None:

    empty = sitk.Image([0, 0, 0], sitk.sitkFloat32)
    with pytest.raises(MiRefusal) as excinfo:
        register_rigid(empty, moving_image())
    error = excinfo.value
    assert error.reason == "invalid-evidence"
    assert error.diagnostic
    assert not hasattr(error, "matrix")


def test_non_finite_pixels_are_refused_fail_closed() -> None:

    poisoned = sitk.GetImageFromArray(
        np.full((4, 4, 4), np.nan, dtype=np.float32)
    )
    with pytest.raises(MiRefusal) as excinfo:
        register_rigid(fixed_image(), poisoned)
    assert excinfo.value.reason == "invalid-evidence"
    assert not hasattr(excinfo.value, "matrix")


def test_non_rigid_guard_is_pure_and_refuses_transforms() -> None:
    singular = np.diag([1.0, 1.0, 0.0])
    assert rigidity_violation(singular) == "non-rigid-transform"
    scaled = 2.0 * np.eye(3)
    assert rigidity_violation(scaled) == "non-rigid-transform"
    guard_4x4 = np.eye(4)
    guard_4x4[:3, :3] = singular
    with pytest.raises(MiRefusal) as excinfo:
        require_rigid_transform(guard_4x4)
    assert excinfo.value.reason == "non-rigid-transform"
    assert not hasattr(excinfo.value, "matrix")


def test_outcome_guard_flags_failure_and_non_finite_metric() -> None:
    assert outcome_violation(1.0, "Step too small after 3 iterations.") is None
    assert outcome_violation(float("nan"), "Step too small.") == "invalid-residual"
    assert (
        outcome_violation(1.0, "Exception thrown during optimisation")
        == "optimisation-failed"
    )
    # 2B.4: zero iterations is benign (the geometry initialiser may already be
    # converged), but only with an explicit non-failure stop condition.
    assert outcome_violation(1.0, "Step too small after 0 iterations.", iterations=0) is None
    assert outcome_violation(1.0, "", iterations=0) == "optimisation-failed"


def test_single_threaded_forces_one_and_restores_even_on_failure() -> None:

    original = int(sitk.ProcessObject.GetGlobalDefaultNumberOfThreads())
    try:
        with pytest.raises(RuntimeError), single_threaded():
            assert int(sitk.ProcessObject.GetGlobalDefaultNumberOfThreads()) == 1
            raise RuntimeError("boom")
        assert int(sitk.ProcessObject.GetGlobalDefaultNumberOfThreads()) == original
    finally:
        sitk.ProcessObject.SetGlobalDefaultNumberOfThreads(original)


def test_rigid_ipc_mode_still_returns_not_implemented() -> None:
    with pytest.raises(ProtocolError) as excinfo:
        registration_operation(RIGID_REQUEST, clock=lambda: FROZEN_NOW)
    error = excinfo.value
    assert error.code == OPERATION_NOT_IMPLEMENTED == -32011
    assert error.data["mode"] == "rigid"
    assert "transform" not in error.data
    assert "matrix4x4" not in error.data
