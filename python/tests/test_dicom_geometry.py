"""P2.3 evidence for ``nuclear.dicom.geometry`` and ``nuclear.dicom.compatibility``.

Synthetic cases are generated into temporary directories and inspected through
the real ``build_dispatcher()`` composition point with a frozen clock. The five
ratified cases are compared for exact equality against the committed
``tests/fixtures/dicom/geometry/*.expected.json`` files with ``workerMetadata``
excluded. All tolerance assertions reference the named constants from
:mod:`dicom.geometry_math`; the only additional named tolerance here is the
Phase 1 cross-validation epsilon.
"""

from __future__ import annotations

import json
import math
from collections.abc import Callable, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

import pytest
import synthetic_geometry as sg
import synthetic_geometry_invalid as invalid

from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import (
    DICOM_COMPATIBILITY_METHOD,
    DICOM_GEOMETRY_METHOD,
    INVALID_PARAMS,
)

FROZEN_NOW = datetime(2026, 9, 20, 0, 0, 0, tzinfo=timezone.utc)
FROZEN_TIMESTAMP = "2026-09-20T00:00:00Z"
REPO_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_DIR = REPO_ROOT / "tests" / "fixtures" / "dicom" / "geometry"
GENERATOR_MODULE = "python/tests/synthetic_geometry.py"
PHASE1_CROSS_VALIDATION_EPSILON = 1e-9
Writer = Callable[[Path], None]

GEOMETRY_CASES: list[tuple[str, Writer, str]] = [
    ("axial-exact", sg.write_geometry_axial, sg.AXIAL_SERIES_UID),
    ("oblique-exact", sg.write_geometry_oblique, sg.OBLIQUE_SERIES_UID),
    ("irregular-spacing", sg.write_geometry_irregular, sg.IRREGULAR_SERIES_UID),
    ("orientation-inconsistent", sg.write_geometry_orientation_inconsistent, sg.ORIENTATION_SERIES_UID),
]
COMPATIBILITY_CASES: list[tuple[str, Writer, str, str]] = [
    ("frame-of-reference-mismatch", sg.write_geometry_for_mismatch, sg.AXIAL_SERIES_UID, sg.ECHO_SERIES_UID),
]
REJECTION_CASES: list[tuple[Writer, str, str]] = [
    (sg.write_geometry_irregular, sg.IRREGULAR_SERIES_UID, "irregular-slice-spacing"),
    (sg.write_geometry_orientation_inconsistent, sg.ORIENTATION_SERIES_UID, "inconsistent-orientation"),
    (invalid.write_geometry_gantry_tilt, invalid.GANTRY_SERIES_UID, "gantry-tilt"),
    (invalid.write_geometry_duplicate, invalid.DUPLICATE_SERIES_UID, "duplicate-slice-position"),
    (invalid.write_geometry_insufficient, invalid.INSUFFICIENT_SERIES_UID, "insufficient-slices"),
]


def _call(method: str, params: dict[str, Any]) -> dict[str, Any]:
    dispatcher = build_dispatcher(now=lambda: FROZEN_NOW)
    request = {"jsonrpc": "2.0", "id": "req-p23", "protocolVersion": "1.0", "method": method, "params": params}
    return process_record(json.dumps(request), 0, dispatcher)


def _locator(directory: Path) -> dict[str, Any]:
    return {"kind": "local-folder", "path": str(directory)}


def _geometry(directory: Path, series_uid: str) -> dict[str, Any]:
    result = _call(
        DICOM_GEOMETRY_METHOD,
        {"locator": _locator(directory), "seriesInstanceUID": series_uid},
    )
    assert "result" in result, result
    payload = result["result"]
    assert payload["workerMetadata"]["operation"] == DICOM_GEOMETRY_METHOD
    assert payload["workerMetadata"]["timestamp"] == FROZEN_TIMESTAMP
    return {key: value for key, value in payload.items() if key != "workerMetadata"}


def _compatibility(directory: Path, left: str, right: str) -> dict[str, Any]:
    result = _call(
        DICOM_COMPATIBILITY_METHOD,
        {
            "left": {"locator": _locator(directory), "seriesInstanceUID": left},
            "right": {"locator": _locator(directory), "seriesInstanceUID": right},
        },
    )
    assert "result" in result, result
    payload = result["result"]
    assert payload["workerMetadata"]["operation"] == DICOM_COMPATIBILITY_METHOD
    return {key: value for key, value in payload.items() if key != "workerMetadata"}


def _expected(name: str) -> dict[str, Any]:
    return cast(dict[str, Any], json.loads((EXPECTED_DIR / name).read_text(encoding="utf-8")))


@pytest.mark.parametrize(("name", "writer", "series_uid"), GEOMETRY_CASES)
def test_geometry_expected_output(name: str, writer: Writer, series_uid: str, tmp_path: Path) -> None:
    writer(tmp_path)
    assert _geometry(tmp_path, series_uid) == _expected(f"{name}.expected.json")


@pytest.mark.parametrize(("name", "writer", "left", "right"), COMPATIBILITY_CASES)
def test_compatibility_expected_output(name: str, writer: Writer, left: str, right: str, tmp_path: Path) -> None:
    writer(tmp_path)
    assert _compatibility(tmp_path, left, right) == _expected(f"{name}.expected.json")


def test_axial_geometry_matches_phase1_conventions(tmp_path: Path) -> None:
    sg.write_geometry_axial(tmp_path)
    geometry = _geometry(tmp_path, sg.AXIAL_SERIES_UID)["geometry"]
    assert geometry["dimensions"] == [4, 4, 3]
    assert geometry["spacing"] == [0.5, 0.5, 2.0]
    assert geometry["origin"] == [0.0, 0.0, 0.0]
    assert geometry["direction"] == [1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
    assert geometry["sliceNormal"] == [0.0, 0.0, 1.0]
    assert geometry["slicePositionsLpsMm"] == [[0.0, 0.0, 0.0], [0.0, 0.0, 2.0], [0.0, 0.0, 4.0]]
    assert geometry["bounds"] == {"min": [-0.25, -0.25, -1.0], "max": [1.75, 1.75, 5.0]}


def _assert_close(actual: Sequence[float], expected: Sequence[float]) -> None:
    assert len(actual) == len(expected)
    for left, right in zip(actual, expected):
        assert abs(left - right) <= PHASE1_CROSS_VALIDATION_EPSILON, (actual, expected)


def test_calculate_bounds_cross_validates_phase1_fixtures() -> None:
    from dicom.geometry_math import calculate_bounds

    root = math.sqrt(0.5)
    oblique = calculate_bounds([2, 3, 1], [2, 3, 4], [10, 20, 30], [root, root, 0, 0, 0, 1])
    _assert_close(oblique["min"], [7.878679656440357, 17.878679656440358, 28.5])
    _assert_close(oblique["max"], [13.535533905932738, 23.535533905932738, 37.5])
    axial = calculate_bounds([512, 512, 200], [0.9765625, 0.9765625, 2.5], [-249.51171875, -249.51171875, -500.0], [1.0, 0.0, 0.0, 0.0, 1.0, 0.0])
    _assert_close(axial["min"], [-250.0, -250.0, -501.25])
    _assert_close(axial["max"], [250.0, 250.0, -1.25])


def test_slice_ordering_is_normalized_along_positive_normal(tmp_path: Path) -> None:
    sg.write_geometry_shuffled(tmp_path)
    geometry = _geometry(tmp_path, sg.SHUFFLED_SERIES_UID)["geometry"]
    assert geometry["origin"] == [0.0, 0.0, 0.0]
    assert geometry["slicePositionsLpsMm"] == [[0.0, 0.0, 0.0], [0.0, 0.0, 2.0], [0.0, 0.0, 4.0]]


@pytest.mark.parametrize(("writer", "series_uid", "reason"), REJECTION_CASES)
def test_invalid_grids_are_rejected(writer: Writer, series_uid: str, reason: str, tmp_path: Path) -> None:
    writer(tmp_path)
    payload = _geometry(tmp_path, series_uid)
    assert payload["status"] == "rejected"
    assert payload["reason"] == reason
    assert "geometry" not in payload
    assert payload["diagnostics"] and payload["diagnostics"][0]["severity"] == "error"


def test_missing_geometry_tag_is_rejected(tmp_path: Path) -> None:
    invalid.write_geometry_missing_tag(tmp_path)
    payload = _geometry(tmp_path, invalid.MISSING_TAG_SERIES_UID)
    assert payload["status"] == "rejected"
    assert payload["reason"] == "missing-required-tag:ImagePositionPatient"


def test_unknown_series_is_unavailable(tmp_path: Path) -> None:
    sg.write_geometry_axial(tmp_path)
    payload = _geometry(tmp_path, "1.2.826.0.1.3680043.10.9999.1")
    assert payload["status"] == "unavailable"
    assert payload["reason"] == "series-not-found"
    assert "geometry" not in payload


def test_malformed_params_are_invalid_params(tmp_path: Path) -> None:
    cases: list[dict[str, Any]] = [
        {"seriesInstanceUID": sg.AXIAL_SERIES_UID},
        {"locator": {"kind": "dicomweb"}, "seriesInstanceUID": sg.AXIAL_SERIES_UID},
        {"locator": _locator(tmp_path), "seriesInstanceUID": ""},
    ]
    for params in cases:
        response = _call(DICOM_GEOMETRY_METHOD, params)
        assert response["error"]["code"] == INVALID_PARAMS, (params, response)
        assert response["error"]["data"]["violations"]
        assert "result" not in response
    bad_side = _call(DICOM_COMPATIBILITY_METHOD, {"left": _locator(tmp_path), "right": _locator(tmp_path)})
    assert bad_side["error"]["code"] == INVALID_PARAMS


def test_geometric_digest_is_deterministic_and_geometry_sensitive(tmp_path: Path) -> None:
    sg.write_geometry_axial(tmp_path)
    first = _geometry(tmp_path, sg.AXIAL_SERIES_UID)["geometry"]["geometricDigest"]
    second = _geometry(tmp_path, sg.AXIAL_SERIES_UID)["geometry"]["geometricDigest"]
    assert first == second and first.startswith("sha256:")
    sg.write_geometry_oblique(tmp_path)
    other = _geometry(tmp_path, sg.OBLIQUE_SERIES_UID)["geometry"]["geometricDigest"]
    assert other != first


def test_compatibility_semantics_and_spacing_evidence(tmp_path: Path) -> None:
    sg.write_geometry_for_match(tmp_path)
    match = _compatibility(tmp_path, sg.AXIAL_SERIES_UID, sg.ECHO_SERIES_UID)
    assert match["compatible"] is True
    assert match["frameOfReference"]["equal"] is True
    assert match["orientation"]["coplanar"] is True
    assert match["incompatibilities"] == []
    assert match["spacingMm"]["left"] != match["spacingMm"]["right"]
    sg.write_geometry_for_mismatch(tmp_path)
    mismatch = _compatibility(tmp_path, sg.AXIAL_SERIES_UID, sg.ECHO_SERIES_UID)
    assert mismatch["compatible"] is False
    assert mismatch["incompatibilities"] == ["frame-of-reference-mismatch"]
    sg.write_geometry_non_coplanar(tmp_path)
    non_coplanar = _compatibility(tmp_path, sg.AXIAL_SERIES_UID, sg.CORONAL_SERIES_UID)
    assert non_coplanar["compatible"] is False
    assert non_coplanar["incompatibilities"] == ["orientation-not-coplanar"]
    sg.write_geometry_irregular(tmp_path)
    rejected = _compatibility(tmp_path, sg.AXIAL_SERIES_UID, sg.IRREGULAR_SERIES_UID)
    assert rejected["status"] == "rejected" and rejected["side"] == "right"
    assert rejected["reason"] == "irregular-slice-spacing"
    unavailable = _compatibility(tmp_path, sg.AXIAL_SERIES_UID, "1.2.826.0.1.3680043.10.9999.1")
    assert unavailable["status"] == "unavailable" and unavailable["side"] == "right"
    assert unavailable["reason"] == "series-not-found"
    assert "geometry" not in unavailable and "compatible" not in unavailable


def test_results_contain_no_absolute_paths_or_phi(tmp_path: Path) -> None:
    sg.write_geometry_for_match(tmp_path)
    serialized = json.dumps(_geometry(tmp_path, sg.AXIAL_SERIES_UID))
    serialized += json.dumps(_compatibility(tmp_path, sg.AXIAL_SERIES_UID, sg.ECHO_SERIES_UID))
    assert str(tmp_path) not in serialized
    assert "PatientName" not in serialized


def test_manifest_reconciles_geometry_fixtures(manifest: dict[str, Any], repo_root: Path) -> None:
    entries = {
        fixture["id"]: fixture
        for fixture in manifest["fixtures"]
        if fixture["id"].startswith("geometry.")
    }
    cases = {name: writer for name, writer, *_ in GEOMETRY_CASES + COMPATIBILITY_CASES}
    assert set(entries) == {f"geometry.{name}" for name in cases}
    for name, writer in cases.items():
        fixture = entries[f"geometry.{name}"]
        assert fixture["status"] == "established"
        assert fixture["ownerSlice"] == "P2.3"
        expected_path = fixture["expectedPath"]
        assert isinstance(expected_path, str) and (repo_root / expected_path).is_file()
        generator = fixture["generator"]
        assert isinstance(generator, str)
        module_name, separator, function_name = generator.partition("::")
        assert separator == "::" and module_name == GENERATOR_MODULE
        assert function_name == writer.__name__
