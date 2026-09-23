"""Deterministic Mutual-Information rigid registration core (NuClear 2B.3a).

Pure scientific core operating on ``sitk.Image`` objects: **no** DICOM reading,
no voxel/volume transport, no file I/O and no IPC. The worker ``mode: 'rigid'``
operation (2B.3b) wires this core to real decoded volumes in
:mod:`dicom.registration_operations`; this module stays transport-free.

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
from .registration_validation import (
    NUMERICAL_GUARD,
    EvidenceRefusal,
    require_valid_matrix4x4,
    rotation_violation,
)

sitk: Any = _sitk
"""SimpleITK's SWIG bindings ship no annotations, so the module is aliased to
``Any`` to keep strict mypy useful for NuClear's fully annotated logic here."""

FloatArray = NDArray[np.float64]
RefusalReason = Literal[
    "invalid-evidence", "optimisation-failed", "non-rigid-transform", "invalid-metric"
]

RIGIDITY_NUMERICAL_GUARD = NUMERICAL_GUARD  # single shared numerical guard

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

    Pure; delegates to the shared evidence validator's single numerical guard.
    """
    return rotation_violation(rotation, guard=guard)

def require_rigid_transform(
    matrix: FloatArray, *, guard: float = RIGIDITY_NUMERICAL_GUARD
) -> None:
    """Raise :class:`MiRefusal` unless ``matrix`` is a finite proper rigid 4x4.

    Delegates to the shared evidence validator; no second guard is introduced.
    """
    flat = np.asarray(matrix, dtype=np.float64).reshape(-1).tolist()
    try:
        require_valid_matrix4x4(flat, guard=guard)
    except EvidenceRefusal as refusal:
        raise MiRefusal("non-rigid-transform", refusal.diagnostic) from refusal

def outcome_violation(
    metric_value: float, stop_condition: str, *, iterations: int = 0
) -> RefusalReason | None:
    """Return a refusal reason for a non-finite metric or a failed stop state.
    Zero iterations is **not** a failure (the geometry-based initialiser may
    already be converged); the caller additionally requires a valid rigid
    transform. No numeric quality/iteration threshold is applied: any such
    threshold is **unratified** and deliberately absent.
    """
    if not math.isfinite(metric_value):
        return "invalid-metric"
    if iterations < 0 or not stop_condition.strip() or any(
        marker in stop_condition.lower() for marker in _OPTIMIZER_FAILURE_MARKERS
    ):
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

    reason = outcome_violation(metric_value, stop_condition, iterations=iterations)
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
