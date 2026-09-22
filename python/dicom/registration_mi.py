"""Deterministic Mutual-Information rigid registration core (NuClear 2B.3a).

Pure scientific core operating on ``sitk.Image`` objects: **no** DICOM reading,
no voxel/volume transport, no file I/O and no IPC. The worker ``mode: 'rigid'``
operation stays the reserved ``-32011 OPERATION_NOT_IMPLEMENTED`` stub in
:mod:`dicom.registration_operations`; this module is not wired into it.

Convention (verified empirically in the fixture suite): SimpleITK's transform
maps the *fixed* image onto the *moving* image, so this module labels
**source = fixed** and **target = moving** and returns the fixed->moving
transform with **no inversion**, satisfying ``P_target = M . P_source`` in
patient LPS millimetres, row-major 4x4, last row ``[0, 0, 0, 1]``. Evidence
authority: ``docs/plans/PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md`` (R4, ratified
2026-09-22); a parameter change is a re-ratification, never a silent edit.
Dimensionless MI metric: no mm residual is emitted; ``errorMarginMm`` is 2B.4 scope.
"""

from __future__ import annotations

import math
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
import SimpleITK as _sitk
from numpy.typing import NDArray

from .registration_math import homogenise

sitk: Any = _sitk
"""SimpleITK's SWIG bindings ship no annotations, so the module is aliased to
``Any`` to keep strict mypy useful for NuClear's fully annotated logic here."""

FloatArray = NDArray[np.float64]
RefusalReason = Literal[
    "invalid-evidence", "optimisation-failed", "non-rigid-transform", "invalid-residual"
]

#: Machine-epsilon-scale guard around an exact proper rotation, **not** a
#: clinical tolerance and **not** a registration-accuracy threshold.
RIGIDITY_NUMERICAL_GUARD = 1e-9

NUMBER_OF_HISTOGRAM_BINS = 50
SHRINK_FACTORS_PER_LEVEL = (4, 2, 1)
SMOOTHING_SIGMAS_PER_LEVEL = (2.0, 1.0, 0.0)
LEARNING_RATE = 2.0
MIN_STEP = 1e-4
NUMBER_OF_ITERATIONS = 500
RELAXATION_FACTOR = 0.5
GRADIENT_MAGNITUDE_TOLERANCE = 1e-8
CENTRAL_REGION_RADIUS = 5
SMALL_PARAMETER_VARIATION = 0.01
_OPTIMIZER_FAILURE_MARKERS = ("exception", "error", "fail", "nan", "inf")

class MiRefusal(Exception):
    """Typed fail-closed refusal; no transform is ever fabricated."""

    def __init__(self, reason: RefusalReason, diagnostic: str) -> None:
        super().__init__(diagnostic)
        self.reason = reason
        self.diagnostic = diagnostic

@dataclass(frozen=True)
class MiEstimate:
    """Recovered rigid transform and ratified R4 provenance evidence."""

    matrix: FloatArray  #: Row-major homogeneous 4x4, fixed(source) -> moving(target).
    rotation: FloatArray  #: 3x3 proper orthonormal rotation block.
    translation: FloatArray  #: Effective translation vector, shape ``(3,)``.
    metric_value: float  #: Final Mattes mutual-information metric value.
    iterations: int  #: Optimizer iterations actually executed.
    stop_condition: str  #: ``GetOptimizerStopConditionDescription()``.
    effective_parameters: Mapping[str, Any]  #: Effective R4 parameters + versions.

def rigidity_violation(
    rotation: FloatArray, *, guard: float = RIGIDITY_NUMERICAL_GUARD
) -> RefusalReason | None:
    """Return ``"non-rigid-transform"`` unless ``rotation`` is proper orthonormal.

    Pure: a deliberately singular/scaled matrix (e.g. ``diag(1, 1, 0)``) returns
    the refusal reason without touching SimpleITK.
    """
    array = np.asarray(rotation, dtype=np.float64)
    if array.shape != (3, 3) or not bool(np.all(np.isfinite(array))):
        return "non-rigid-transform"
    if abs(float(np.linalg.det(array)) - 1.0) > guard:
        return "non-rigid-transform"
    if float(np.max(np.abs(array.T @ array - np.eye(3)))) > guard:
        return "non-rigid-transform"
    return None

def require_rigid_transform(
    matrix: FloatArray, *, guard: float = RIGIDITY_NUMERICAL_GUARD
) -> None:
    """Raise :class:`MiRefusal` unless ``matrix`` is a finite proper rigid 4x4.

    Pure and directly unit-testable; the last row is checked within the guard.
    """
    array = np.asarray(matrix, dtype=np.float64)
    if array.shape != (4, 4) or not bool(np.all(np.isfinite(array))):
        raise MiRefusal("non-rigid-transform", "matrix is not a finite 4x4.")
    if not bool(np.allclose(array[3], [0.0, 0.0, 0.0, 1.0], rtol=0.0, atol=guard)):
        raise MiRefusal("non-rigid-transform", "homogeneous last row is not [0,0,0,1].")
    reason = rigidity_violation(array[:3, :3], guard=guard)
    if reason is not None:
        raise MiRefusal(reason, "rotation block is not proper orthonormal.")

def outcome_violation(metric_value: float, stop_condition: str) -> RefusalReason | None:
    """Return a refusal reason for a non-finite metric or a failed stop state."""
    if not math.isfinite(metric_value):
        return "invalid-residual"
    if any(marker in stop_condition.lower() for marker in _OPTIMIZER_FAILURE_MARKERS):
        return "optimisation-failed"
    return None

def _require_valid_image(image: Any, name: str) -> None:
    """Fail closed on a missing, non-3D, empty or non-finite image."""
    if not isinstance(image, sitk.Image):
        raise MiRefusal("invalid-evidence", f"{name} must be a SimpleITK Image.")
    if int(image.GetDimension()) != 3:
        raise MiRefusal("invalid-evidence", f"{name} must be a 3-D image.")
    if int(image.GetNumberOfPixels()) == 0:
        raise MiRefusal("invalid-evidence", f"{name} is empty (zero pixels).")
    voxels = np.asarray(sitk.GetArrayFromImage(image), dtype=np.float64)
    if not bool(np.all(np.isfinite(voxels))):
        raise MiRefusal("invalid-evidence", f"{name} contains non-finite pixels.")

@contextmanager
def single_threaded() -> Iterator[None]:
    """Force the SimpleITK global default thread count to 1 and restore it after.

    Restoration happens even when the body raises (R4 determinism is structural).
    """
    original = int(sitk.ProcessObject.GetGlobalDefaultNumberOfThreads())
    sitk.ProcessObject.SetGlobalDefaultNumberOfThreads(1)
    try:
        yield
    finally:
        sitk.ProcessObject.SetGlobalDefaultNumberOfThreads(original)

def _build_registration() -> Any:
    """Configure the ratified R4 multi-resolution MI registration method."""
    method = sitk.ImageRegistrationMethod()
    method.SetMetricAsMattesMutualInformation(
        numberOfHistogramBins=NUMBER_OF_HISTOGRAM_BINS
    )
    method.SetMetricSamplingStrategy(sitk.ImageRegistrationMethod.NONE)
    method.SetInterpolator(sitk.sitkLinear)
    method.SetShrinkFactorsPerLevel(list(SHRINK_FACTORS_PER_LEVEL))
    method.SetSmoothingSigmasPerLevel(list(SMOOTHING_SIGMAS_PER_LEVEL))
    method.SetSmoothingSigmasAreSpecifiedInPhysicalUnits(True)
    method.SetOptimizerAsRegularStepGradientDescent(
        learningRate=LEARNING_RATE,
        minStep=MIN_STEP,
        numberOfIterations=NUMBER_OF_ITERATIONS,
        relaxationFactor=RELAXATION_FACTOR,
        gradientMagnitudeTolerance=GRADIENT_MAGNITUDE_TOLERANCE,
    )
    method.SetOptimizerScalesFromPhysicalShift(
        centralRegionRadius=CENTRAL_REGION_RADIUS,
        smallParameterVariation=SMALL_PARAMETER_VARIATION,
    )
    return method

def _transform_matrix(transform: Any) -> FloatArray:
    """Return the 4x4 of ``transform`` in fixed(source) -> moving(target) form.

    ``TransformPoint(0)`` yields the effective offset ``c + t - R c`` for the
    Euler transform's (possibly non-zero) centre, avoiding any inverse.
    """
    rotation = np.asarray(transform.GetMatrix(), dtype=np.float64).reshape(3, 3)
    offset = np.asarray(transform.TransformPoint((0.0, 0.0, 0.0)), dtype=np.float64)
    return homogenise(rotation, offset)

def _effective_parameters(
    metric_value: float, iterations: int, stop_condition: str
) -> dict[str, Any]:
    """Structured provenance: every effective R4 parameter plus versions."""
    return {
        "transform": "Euler3DTransform", "initializer": "CenteredTransformInitializer",
        "initializerFilter": "GEOMETRY", "metric": "MattesMutualInformation",
        "numberOfHistogramBins": NUMBER_OF_HISTOGRAM_BINS,
        "metricSamplingStrategy": "NONE", "interpolator": "sitkLinear",
        "optimizer": "RegularStepGradientDescent", "learningRate": LEARNING_RATE,
        "minStep": MIN_STEP, "numberOfIterations": NUMBER_OF_ITERATIONS,
        "relaxationFactor": RELAXATION_FACTOR,
        "gradientMagnitudeTolerance": GRADIENT_MAGNITUDE_TOLERANCE,
        "scalesEstimator": "PhysicalShift",
        "centralRegionRadius": CENTRAL_REGION_RADIUS,
        "smallParameterVariation": SMALL_PARAMETER_VARIATION,
        "shrinkFactorsPerLevel": list(SHRINK_FACTORS_PER_LEVEL),
        "smoothingSigmasPerLevel": list(SMOOTHING_SIGMAS_PER_LEVEL),
        "smoothingSigmasInPhysicalUnits": True, "pixelType": "sitkFloat32",
        "simpleItkVersion": str(sitk.Version_VersionString()),
        "numpyVersion": str(np.__version__), "finalMetricValue": metric_value,
        "executedIterations": iterations, "stopConditionDescription": stop_condition,
    }

def register_rigid(fixed: Any, moving: Any) -> MiEstimate:
    """Recover the rigid transform mapping ``fixed`` (source) onto ``moving``.

    Runs the ratified R4 protocol exactly (deterministic, single-threaded).
    ``fixed``/``moving`` are ``sitk.Image`` objects and the return carries the
    full provenance evidence. Raises :class:`MiRefusal` for invalid evidence, a
    failed/non-finite optimisation, or a non-rigid recovered transform — no
    transform is ever fabricated.
    """
    _require_valid_image(fixed, "fixed")
    _require_valid_image(moving, "moving")
    with single_threaded():
        method = _build_registration()
        fixed32 = sitk.Cast(fixed, sitk.sitkFloat32)
        moving32 = sitk.Cast(moving, sitk.sitkFloat32)
        initial = sitk.CenteredTransformInitializer(
            fixed32, moving32, sitk.Euler3DTransform(),
            sitk.CenteredTransformInitializerFilter.GEOMETRY,
        )
        method.SetInitialTransform(initial)
        try:
            output = method.Execute(fixed32, moving32)
        except RuntimeError as error:  # pragma: no cover - defensive boundary
            raise MiRefusal(
                "optimisation-failed", f"SimpleITK registration raised: {error}"
            ) from error
        metric_value = float(method.GetMetricValue())
        iterations = int(method.GetOptimizerIteration())
        stop_condition = str(method.GetOptimizerStopConditionDescription())

    reason = outcome_violation(metric_value, stop_condition)
    if reason is not None:
        raise MiRefusal(
            reason,
            f"optimisation did not complete validly (stop={stop_condition!r}, "
            f"metric={metric_value!r}).",
        )
    matrix = _transform_matrix(output)
    require_rigid_transform(matrix)
    return MiEstimate(
        matrix=matrix,
        rotation=matrix[:3, :3].copy(),
        translation=matrix[:3, 3].copy(),
        metric_value=metric_value,
        iterations=iterations,
        stop_condition=stop_condition,
        effective_parameters=_effective_parameters(
            metric_value, iterations, stop_condition
        ),
    )
