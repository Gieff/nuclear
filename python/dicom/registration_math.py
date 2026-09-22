"""Deterministic orthogonal Procrustes (Kabsch) for manual landmark registration.

NuClear Phase 2B.2. Pure mathematics: no I/O, no DICOM types, no clock. Given
``n >= 3`` ordered source -> target correspondences in patient LPS millimetres,
it recovers the proper rigid transform ``P_target = M · P_source`` that minimises
the sum of squared point residuals, plus the residual evidence (RMS and maximum
point error).

Conventions (ratified, plan §2B.0):

    - points are column vectors in patient LPS millimetres;
    - the homogeneous ``matrix4x4`` is row-major; the last row is ``[0, 0, 0, 1]``;
    - ``validity.errorMarginMm`` is the **RMS** point error; the maximum point
      error is reported alongside it;
    - a reflection (improper best-fit orthogonal map, ``det(V Uᵀ) < 0``) is
      refused fail-closed, never silently mirrored.

Degeneracy handling (R6): the *structural* refusals are ratified and enforced
here (fewer than three correspondences, coincident points, collinear points —
a centred rank strictly below 2). The numeric near-degeneracy *condition-number*
bound is **not** ratified and is deliberately not wired into any decision; see
:data:`NEAR_DEGENERACY_CONDITION_CANDIDATE`.

Scope and evidence authority:

    - ``docs/plans/PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md`` (slice 2B.2)
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]
Coordinate = tuple[float, float, float]

MIN_LANDMARK_PAIRS = 3

#: Candidate numeric near-degeneracy bound (centred-matrix condition number)
#: carried over from the plan. **[TO RATIFY] — candidate, not ratified.** The
#: phase owner ratified the structural refusals but not any numeric threshold:
#: its matrix, centring/normalisation, singular-value ratio, near-zero handling
#: and scale dependence are still open. This constant is therefore **not** used
#: in any refusal decision; it is kept as a single named anchor for the pending
#: ratification and for the degeneracy sensitivity fixture.
NEAR_DEGENERACY_CONDITION_CANDIDATE = 1e6

RefusalReason = Literal["degenerate-landmarks", "reflection-required"]


class ProcrustesRefusal(Exception):
    """A structural refusal: no proper, non-degenerate rigid fit exists.

    Attributes:
        reason: Machine-readable refusal reason (``degenerate-landmarks`` or
            ``reflection-required``).
        diagnostic: Non-empty human-readable explanation.
    """

    def __init__(self, reason: RefusalReason, diagnostic: str) -> None:
        super().__init__(diagnostic)
        self.reason = reason
        self.diagnostic = diagnostic


@dataclass(frozen=True)
class RigidEstimate:
    """A recovered proper rigid transform and its residual evidence."""

    rotation: FloatArray
    """3x3 orthonormal rotation block with determinant ``+1``."""

    translation: FloatArray
    """Translation vector, shape ``(3,)``."""

    rms_point_error_mm: float
    """Root-mean-square correspondence error in millimetres."""

    max_point_error_mm: float
    """Maximum correspondence error in millimetres."""

    singular_value_ratio: float
    """Diagnostic centered-matrix ratio (reported only, never a threshold gate)."""


def _points(values: Sequence[Coordinate], name: str) -> FloatArray:
    """Return ``values`` as a finite ``(n, 3)`` float64 array, else raise."""
    array = np.asarray(values, dtype=np.float64)
    if array.ndim != 2 or array.shape[1] != 3:
        raise ValueError(f"{name} landmarks must be an (n, 3) array of numbers.")
    if not bool(np.all(np.isfinite(array))):
        raise ValueError(f"{name} landmarks must be finite.")
    return array


def _centred_ratio(centred: FloatArray) -> float:
    """Return ``s0 / s1`` for a centred landmark matrix (``inf`` when rank < 2)."""
    singular = np.linalg.svd(centred, compute_uv=False)
    second = float(singular[1])
    if second <= 0.0:
        return float("inf")
    return float(singular[0]) / second


def _require_non_degenerate(centred: FloatArray, name: str) -> None:
    """Refuse a landmark set whose centred matrix has rank < 2 (R6 structural)."""
    singular = np.linalg.svd(centred, compute_uv=False)
    if float(singular[1]) <= 0.0:
        raise ProcrustesRefusal(
            "degenerate-landmarks",
            f"{name} landmark set is coincident or collinear (centred rank < 2).",
        )


def homogenise(rotation: FloatArray, translation: FloatArray) -> FloatArray:
    """Return the row-major homogeneous 4x4 for ``P_target = M · P_source``."""
    matrix = np.eye(4, dtype=np.float64)
    matrix[:3, :3] = rotation
    matrix[:3, 3] = translation
    return matrix


def estimate_rigid_transform(
    source: Sequence[Coordinate], target: Sequence[Coordinate]
) -> RigidEstimate:
    """Recover the optimal proper rigid transform between ordered correspondences.

    Args:
        source: ``n >= 3`` source points (patient LPS mm), ordered.
        target: ``n`` target points, in the same order as ``source``.

    Returns:
        A :class:`RigidEstimate` with the rotation, translation and residual
        evidence; ``rotation`` is proper (``det == +1``).

    Raises:
        ProcrustesRefusal: For a structurally degenerate set
            (``degenerate-landmarks``) or an improper best-fit orthogonal map
            (``reflection-required``).
        ValueError: For malformed shapes, non-finite values, mismatched sizes or
            fewer than :data:`MIN_LANDMARK_PAIRS` correspondences.
    """
    source_array = _points(source, "source")
    target_array = _points(target, "target")
    if source_array.shape != target_array.shape:
        raise ValueError("source and target landmark sets must have the same size.")
    if source_array.shape[0] < MIN_LANDMARK_PAIRS:
        raise ValueError(f"at least {MIN_LANDMARK_PAIRS} correspondences are required.")

    source_centroid = source_array.mean(axis=0)
    target_centroid = target_array.mean(axis=0)
    source_centred = source_array - source_centroid
    target_centred = target_array - target_centroid

    _require_non_degenerate(source_centred, "source")
    _require_non_degenerate(target_centred, "target")
    ratio = max(_centred_ratio(source_centred), _centred_ratio(target_centred))

    covariance = source_centred.T @ target_centred
    left, _, right_t = np.linalg.svd(covariance)
    right = right_t.T
    orientation = float(np.linalg.det(right @ left.T))
    if orientation < 0.0:
        raise ProcrustesRefusal(
            "reflection-required",
            "the best-fit orthogonal map is improper (det(V U^T) < 0); a proper "
            "rigid transform cannot reproduce the correspondences.",
        )

    scale = np.array([1.0, 1.0, orientation], dtype=np.float64)
    rotation = right @ np.diag(scale) @ left.T
    translation = target_centroid - rotation @ source_centroid

    residual = (rotation @ source_array.T).T + translation - target_array
    errors = np.linalg.norm(residual, axis=1)
    return RigidEstimate(
        rotation=rotation,
        translation=translation,
        rms_point_error_mm=float(np.sqrt(np.mean(errors**2))),
        max_point_error_mm=float(np.max(errors)),
        singular_value_ratio=ratio,
    )
