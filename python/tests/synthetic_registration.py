"""Deterministic synthetic landmark fixtures for the Phase 2B.2 Procrustes suite.

No patient data and no randomness: every landmark, the ground-truth rigid
transform and the residual offsets are explicit constants. The exact
correspondence set is generated from the ground truth by a pure matrix multiply
(``P_target = M · P_source``), so its true correspondence is exact to double
precision; the noisy phantom adds explicit per-point offsets (no RNG).

Ground truth (patient LPS millimetres, column vectors): the rotation block is
:data:`GROUND_TRUTH_ROTATION` and the translation is
:data:`GROUND_TRUTH_TRANSLATION`. This module is a NuClear-owned synthetic test
artifact, never clinical evidence.
"""

from __future__ import annotations

Coordinate = tuple[float, float, float]

# Ground-truth rigid transform -------------------------------------------------

GROUND_TRUTH_ROTATION: tuple[Coordinate, Coordinate, Coordinate] = (
    (0.9320444714996667, -0.07232003043860279, 0.3550533992856096),
    (0.1261715813256593, 0.983331662820673, -0.13091819186084439),
    (-0.3396672418893077, 0.16681922578554872, 0.925633572584541),
)
GROUND_TRUTH_TRANSLATION: Coordinate = (12.5, -7.25, 4.0)

SOURCE_FRAME_OF_REFERENCE_UID = "1.2.826.0.1.3680043.10.2025.1"
TARGET_FRAME_OF_REFERENCE_UID = "1.2.826.0.1.3680043.10.2025.2"
TRANSFORM_ID = "xform-manual-alignment-1"
OUT_OF_DOMAIN_BEHAVIOR = "warn"

# Exact correspondences (fixture criterion 2B-T3) ------------------------------

EXACT_SOURCE_LANDMARKS: tuple[Coordinate, ...] = (
    (0.0, 0.0, 0.0),
    (50.0, 0.0, 0.0),
    (0.0, 40.0, 0.0),
    (0.0, 0.0, 30.0),
    (25.0, 20.0, 10.0),
    (-15.0, 12.0, 22.0),
)

EXACT_TARGET_LANDMARKS: tuple[Coordinate, ...] = (
    (12.5, -7.25, 4.0),
    (59.102223574983334, -0.9414209337170343, -12.983362094465384),
    (9.607198782455889, 32.08326651282692, 10.67276903142195),
    (23.151601978568287, -11.177545755825331, 31.76900717753623),
    (37.90524517157571, 14.261740870946497, 8.101039194323693),
    (5.462667346525176, -0.22279398697538966, 31.4607779346261),
)

# Noisy phantom (fixture criterion 2B-T1) --------------------------------------

#: Explicit per-point perturbation added to the exact targets (no RNG).
NOISY_OFFSETS_MM: tuple[Coordinate, ...] = (
    (0.10, -0.05, 0.08),
    (-0.12, 0.09, -0.04),
    (0.07, 0.11, -0.09),
    (-0.08, -0.10, 0.06),
    (0.05, -0.07, 0.12),
    (-0.03, 0.06, -0.11),
)

NOISY_TARGET_LANDMARKS: tuple[Coordinate, ...] = (
    (12.6, -7.3, 4.08),
    (58.98222357498334, -0.8514209337170343, -13.023362094465384),
    (9.67719878245589, 32.193266512826916, 10.58276903142195),
    (23.07160197856829, -11.277545755825331, 31.82900717753623),
    (37.955245171575704, 14.191740870946496, 8.221039194323692),
    (5.432667346525176, -0.16279398697538966, 31.3507779346261),
)

# Reflection-required (improper best-fit orthogonal map) -----------------------

REFLECTION_SOURCE_LANDMARKS: tuple[Coordinate, ...] = (
    (0.0, 0.0, 0.0),
    (40.0, 0.0, 0.0),
    (0.0, 30.0, 0.0),
    (0.0, 0.0, 20.0),
)

REFLECTION_TARGET_LANDMARKS: tuple[Coordinate, ...] = (
    (5.0, -3.0, 2.0),
    (-35.0, -3.0, 2.0),
    (5.0, 27.0, 2.0),
    (5.0, -3.0, 22.0),
)

# Structural degeneracy (R6) ---------------------------------------------------

COINCIDENT_SOURCE_LANDMARKS: tuple[Coordinate, ...] = (
    (5.0, 5.0, 5.0),
    (5.0, 5.0, 5.0),
    (5.0, 5.0, 5.0),
    (5.0, 5.0, 5.0),
)

COLLINEAR_SOURCE_LANDMARKS: tuple[Coordinate, ...] = (
    (0.0, 0.0, 0.0),
    (10.0, 0.0, 0.0),
    (20.0, 0.0, 0.0),
    (30.0, 0.0, 0.0),
)

#: Non-degenerate target reused for the two structural negatives.
NON_DEGENERATE_TARGET_LANDMARKS: tuple[Coordinate, ...] = (
    (12.5, -7.25, 4.0),
    (59.102223574983334, -0.9414209337170343, -12.983362094465384),
    (9.607198782455889, 32.08326651282692, 10.67276903142195),
    (23.151601978568287, -11.177545755825331, 31.76900717753623),
)

# Near-degenerate sensitivity (numeric bound [TO RATIFY], not asserted) ---------

NEAR_DEGENERATE_SOURCE_LANDMARKS: tuple[Coordinate, ...] = (
    (0.0, 0.0, 0.0),
    (10.0, 1e-7, 0.0),
    (20.0, 0.0, 2e-7),
    (30.0, 1e-7, 1e-7),
)

NEAR_DEGENERATE_TARGET_LANDMARKS: tuple[Coordinate, ...] = (
    (12.5, -7.25, 4.0),
    (21.820444707764665, -5.988284088410241, 0.6033275977888457),
    (31.140889501004015, -4.726568399670452, -2.7933446526594388),
    (40.46133417326334, -3.4648524749888736, -6.190017147433949),
)
