"""Deterministic synthetic MI phantom pair for the Phase 2B.3a suite.

A **synthetic test artifact, never clinical evidence**: a single deterministic
intensity volume plus a documented known rigid transform. There is **no RNG** —
the anatomy is an explicit sum of Gaussian blobs and the texture is an explicit
sum of sinusoids, so the pair is reproducible bit-for-bit. The moving image is
produced with SimpleITK by resampling the fixed image with the inverse of the
ground truth, so that the ground truth itself is the fixed(source) ->
moving(target) point map ``P_target = M_truth . P_source``.

Geometry: 48x48x48 voxels, 1.0 mm isotropic, identity direction, centred
origin. Ground truth: Euler rotation (2, -3, 4) degrees about the volume centre
plus a (3.0, -2.0, 1.5) mm translation.
"""

from __future__ import annotations

import math
from functools import lru_cache
from typing import Any

import numpy as np
import SimpleITK as _sitk
from numpy.typing import NDArray

sitk: Any = _sitk
"""See :mod:`dicom.registration_mi`: the SWIG bindings are untyped, so the
third-party boundary is aliased to ``Any`` to keep mypy strict elsewhere."""

FloatArray = NDArray[np.float64]

SIZE = 48
SPACING_MM = (1.0, 1.0, 1.0)
ORIGIN_MM = (-(SIZE - 1) / 2.0 * SPACING_MM[0],) * 3
DIRECTION = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)

CENTRE_MM = (0.0, 0.0, 0.0)
ROTATION_DEG = (2.0, -3.0, 4.0)
TRANSLATION_MM = (3.0, -2.0, 1.5)

#: Deterministic probe lattice (fractions of the index extent) used to measure
#: the recovered-vs-truth residual; 5^3 = 125 interior points.
PROBE_FRACTIONS = (0.1, 0.3, 0.5, 0.7, 0.9)

_BLOBS: tuple[tuple[float, float, float, float, float], ...] = (
    (-10.0, -8.0, 5.0, 1.0, 60.0),
    (8.0, 6.0, -4.0, 0.8, -40.0),
    (0.0, 0.0, 0.0, 1.2, 90.0),
    (-6.0, 12.0, 10.0, 0.7, -70.0),
    (12.0, -10.0, 8.0, 0.9, 50.0),
    (5.0, 3.0, -14.0, 0.6, -55.0),
)

_TEXTURE: tuple[tuple[float, float, float, float, float], ...] = (
    (0.7, 0.5, 0.3, 15.0, 0.0),
    (0.31, 1.13, 0.77, 12.0, 1.0),
    (1.7, 0.23, 0.91, 9.0, 2.0),
    (0.53, 0.59, 1.9, 7.0, 0.5),
)


def _intensity_array() -> FloatArray:
    """Return the fixed-image intensities as an explicit deterministic field."""
    index = np.arange(SIZE, dtype=np.float64)
    zz, yy, xx = np.meshgrid(index, index, index, indexing="ij")
    x = (xx - (SIZE - 1) / 2.0) * SPACING_MM[0]
    y = (yy - (SIZE - 1) / 2.0) * SPACING_MM[1]
    z = (zz - (SIZE - 1) / 2.0) * SPACING_MM[2]
    field = np.zeros((SIZE, SIZE, SIZE), dtype=np.float64)
    for cx, cy, cz, sigma, amplitude in _BLOBS:
        radius2 = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2
        field += amplitude * np.exp(-radius2 / (2.0 * sigma * sigma))
    field += 100.0 * np.exp(-(x**2 / 500.0 + y**2 / 400.0 + z**2 / 450.0))
    for px, py, pz, amplitude, phase in _TEXTURE:
        field += amplitude * np.sin(px * x + py * y + pz * z + phase)
    return field


@lru_cache(maxsize=1)
def fixed_image() -> Any:
    """Return the deterministic fixed (source) image."""
    image = sitk.GetImageFromArray(_intensity_array().astype(np.float32))
    image.SetSpacing(SPACING_MM)
    image.SetOrigin(ORIGIN_MM)
    image.SetDirection(DIRECTION)
    return image


def ground_truth_transform() -> Any:
    """Return the known fixed(source) -> moving(target) Euler transform."""
    transform = sitk.Euler3DTransform()
    transform.SetCenter(CENTRE_MM)
    transform.SetRotation(*[math.radians(value) for value in ROTATION_DEG])
    transform.SetTranslation(TRANSLATION_MM)
    return transform


def ground_truth_matrix() -> FloatArray:
    """Return the ground-truth row-major 4x4 for ``P_target = M . P_source``."""
    transform = ground_truth_transform()
    rotation = np.asarray(transform.GetMatrix(), dtype=np.float64).reshape(3, 3)
    offset = np.asarray(transform.TransformPoint((0.0, 0.0, 0.0)), dtype=np.float64)
    matrix = np.eye(4, dtype=np.float64)
    matrix[:3, :3] = rotation
    matrix[:3, 3] = offset
    return matrix


@lru_cache(maxsize=1)
def moving_image() -> Any:
    """Return the moving (target) image resampled by the inverse ground truth.

    Resampling the fixed image with ``M_truth^-1`` makes ``M_truth`` the
    fixed -> moving point map, matching the module's source/target labelling.
    """
    inverse = ground_truth_transform().GetInverse()
    return sitk.Resample(
        fixed_image(), inverse, sitk.sitkLinear, 0.0, sitk.sitkFloat32
    )


def probe_points_mm() -> tuple[tuple[float, float, float], ...]:
    """Return the deterministic physical probe lattice for residual measurement."""
    extent = (SIZE - 1) * SPACING_MM[0]
    return tuple(
        (
            ORIGIN_MM[0] + fx * extent,
            ORIGIN_MM[1] + fy * extent,
            ORIGIN_MM[2] + fz * extent,
        )
        for fx in PROBE_FRACTIONS
        for fy in PROBE_FRACTIONS
        for fz in PROBE_FRACTIONS
    )
