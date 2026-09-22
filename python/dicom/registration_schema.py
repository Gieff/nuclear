"""Request schema for ``nuclear.registration`` (NuClear Phase 2B.1).

This module owns *only* the fail-closed request schema of the registration
operation: the mode-discriminated validation, the validated
:class:`RegistrationRequest` value object and the ``-32602`` violation builder.
**No registration algorithm lives here and no transform is fabricated.** The
operation handler is :mod:`dicom.registration_operations`.

``transformId`` and ``outOfDomainBehavior`` stay caller-declared: the schema
validates and preserves them verbatim so the TypeScript bridge can build a
complete ``SpatialTransform`` without inventing an id or a rendering policy.
Landmark degeneracy (collinear/coincident points) is deferred to 2B.2/2B.4.
Extra unknown keys are ignored, matching the geometry and quantitation handlers.

Scope and evidence authority:

    - ``docs/plans/PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md`` (slice 2B.1)
    - ``docs/decisions/ADR-002-scientific-worker-stdio-json-rpc.md``
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from worker.protocol import ERROR_MESSAGES, INVALID_PARAMS, REGISTRATION_METHOD, ProtocolError

from .locators import SourceLocator, parse_locator

REGISTRATION_MODES: tuple[str, ...] = ("rigid", "landmarks")
OUT_OF_DOMAIN_BEHAVIORS: tuple[str, ...] = ("clamp", "hide", "warn")
MIN_LANDMARK_PAIRS = 3

Coordinate = tuple[float, float, float]


@dataclass(frozen=True)
class LandmarkPair:
    """One validated source -> target landmark correspondence (LPS mm)."""

    source: Coordinate
    target: Coordinate


@dataclass(frozen=True)
class RegistrationRequest:
    """A schema-valid ``nuclear.registration`` request.

    Mode-specific fields are ``None``/empty for the other mode; the worker never
    fills them with a plausible value.
    """

    mode: str
    transform_id: str
    out_of_domain_behavior: str
    fixed: SourceLocator | None = None
    fixed_series_instance_uid: str | None = None
    moving: SourceLocator | None = None
    moving_series_instance_uid: str | None = None
    source_frame_of_reference_uid: str | None = None
    target_frame_of_reference_uid: str | None = None
    landmarks: tuple[LandmarkPair, ...] = ()


def _invalid(violations: list[str]) -> ProtocolError:
    """Build the ``-32602`` schema violation carrying every collected message."""
    return ProtocolError(
        INVALID_PARAMS,
        ERROR_MESSAGES[INVALID_PARAMS],
        {
            "diagnostic": f"Invalid params for {REGISTRATION_METHOD}.",
            "violations": violations,
        },
    )


def _non_empty_string(value: Any, name: str, violations: list[str]) -> str | None:
    """Return ``value`` when it is a non-empty string, else record a violation."""
    if not isinstance(value, str) or not value:
        violations.append(f"params.{name} must be a non-empty string.")
        return None
    return value


def _finite_coordinate(value: Any, name: str, violations: list[str]) -> Coordinate | None:
    """Validate an ``[x, y, z]`` triple of finite numbers (reject bool/NaN/Inf)."""
    if not isinstance(value, list):
        violations.append(f"{name} must be an array of 3 finite numbers.")
        return None
    if len(value) != 3:
        violations.append(f"{name} must have length 3.")
        return None
    components: list[float] = []
    for index, component in enumerate(value):
        if (
            isinstance(component, bool)
            or not isinstance(component, (int, float))
            or not math.isfinite(component)
        ):
            violations.append(f"{name}[{index}] must be a finite number.")
            return None
        components.append(float(component))
    return (components[0], components[1], components[2])


def _parse_side(
    params: Mapping[str, Any], key: str, violations: list[str]
) -> tuple[Mapping[str, Any] | None, str | None]:
    """Validate one ``fixed``/``moving`` asset reference (locator + series UID)."""
    side = params.get(key)
    if not isinstance(side, Mapping):
        violations.append(f"params.{key} must be an object.")
        return None, None
    uid = _non_empty_string(side.get("seriesInstanceUID"), f"{key}.seriesInstanceUID", violations)
    return side, uid


def _parse_landmarks(value: Any, violations: list[str]) -> tuple[LandmarkPair, ...]:
    """Validate the landmark array: length >= 3 and finite 3-D correspondences."""
    if not isinstance(value, list):
        violations.append("params.landmarks must be an array of landmark pairs.")
        return ()
    if len(value) < MIN_LANDMARK_PAIRS:
        violations.append(
            f"params.landmarks must contain at least {MIN_LANDMARK_PAIRS} pairs."
        )
        return ()
    pairs: list[LandmarkPair] = []
    for index, entry in enumerate(value):
        where = f"params.landmarks[{index}]"
        if not isinstance(entry, Mapping):
            violations.append(f"{where} must be an object with 'source' and 'target'.")
            continue
        source = _finite_coordinate(entry.get("source"), f"{where}.source", violations)
        target = _finite_coordinate(entry.get("target"), f"{where}.target", violations)
        if source is not None and target is not None:
            pairs.append(LandmarkPair(source=source, target=target))
    return tuple(pairs)


def parse_registration_request(params: Mapping[str, Any]) -> RegistrationRequest:
    """Validate a ``nuclear.registration`` request, collecting all violations.

    Args:
        params: Request parameters mapping (``mode`` discriminated).

    Returns:
        The validated :class:`RegistrationRequest`.

    Raises:
        ProtocolError: ``INVALID_PARAMS`` (-32602) with a non-empty
            ``violations`` list. Locator shape violations are raised by
            :func:`dicom.locators.parse_locator`, also as ``INVALID_PARAMS``.
    """
    violations: list[str] = []

    mode = params.get("mode")
    if not isinstance(mode, str) or not mode:
        violations.append("params.mode must be a non-empty string.")
        valid_mode: str | None = None
    elif mode not in REGISTRATION_MODES:
        allowed = ", ".join(repr(candidate) for candidate in REGISTRATION_MODES)
        violations.append(f"params.mode must be one of {allowed}.")
        valid_mode = None
    else:
        valid_mode = mode

    transform_id = _non_empty_string(params.get("transformId"), "transformId", violations)

    behavior = params.get("outOfDomainBehavior")
    if not isinstance(behavior, str) or behavior not in OUT_OF_DOMAIN_BEHAVIORS:
        allowed = ", ".join(repr(candidate) for candidate in OUT_OF_DOMAIN_BEHAVIORS)
        violations.append(f"params.outOfDomainBehavior must be one of {allowed}.")
        behavior = None

    fixed_side: Mapping[str, Any] | None = None
    moving_side: Mapping[str, Any] | None = None
    fixed_uid: str | None = None
    moving_uid: str | None = None
    source_for: str | None = None
    target_for: str | None = None
    landmarks: tuple[LandmarkPair, ...] = ()

    if valid_mode == "rigid":
        fixed_side, fixed_uid = _parse_side(params, "fixed", violations)
        moving_side, moving_uid = _parse_side(params, "moving", violations)
    elif valid_mode == "landmarks":
        source_for = _non_empty_string(
            params.get("sourceFrameOfReferenceUID"),
            "sourceFrameOfReferenceUID",
            violations,
        )
        target_for = _non_empty_string(
            params.get("targetFrameOfReferenceUID"),
            "targetFrameOfReferenceUID",
            violations,
        )
        landmarks = _parse_landmarks(params.get("landmarks"), violations)

    if violations:
        raise _invalid(violations)

    fixed: SourceLocator | None = None
    moving: SourceLocator | None = None
    if valid_mode == "rigid":
        assert fixed_side is not None and moving_side is not None
        fixed = parse_locator(fixed_side, method=REGISTRATION_METHOD)
        moving = parse_locator(moving_side, method=REGISTRATION_METHOD)

    assert valid_mode is not None
    assert transform_id is not None
    assert behavior is not None
    return RegistrationRequest(
        mode=valid_mode,
        transform_id=transform_id,
        out_of_domain_behavior=behavior,
        fixed=fixed,
        fixed_series_instance_uid=fixed_uid,
        moving=moving,
        moving_series_instance_uid=moving_uid,
        source_frame_of_reference_uid=source_for,
        target_frame_of_reference_uid=target_for,
        landmarks=landmarks,
    )
