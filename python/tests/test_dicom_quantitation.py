"""P2.4 committed-fixture and manifest evidence for ``nuclear.quantitation.suvbw``.

The twelve conformant negative/positive cases are generated into temporary
directories and compared for exact equality against the committed expected JSON
with ``workerMetadata`` excluded. Extraction and mathematical conformance live
in ``test_dicom_quantitation_conformance.py``; numeric negatives live in
``test_dicom_quantitation_negatives.py``.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest
import synthetic_pet as pet

from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import INVALID_PARAMS, QUANTITATION_SUVBW_METHOD

FROZEN_NOW = datetime(2026, 9, 20, 0, 0, 0, tzinfo=timezone.utc)
REPO_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_DIR = REPO_ROOT / "tests" / "fixtures" / "dicom" / "quantitation"
GENERATOR_MODULE = "python/tests/synthetic_pet.py"
Writer = Callable[[Path], None]

EXPECTED_CASES: list[tuple[str, Writer, str]] = [
    ("suvbw-bqml", pet.write_pet_bqml, pet.BQML_SERIES_UID),
    ("missing-metadata", pet.write_pet_missing_weight, pet.MISSING_WEIGHT_SERIES_UID),
    ("unsupported-units", pet.write_pet_unsupported_units, pet.UNSUPPORTED_UNITS_SERIES_UID),
    ("invalid-decay-correction", pet.write_pet_invalid_decay, pet.INVALID_DECAY_SERIES_UID),
    ("missing-sequence", pet.write_pet_missing_sequence, pet.MISSING_SEQUENCE_SERIES_UID),
    (
        "ambiguous-radiopharmaceutical-information",
        pet.write_pet_multiple_sequence_items,
        pet.AMBIGUOUS_SERIES_UID,
    ),
    ("missing-dose", pet.write_pet_missing_dose, pet.MISSING_DOSE_SERIES_UID),
    ("missing-half-life", pet.write_pet_missing_half_life, pet.MISSING_HALF_LIFE_SERIES_UID),
    (
        "missing-start-datetime",
        pet.write_pet_missing_start_datetime,
        pet.MISSING_START_DATETIME_SERIES_UID,
    ),
    ("unsupported-decay-correction", pet.write_pet_admin_decay, pet.ADMIN_SERIES_UID),
    ("inconsistent-study-uid", pet.write_pet_inconsistent_study, pet.INCONSISTENT_STUDY_SERIES_UID),
    ("duplicate-sop-instance-uid", pet.write_pet_duplicate_sop, pet.DUPLICATE_SOP_SERIES_UID),
    (
        "suvbw-datetime-fallback",
        pet.write_pet_acquisition_date_time,
        pet.DATETIME_FALLBACK_SERIES_UID,
    ),
]


def _call(params: dict[str, Any]) -> dict[str, Any]:
    request = {"jsonrpc": "2.0", "id": "req-p24", "protocolVersion": "1.0",
               "method": QUANTITATION_SUVBW_METHOD, "params": params}
    return process_record(json.dumps(request), 0, build_dispatcher(now=lambda: FROZEN_NOW))


def _result(series_uid: str, directory: Path) -> dict[str, Any]:
    response = _call(
        {"locator": {"kind": "local-folder", "path": str(directory)}, "seriesInstanceUID": series_uid}
    )
    payload = response["result"]
    assert payload["workerMetadata"]["operation"] == QUANTITATION_SUVBW_METHOD
    return {key: value for key, value in payload.items() if key != "workerMetadata"}


@pytest.mark.parametrize(("name", "writer", "series_uid"), EXPECTED_CASES)
def test_committed_expected_output(name: str, writer: Writer, series_uid: str, tmp_path: Path) -> None:
    writer(tmp_path)
    expected: dict[str, Any] = json.loads((EXPECTED_DIR / f"{name}.expected.json").read_text("utf-8"))
    assert _result(series_uid, tmp_path) == expected


@pytest.mark.parametrize(("name", "writer", "series_uid"), EXPECTED_CASES)
def test_suv_factor_key_only_when_computed(
    name: str, writer: Writer, series_uid: str, tmp_path: Path
) -> None:
    writer(tmp_path)
    payload = _result(series_uid, tmp_path)
    assert ("suvFactor" in payload) is (payload["status"] == "computed")
    json.dumps(payload, allow_nan=False)


def test_no_absolute_paths_or_phi(tmp_path: Path) -> None:
    pet.write_pet_bqml(tmp_path)
    serialized = json.dumps(
        _call({"locator": {"kind": "local-folder", "path": str(tmp_path)}, "seriesInstanceUID": pet.BQML_SERIES_UID})
    )
    assert str(tmp_path) not in serialized
    assert "PatientName" not in serialized


def test_malformed_params_are_invalid_params(tmp_path: Path) -> None:
    cases: list[dict[str, Any]] = [
        {"locator": {"kind": "local-folder", "path": str(tmp_path)}},
        {"seriesInstanceUID": pet.BQML_SERIES_UID},
        {"locator": {"kind": "dicomweb"}, "seriesInstanceUID": pet.BQML_SERIES_UID},
        {"locator": {"kind": "local-folder", "path": str(tmp_path)}, "seriesInstanceUID": ""},
    ]
    for params in cases:
        response = _call(params)
        assert response["error"]["code"] == INVALID_PARAMS, (params, response)
        assert response["error"]["data"]["violations"]
        assert "result" not in response


def test_manifest_reconciles_quantitation_fixtures(manifest: dict[str, Any], repo_root: Path) -> None:
    entries = {
        fixture["id"]: fixture
        for fixture in manifest["fixtures"]
        if fixture["id"].startswith("quantitation.")
    }
    writers = {name: writer for name, writer, _ in EXPECTED_CASES}
    assert set(entries) == {f"quantitation.{name}" for name in writers}
    for name, writer in writers.items():
        fixture = entries[f"quantitation.{name}"]
        assert fixture["status"] == "established"
        assert fixture["ownerSlice"] == "P2.4"
        expected_path = fixture["expectedPath"]
        assert isinstance(expected_path, str) and (repo_root / expected_path).is_file()
        generator = fixture["generator"]
        assert isinstance(generator, str)
        module_name, separator, function_name = generator.partition("::")
        assert separator == "::" and module_name == GENERATOR_MODULE
        assert function_name == writer.__name__
