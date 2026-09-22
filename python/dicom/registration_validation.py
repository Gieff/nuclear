"""Pure fail-closed validator for ``SpatialTransform`` evidence (NuClear 2B.4).

This module owns the single contract validator for registration evidence: it
checks a ``SpatialTransform``-shaped mapping against the accepted NuClear
contract before any consumer (the worker handler, the TypeScript bridge or,
later, ``view-engine``) may trust it. It is **contract validation, not geometry
derivation**: it never produces, converts or repairs a transform, and it never
duplicates a scientific formula. The shared refusal type and the pure 4x4 matrix
coherence primitives live in :mod:`dicom.registration_contract`.

Fail-closed: every violation raises :class:`EvidenceRefusal` with a machine
readable ``reason`` and a non-empty ``diagnostic``. A refusal never carries a
transform.

**[R8 ``transformType`` <-> matrix coherence].** The ``matrix4x4`` is checked
against the declared ``transformType``: ``identity`` requires the 4x4 identity;
``rigid`` requires a proper orthonormal ``det = +1`` block; ``affine`` requires
only a finite homogeneous last row, so a legitimate scale/shear is accepted.

**[POLICY-NEUTRAL ``errorMarginMm``].** The admission policy for a transform
that carries **no** ``errorMarginMm`` (ADR-012 OD-6) is owned by the architect
and is still open. This validator therefore validates ``errorMarginMm`` **only
when the key is present** (finite and ``>= 0``); an absent residual is neither
accepted nor rejected here.

**[NUMERICAL GUARD, NOT A CLINICAL TOLERANCE].** :data:`NUMERICAL_GUARD` is a
floating-point guard around an exact proper rotation and a homogeneous last
row. It is **not** a clinical accuracy threshold and must never be read as one.

Scope and evidence authority:

    - ``docs/plans/PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md`` (2B.0 R8, 2B.4)
    - ``packages/shared-types/src/spatial-transform.ts``
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from typing import Any

from .registration_contract import (
    NUMERICAL_GUARD,
    EvidenceRefusal,
    EvidenceRefusalReason,
    require_homogeneous_matrix4x4,
    require_identity_matrix4x4,
    require_valid_matrix4x4,
    rotation_violation,
)

__all__ = [
    "EvidenceRefusal",
    "EvidenceRefusalReason",
    "NUMERICAL_GUARD",
    "require_homogeneous_matrix4x4",
    "require_identity_matrix4x4",
    "require_valid_matrix4x4",
    "rotation_violation",
    "validate_spatial_transform_evidence",
]

#: Shared-types ``TransformMethod`` vocabulary (``spatial-transform.ts``).
TRANSFORM_METHODS = (
    "dicom-registration",
    "rigid-coregistration",
    "manual-alignment",
    "identity",
)

#: Shared-types ``TransformType`` vocabulary (``spatial-transform.ts``).
TRANSFORM_TYPES = ("identity", "rigid", "affine")

_ISO8601 = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)


def _mapping(value: object, name: str) -> Mapping[str, Any]:
    """Return ``value`` as a mapping, else refuse (never a plausible default)."""
    if not isinstance(value, Mapping):
        raise EvidenceRefusal("malformed-evidence", f"{name} must be an object.")
    return value


def _is_non_empty_string(value: object) -> bool:
    """Return whether ``value`` is a non-empty ``str``."""
    return isinstance(value, str) and bool(value)


def _validate_matrix_coherence(record: Mapping[str, Any], *, guard: float) -> None:
    """Enforce the ratified R8 ``transformType`` <-> matrix coherence, fail-closed.

    - ``identity`` -> the whole 4x4 is the identity within one numerical guard;
    - ``rigid`` -> the proper-orthonormal ``det = +1`` rigid matrix;
    - ``affine`` -> a finite matrix with a homogeneous last row (scale/shear is
      legitimate and must not be rejected);
    - any other value -> ``incoherent-transform-type``.

    Raises:
        EvidenceRefusal: ``incoherent-transform-type`` for an unknown
            ``transformType`` (or a non-identity ``identity`` matrix); otherwise
            the reason raised by the per-type matrix check.
    """
    transform_type = record.get("transformType")
    if not isinstance(transform_type, str) or transform_type not in TRANSFORM_TYPES:
        raise EvidenceRefusal(
            "incoherent-transform-type",
            f"transformType must be one of {TRANSFORM_TYPES!r}.",
        )
    matrix = record.get("matrix4x4")
    if transform_type == "identity":
        require_identity_matrix4x4(matrix, guard=guard)
    elif transform_type == "rigid":
        require_valid_matrix4x4(matrix, guard=guard)
    else:  # "affine"
        require_homogeneous_matrix4x4(matrix, guard=guard)


def _validate_frames(record: Mapping[str, Any]) -> None:
    """Refuse empty or identical source/target Frame of Reference UIDs."""
    source = record.get("sourceFrameOfReferenceUID")
    target = record.get("targetFrameOfReferenceUID")
    if not _is_non_empty_string(source) or not _is_non_empty_string(target):
        raise EvidenceRefusal(
            "empty-frame-of-reference",
            "source and target FrameOfReferenceUID must be non-empty strings.",
        )
    if source == target:
        raise EvidenceRefusal(
            "same-frame-of-reference",
            "source and target FrameOfReferenceUID must be distinct.",
        )


def _validate_provenance(record: Mapping[str, Any]) -> None:
    """Refuse incomplete provenance (method vocabulary, version, timestamp)."""
    provenance = _mapping(record.get("provenance"), "transform.provenance")
    method = provenance.get("method")
    if not isinstance(method, str) or method not in TRANSFORM_METHODS:
        raise EvidenceRefusal(
            "incomplete-provenance",
            f"provenance.method must be one of {TRANSFORM_METHODS!r}.",
        )
    if not _is_non_empty_string(provenance.get("workerVersion")):
        raise EvidenceRefusal(
            "incomplete-provenance",
            "provenance.workerVersion must be a non-empty string.",
        )
    timestamp = provenance.get("timestamp")
    if not isinstance(timestamp, str) or _ISO8601.match(timestamp) is None:
        raise EvidenceRefusal(
            "incomplete-provenance",
            "provenance.timestamp must be a non-empty ISO-8601 instant.",
        )


def _validate_error_margin(validity: Mapping[str, Any]) -> None:
    """Validate ``errorMarginMm`` **only when present** (policy-neutral)."""
    if "errorMarginMm" not in validity:
        return
    value = validity["errorMarginMm"]
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or value < 0
    ):
        raise EvidenceRefusal(
            "invalid-error-margin",
            "validity.errorMarginMm, when present, must be a finite number >= 0.",
        )


def validate_spatial_transform_evidence(
    transform: object, *, guard: float = NUMERICAL_GUARD
) -> None:
    """Validate a ``SpatialTransform``-shaped mapping, refusing fail-closed.

    Checks, in order: ``validity.isValid is True``; ``units == 'mm'``; non-empty
    and distinct source/target Frame of Reference UIDs; complete provenance; a
    present ``errorMarginMm`` finite and ``>= 0``; and a ``matrix4x4`` coherent
    with ``transformType`` (``identity`` -> the identity; ``rigid`` -> proper
    orthonormal; ``affine`` -> finite with a homogeneous last row). An **absent**
    ``errorMarginMm`` is accepted here: its admission policy is an open architect
    decision (ADR-012 OD-6).

    Args:
        transform: The ``SpatialTransform``-shaped mapping (the ``transform``
            object of the worker success evidence).
        guard: Numerical guard for the matrix checks.

    Raises:
        EvidenceRefusal: With a specific reason; never carries a transform.
    """
    record = _mapping(transform, "transform")
    validity = _mapping(record.get("validity"), "transform.validity")
    if validity.get("isValid") is not True:
        raise EvidenceRefusal("not-valid", "validity.isValid must be exactly true.")
    if record.get("units") != "mm":
        raise EvidenceRefusal("invalid-units", "units must be exactly 'mm'.")
    _validate_frames(record)
    _validate_provenance(record)
    _validate_error_margin(validity)
    _validate_matrix_coherence(record, guard=guard)
