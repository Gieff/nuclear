"""Frame-of-reference and orientation compatibility evidence (NuClear P2.3).

``compatible`` is exactly ``frameOfReference.equal AND orientation.coplanar``.
Spacing, origin and extent are reported as evidence only: PET and CT
legitimately have different grids, so a spacing difference must never set
``compatible`` to ``False``.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

from .geometry_math import COPLANARITY_COSINE_EPSILON, dot, norm

INCOMPATIBILITY_FRAME_OF_REFERENCE = "frame-of-reference-mismatch"
INCOMPATIBILITY_ORIENTATION = "orientation-not-coplanar"


def _angular_delta_deg(left_normal: Sequence[float], right_normal: Sequence[float]) -> float:
    denominator = norm(left_normal) * norm(right_normal)
    cosine = abs(dot(left_normal, right_normal)) / denominator if denominator else 0.0
    return math.degrees(math.acos(min(1.0, max(0.0, cosine))))


def _bounds_overlap(left: dict[str, list[float]], right: dict[str, list[float]]) -> bool:
    return all(
        left["min"][axis] <= right["max"][axis] and right["min"][axis] <= left["max"][axis]
        for axis in range(3)
    )


def _merge_diagnostics(*groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    combined = [diagnostic for group in groups for diagnostic in group]
    combined.sort(key=lambda diagnostic: (diagnostic["code"], diagnostic["file"] or ""))
    return combined


def build_compatibility(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    """Build compatibility evidence from two ``computed`` geometry results.

    Args:
        left: A computed ``nuclear.dicom.geometry`` result.
        right: A computed ``nuclear.dicom.geometry`` result.

    Returns:
        The compatibility payload without ``workerMetadata``.
    """
    left_geometry = left["geometry"]
    right_geometry = right["geometry"]
    left_normal = left_geometry["sliceNormal"]
    right_normal = right_geometry["sliceNormal"]
    frame_equal = left_geometry["frameOfReferenceUID"] == right_geometry["frameOfReferenceUID"]
    cosine_gap = abs(1.0 - abs(dot(left_normal, right_normal)))
    coplanar = cosine_gap <= COPLANARITY_COSINE_EPSILON
    incompatibilities: list[str] = []
    if not frame_equal:
        incompatibilities.append(INCOMPATIBILITY_FRAME_OF_REFERENCE)
    if not coplanar:
        incompatibilities.append(INCOMPATIBILITY_ORIENTATION)
    return {
        "status": "computed",
        "compatible": frame_equal and coplanar,
        "frameOfReference": {
            "left": left_geometry["frameOfReferenceUID"],
            "right": right_geometry["frameOfReferenceUID"],
            "equal": frame_equal,
        },
        "orientation": {
            "maxAngularDeltaDeg": _angular_delta_deg(left_normal, right_normal),
            "coplanar": coplanar,
        },
        "spacingMm": {"left": left_geometry["spacing"], "right": right_geometry["spacing"]},
        "originLpsMm": {"left": left_geometry["origin"], "right": right_geometry["origin"]},
        "extentOverlap": {
            "overlaps": _bounds_overlap(left_geometry["bounds"], right_geometry["bounds"]),
            "leftBounds": left_geometry["bounds"],
            "rightBounds": right_geometry["bounds"],
        },
        "incompatibilities": incompatibilities,
        "diagnostics": _merge_diagnostics(left["diagnostics"], right["diagnostics"]),
    }
