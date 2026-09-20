"""P2.3.1 hardening evidence for the fail-closed geometry path.

Covers the seven negative fixtures (non-finite, non-positive and identity
conflicts), strict-JSON serializability of computed geometry, a direct
negative-spacing unit check, and the complete manifest reconciliation for every
committed ``geometry.*`` fixture.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

import pytest
import synthetic_geometry as sg
import synthetic_geometry_invalid as invalid

from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import DICOM_GEOMETRY_METHOD

FROZEN_NOW = datetime(2026, 9, 20, 0, 0, 0, tzinfo=timezone.utc)
REPO_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_DIR = REPO_ROOT / "tests" / "fixtures" / "dicom" / "geometry"
GENERATOR_MODULES = {
    "python/tests/synthetic_geometry.py",
    "python/tests/synthetic_geometry_invalid.py",
}
Writer = Callable[[Path], None]

HARDENING_CASES: list[tuple[str, Writer, str, str]] = [
    ("non-finite-coordinate", invalid.write_geometry_non_finite, invalid.NON_FINITE_SERIES_UID, "non-finite-geometry"),
    ("non-positive-dimensions", invalid.write_geometry_non_positive_dimensions, invalid.NON_POSITIVE_DIMENSIONS_SERIES_UID, "non-positive-dimensions"),
    ("non-positive-pixel-spacing", invalid.write_geometry_non_positive_spacing, invalid.NON_POSITIVE_SPACING_SERIES_UID, "non-positive-pixel-spacing"),
    ("inconsistent-study-uid", invalid.write_geometry_inconsistent_study, invalid.INCONSISTENT_STUDY_SERIES_UID, "inconsistent-study-uid"),
    ("inconsistent-frame-of-reference", invalid.write_geometry_inconsistent_frame, invalid.INCONSISTENT_FRAME_SERIES_UID, "inconsistent-frame-of-reference"),
    ("inconsistent-modality", invalid.write_geometry_inconsistent_modality, invalid.INCONSISTENT_MODALITY_SERIES_UID, "inconsistent-modality"),
    ("duplicate-sop-instance-uid", invalid.write_geometry_duplicate_sop, invalid.DUPLICATE_SOP_SERIES_UID, "duplicate-sop-instance-uid"),
    ("non-finite-derived", invalid.write_geometry_non_finite_derived, invalid.NON_FINITE_DERIVED_SERIES_UID, "non-finite-geometry"),
]
PROMOTED_CASES: list[tuple[str, Writer]] = [
    ("axial-exact", sg.write_geometry_axial),
    ("oblique-exact", sg.write_geometry_oblique),
    ("irregular-spacing", sg.write_geometry_irregular),
    ("orientation-inconsistent", sg.write_geometry_orientation_inconsistent),
    ("frame-of-reference-mismatch", sg.write_geometry_for_mismatch),
]
COMPUTED_CASES: list[tuple[str, Writer, str]] = [
    ("axial-exact", sg.write_geometry_axial, sg.AXIAL_SERIES_UID),
    ("oblique-exact", sg.write_geometry_oblique, sg.OBLIQUE_SERIES_UID),
]


def _result(writer: Writer, series_uid: str, tmp_path: Path) -> dict[str, Any]:
    writer(tmp_path)
    request = {
        "jsonrpc": "2.0",
        "id": "req-p231",
        "protocolVersion": "1.0",
        "method": DICOM_GEOMETRY_METHOD,
        "params": {
            "locator": {"kind": "local-folder", "path": str(tmp_path)},
            "seriesInstanceUID": series_uid,
        },
    }
    response = process_record(json.dumps(request), 0, build_dispatcher(now=lambda: FROZEN_NOW))
    payload = response["result"]
    return {key: value for key, value in payload.items() if key != "workerMetadata"}


def _expected(name: str) -> dict[str, Any]:
    raw = (EXPECTED_DIR / f"{name}.expected.json").read_text(encoding="utf-8")
    return cast(dict[str, Any], json.loads(raw))


@pytest.mark.parametrize(("name", "writer", "series_uid", "reason"), HARDENING_CASES)
def test_hardening_fixtures_are_rejected(
    name: str, writer: Writer, series_uid: str, reason: str, tmp_path: Path
) -> None:
    payload = _result(writer, series_uid, tmp_path)
    assert payload == _expected(name)
    assert payload["status"] == "rejected"
    assert payload["reason"] == reason
    assert "geometry" not in payload
    assert payload["diagnostics"][0]["code"] == f"dicom.geometry.{reason}"
    assert payload["diagnostics"][0]["severity"] == "error"
    serialized = json.dumps(payload, allow_nan=False)  # rejected payloads must be valid JSON
    assert "NaN" not in serialized and "Infinity" not in serialized


@pytest.mark.parametrize(("name", "writer", "series_uid"), COMPUTED_CASES)
def test_computed_geometry_is_strictly_json_serializable(
    name: str, writer: Writer, series_uid: str, tmp_path: Path
) -> None:
    payload = _result(writer, series_uid, tmp_path)
    assert payload["status"] == "computed"
    serialized = json.dumps(payload, allow_nan=False)
    assert "geometry" in json.loads(serialized)


def test_numeric_diagnostic_rejects_negative_spacing() -> None:
    from dicom.geometry_metadata import GeometryInstance
    from dicom.geometry_validation import numeric_diagnostic

    member = GeometryInstance(
        study_instance_uid="1.2.3", series_instance_uid="1.2.3.4", sop_instance_uid="1.2.3.5",
        modality="CT", frame_of_reference_uid="1.2.3.6", rows=4, columns=4,
        pixel_spacing=(-0.5, 0.5), image_position_patient=(0.0, 0.0, 0.0),
        image_orientation_patient=(1.0, 0.0, 0.0, 0.0, 1.0, 0.0), file="negative-spacing.dcm",
    )
    diagnostic = numeric_diagnostic([member])
    assert diagnostic is not None
    assert diagnostic.code == "dicom.geometry.non-positive-pixel-spacing"


def test_manifest_reconciles_all_geometry_fixtures(manifest: dict[str, Any], repo_root: Path) -> None:
    entries = {
        fixture["id"]: fixture
        for fixture in manifest["fixtures"]
        if fixture["id"].startswith("geometry.")
    }
    writers = {name: writer for name, writer, *_ in HARDENING_CASES}
    writers.update(dict(PROMOTED_CASES))
    assert set(entries) == {f"geometry.{name}" for name in writers}
    for name, writer in writers.items():
        fixture = entries[f"geometry.{name}"]
        assert fixture["status"] == "established"
        assert fixture["ownerSlice"] == "P2.3"
        expected_path = fixture["expectedPath"]
        assert isinstance(expected_path, str) and (repo_root / expected_path).is_file()
        generator = fixture["generator"]
        assert isinstance(generator, str)
        module_name, separator, function_name = generator.partition("::")
        assert separator == "::" and module_name in GENERATOR_MODULES
        assert function_name == writer.__name__
