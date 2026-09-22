"""Shared fail-closed primitives for ``SpatialTransform`` evidence (NuClear 2B.4).

This module owns the pieces shared by the registration evidence validator and
the deterministic MI core: the typed :class:`EvidenceRefusal`, the single named
:data:`NUMERICAL_GUARD`, and the pure 4x4 matrix coherence checks. It is
**contract validation, not geometry derivation**: it never produces, converts or
repairs a transform, and it duplicates no scientific formula.

Scope and evidence authority:

    - ``docs/plans/PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md`` (2B.0 R8, 2B.4)
    - ``packages/shared-types/src/spatial-transform.ts``
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any, Literal

import numpy as np

#: Single named numerical guard for the orthonormality/determinant, identity and
#: homogeneous-last-row checks. A machine-epsilon-scale floating-point guard
#: around an exact proper rotation, **not** a clinical tolerance and **not** a
#: registration-accuracy threshold.
NUMERICAL_GUARD = 1e-9

_HOMOGENEOUS_ROW = (0.0, 0.0, 0.0, 1.0)

EvidenceRefusalReason = Literal[
    "malformed-evidence",
    "not-valid",
    "invalid-units",
    "malformed-matrix",
    "non-rigid-transform",
    "empty-frame-of-reference",
    "same-frame-of-reference",
    "incomplete-provenance",
    "invalid-error-margin",
    "incoherent-transform-type",
]


class EvidenceRefusal(Exception):
    """A typed fail-closed refusal of invalid ``SpatialTransform`` evidence.

    Attributes:
        reason: Machine-readable refusal reason (see
            :data:`EvidenceRefusalReason`).
        diagnostic: Non-empty human-readable explanation.
    """

    def __init__(self, reason: EvidenceRefusalReason, diagnostic: str) -> None:
        super().__init__(diagnostic)
        self.reason = reason
        self.diagnostic = diagnostic


def rotation_violation(
    rotation: Any, *, guard: float = NUMERICAL_GUARD
) -> Literal["non-rigid-transform"] | None:
    """Return ``"non-rigid-transform"`` unless ``rotation`` is proper orthonormal.

    Pure: a singular/scaled matrix (e.g. ``diag(1, 1, 0)``) returns the reason
    without touching any other evidence. ``guard`` is a floating-point guard,
    **not** a clinical tolerance.
    """
    array = np.asarray(rotation, dtype=np.float64)
    if array.shape != (3, 3) or not bool(np.all(np.isfinite(array))):
        return "non-rigid-transform"
    if abs(float(np.linalg.det(array)) - 1.0) > guard:
        return "non-rigid-transform"
    if float(np.max(np.abs(array.T @ array - np.eye(3)))) > guard:
        return "non-rigid-transform"
    return None


def _finite_sixteen(values: object) -> list[float]:
    """Return the 16 finite numbers of a row-major 4x4, else refuse."""
    if not isinstance(values, Sequence) or isinstance(values, (str, bytes)):
        raise EvidenceRefusal(
            "malformed-matrix", "matrix4x4 must be an array of 16 finite numbers."
        )
    if len(values) != 16:
        raise EvidenceRefusal(
            "malformed-matrix", "matrix4x4 must contain exactly 16 numbers."
        )
    components: list[float] = []
    for index, value in enumerate(values):
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            raise EvidenceRefusal(
                "malformed-matrix", f"matrix4x4[{index}] must be a finite number."
            )
        components.append(float(value))
    return components


def _homogeneous_matrix(values: object, *, guard: float) -> np.ndarray:
    """Return the finite row-major 4x4 with a homogeneous last row, else refuse.

    Raises:
        EvidenceRefusal: ``malformed-matrix`` for a non-finite/ill-sized matrix or
            a last row other than ``[0, 0, 0, 1]``.
    """
    matrix = np.asarray(_finite_sixteen(values), dtype=np.float64).reshape(4, 4)
    if not bool(np.allclose(matrix[3], _HOMOGENEOUS_ROW, rtol=0.0, atol=guard)):
        raise EvidenceRefusal(
            "malformed-matrix", "matrix4x4 homogeneous last row must be [0, 0, 0, 1]."
        )
    return matrix


def require_valid_matrix4x4(values: object, *, guard: float = NUMERICAL_GUARD) -> None:
    """Refuse unless ``values`` is a 16-number row-major proper rigid 4x4.

    Checks the homogeneous last row ``[0, 0, 0, 1]`` and the 3x3 rotation block
    (orthonormal with determinant ``+1``) within a single named numerical guard.
    This is the ``rigid`` coherence requirement.

    Raises:
        EvidenceRefusal: ``malformed-matrix`` for a non-finite/ill-sized matrix;
            ``non-rigid-transform`` for an improper/non-orthonormal block.
    """
    matrix = _homogeneous_matrix(values, guard=guard)
    reason = rotation_violation(matrix[:3, :3], guard=guard)
    if reason is not None:
        raise EvidenceRefusal(
            reason,
            "matrix4x4 3x3 block is not a proper orthonormal rotation (det must be +1).",
        )


def require_homogeneous_matrix4x4(
    values: object, *, guard: float = NUMERICAL_GUARD
) -> None:
    """Refuse unless ``values`` is a 16-number row-major 4x4 with last row [0,0,0,1].

    This is the ``affine`` coherence requirement: a legitimate affine scale or
    shear is accepted, so **no** orthonormality or determinant condition is
    imposed — only finiteness and the homogeneous last row.

    Raises:
        EvidenceRefusal: ``malformed-matrix`` for a non-finite/ill-sized matrix or
            a non-homogeneous last row.
    """
    _homogeneous_matrix(values, guard=guard)


def require_identity_matrix4x4(
    values: object, *, guard: float = NUMERICAL_GUARD
) -> None:
    """Refuse unless ``values`` equals the 4x4 identity within the numerical guard.

    This is the ``identity`` coherence requirement: the rotation block must be
    the identity and the translation must be zero.

    Raises:
        EvidenceRefusal: ``malformed-matrix`` for a non-finite/ill-sized matrix;
            ``incoherent-transform-type`` for a well-formed non-identity matrix.
    """
    matrix = np.asarray(_finite_sixteen(values), dtype=np.float64).reshape(4, 4)
    if not bool(np.allclose(matrix, np.eye(4), rtol=0.0, atol=guard)):
        raise EvidenceRefusal(
            "incoherent-transform-type",
            "matrix4x4 for transformType 'identity' must be the 4x4 identity.",
        )
