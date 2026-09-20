"""NuClear geometry conventions, named tolerances and deterministic math.

Conventions (copied from the Phase 1 ``AssetGeometry`` contract):
- ``dimensions = [columns, rows, slices]``.
- ``spacing = [colSpacing, rowSpacing, sliceSpacing]`` mm; DICOM PixelSpacing is
  ``[rowSpacing, colSpacing]`` so ``colSpacing = PixelSpacing[1]`` and
  ``rowSpacing = PixelSpacing[0]``.
- ``origin`` is the ``ImagePositionPatient`` of normalized slice 0, i.e. the
  centre of voxel ``[0,0,0]``.
- ``direction`` is ``ImageOrientationPatient = [rx,ry,rz,cx,cy,cz]`` and
  ``sliceNormal = row x column``.
- Slice ordering is normalized so increasing index follows ``+sliceNormal``.
- ``bounds`` is the AABB over the eight outer half-voxel corners using the
  Phase 1 ``calculatePhysicalBounds`` formula verbatim.

``geometricDigest`` is a NuClear v1 convention: ``"sha256:" + sha256(json)``
over ``{frameOfReferenceUID, dimensions, spacing, origin, direction, bounds}``
using sorted keys and ``(",", ":")`` separators, with every float rendered as a
fixed six-decimal string.

The named tolerances are floating-point comparison tolerances for deterministic
synthetic fixtures. They are **not clinical acceptance thresholds**, and the
real-world tolerance policy is explicitly deferred.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Sequence

DIRECTION_COSINE_EPSILON = 1e-4  # aligns with TS isDirectionCosinesValid
BOUNDS_EPSILON = 1e-5  # aligns with TS isAssetGeometry
SPACING_EPSILON_MM = 1e-4  # regular slice/pixel spacing comparison
COLLINEARITY_EPSILON_MM = 1e-4  # slice centres must lie on the slice-normal axis
COPLANARITY_COSINE_EPSILON = 1e-6  # 1 - |dot(n_left, n_right)| tolerance
# Verifying a *regular* grid requires at least two consecutive spacing intervals,
# hence >= 3 slice instances. Single- and two-slice stacks are structurally
# unverifiable and fail closed as ``insufficient-slices``. Real-world handling of
# single/double-slice acquisitions (e.g. localizers or scouts) is explicitly
# deferred, not silently accepted. This is a structural requirement of regular-grid
# verification, not a clinical acceptance threshold.
MIN_SLICES = 3
DIGEST_FLOAT_DECIMALS = 6


def cross(left: Sequence[float], right: Sequence[float]) -> list[float]:
    """Return the right-handed cross product ``left x right``."""
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ]


def dot(left: Sequence[float], right: Sequence[float]) -> float:
    """Return the dot product of two equal-length vectors."""
    return sum(a * b for a, b in zip(left, right))


def norm(vector: Sequence[float]) -> float:
    """Return the Euclidean norm of a vector."""
    return math.sqrt(sum(component * component for component in vector))


def is_direction_cosines_valid(
    direction: Sequence[float], epsilon: float = DIRECTION_COSINE_EPSILON
) -> bool:
    """Mirror the Phase 1 ``isDirectionCosinesValid`` orthonormality check."""
    if len(direction) != 6 or not all(math.isfinite(value) for value in direction):
        return False
    rx, ry, rz, cx, cy, cz = direction
    if abs((rx * rx + ry * ry + rz * rz) - 1.0) > epsilon:
        return False
    if abs((cx * cx + cy * cy + cz * cz) - 1.0) > epsilon:
        return False
    return abs(rx * cx + ry * cy + rz * cz) <= epsilon


def calculate_bounds(
    dimensions: Sequence[float],
    spacing: Sequence[float],
    origin: Sequence[float],
    direction: Sequence[float],
) -> dict[str, list[float]]:
    """Phase 1 ``calculatePhysicalBounds`` AABB over the eight outer corners."""
    rx, ry, rz, cx, cy, cz = direction
    normal = [ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx]
    minimum = [math.inf, math.inf, math.inf]
    maximum = [-math.inf, -math.inf, -math.inf]
    for i in (-0.5, dimensions[0] - 0.5):
        for j in (-0.5, dimensions[1] - 0.5):
            for k in (-0.5, dimensions[2] - 0.5):
                point = [
                    origin[0] + rx * spacing[0] * i + cx * spacing[1] * j + normal[0] * spacing[2] * k,
                    origin[1] + ry * spacing[0] * i + cy * spacing[1] * j + normal[1] * spacing[2] * k,
                    origin[2] + rz * spacing[0] * i + cz * spacing[1] * j + normal[2] * spacing[2] * k,
                ]
                for axis in range(3):
                    minimum[axis] = min(minimum[axis], point[axis])
                    maximum[axis] = max(maximum[axis], point[axis])
    return {"min": minimum, "max": maximum}


def geometric_digest(
    frame_of_reference_uid: str,
    dimensions: Sequence[float],
    spacing: Sequence[float],
    origin: Sequence[float],
    direction: Sequence[float],
    bounds: dict[str, list[float]],
) -> str:
    """Return ``sha256:`` plus the hash of the canonical six-decimal JSON."""
    fixed = f"{{:.{DIGEST_FLOAT_DECIMALS}f}}".format
    payload = {
        "bounds": {
            "max": [fixed(value) for value in bounds["max"]],
            "min": [fixed(value) for value in bounds["min"]],
        },
        "dimensions": [int(value) for value in dimensions],
        "direction": [fixed(value) for value in direction],
        "frameOfReferenceUID": frame_of_reference_uid,
        "origin": [fixed(value) for value in origin],
        "spacing": [fixed(value) for value in spacing],
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()
