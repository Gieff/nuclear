"""P2.4 evidence for ``nuclear.quantitation.suvbw``.

Four committed-expectation cases are matched exactly. Independent mathematical
checks assert the decay identity at ``elapsed == 0`` and ``elapsed == half-life``
without re-implementing the production expression line-for-line. All FP
comparisons reference the named constants from :mod:`dicom.quantitation_math`.
"""

from __future__ import annotations

import json
import math
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest
import synthetic_pet as pet

from dicom.pet_metadata import DIAGNOSTIC_NON_POSITIVE_DECAYED_DOSE, PetInstance
from dicom.quantitation import build_quantitation_result
from dicom.quantitation_math import ELAPSED_SECONDS_EPSILON, SUV_FACTOR_RELATIVE_TOLERANCE
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
]
MISSING_TAG_CASES: list[tuple[str, dict[str, Any]]] = [
    ("PatientWeight", {"weight": None}),
    ("RadionuclideTotalDose", {"total_dose": None}),
    ("RadionuclideHalfLife", {"half_life": None}),
    ("RadiopharmaceuticalStartTime", {"start_time": None}),
    ("SeriesTime", {"series_time": None}),
    ("Units", {"units": None}),
    ("DecayCorrection", {"decay_correction": None}),
]
INVALID_CASES: list[tuple[str, dict[str, Any]]] = [
    ("non-positive-patient-weight", {"weight": 0.0}),
    ("non-positive-total-dose", {"total_dose": 0.0}),
    ("non-positive-half-life", {"half_life": 0.0}),
    ("unparseable-time", {"start_time": "250000"}),
    ("negative-elapsed-time", {"start_time": "230000", "series_time": "010000"}),
    ("unsupported-units", {"units": "CNTS"}),
    ("invalid-decay-correction", {"decay_correction": "NONE"}),
    ("non-finite-pet-metadata", {"total_dose": float("inf")}),
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


def _series(directory: Path, block: int, **overrides: Any) -> str:
    for index in (1, 2):
        pet.write_pet_instance(directory, f"{block}-{index}.dcm", block=block, index=index, **overrides)
    return pet.pet_uid(block, 2)


def _reason(payload: dict[str, Any]) -> str:
    code = payload["diagnostics"][0]["code"]
    assert isinstance(code, str)
    return code.removeprefix("dicom.quantitation.")


def _instance(*, series_time: str = pet.SERIES_TIME, **overrides: Any) -> PetInstance:
    values: dict[str, Any] = {
        "study_instance_uid": "1.2.3",
        "series_instance_uid": "1.2.3.4",
        "sop_instance_uid": "1.2.3.5",
        "modality": "PT",
        "units": "BQML",
        "decay_correction": "START",
        "radionuclide_half_life_seconds": pet.HALF_LIFE_SECONDS,
        "radionuclide_total_dose_bq": pet.TOTAL_DOSE_BQ,
        "radiopharmaceutical_start_time": pet.START_TIME,
        "series_time": series_time,
        "patient_weight_kg": pet.WEIGHT_KG,
        "file": "pet.dcm",
    }
    values.update(overrides)
    return PetInstance(**values)


@pytest.mark.parametrize(("name", "writer", "series_uid"), EXPECTED_CASES)
def test_committed_expected_output(name: str, writer: Writer, series_uid: str, tmp_path: Path) -> None:
    writer(tmp_path)
    expected: dict[str, Any] = json.loads((EXPECTED_DIR / f"{name}.expected.json").read_text("utf-8"))
    assert _result(series_uid, tmp_path) == expected


def test_decay_and_factor_identities() -> None:
    zero = build_quantitation_result([_instance(series_time="090000")], "1.2.3.4", [])
    assert zero["status"] == "computed"
    assert math.isclose(zero["elapsedSeconds"], 0.0, abs_tol=ELAPSED_SECONDS_EPSILON)
    assert math.isclose(zero["decayedDoseBq"], pet.TOTAL_DOSE_BQ, rel_tol=SUV_FACTOR_RELATIVE_TOLERANCE)
    assert math.isclose(
        zero["suvFactor"], pet.WEIGHT_KG * 1000.0 / pet.TOTAL_DOSE_BQ, rel_tol=SUV_FACTOR_RELATIVE_TOLERANCE
    )
    half = build_quantitation_result([_instance(series_time="104946.2")], "1.2.3.4", [])
    assert math.isclose(half["elapsedSeconds"], pet.HALF_LIFE_SECONDS, abs_tol=ELAPSED_SECONDS_EPSILON)
    assert math.isclose(half["decayedDoseBq"], pet.TOTAL_DOSE_BQ / 2.0, rel_tol=SUV_FACTOR_RELATIVE_TOLERANCE)


def test_computed_factor_is_positive_with_g_per_bq_units(tmp_path: Path) -> None:
    pet.write_pet_bqml(tmp_path)
    payload = _result(pet.BQML_SERIES_UID, tmp_path)
    assert payload["status"] == "computed"
    assert payload["suvFactor"] > 0.0  # g/Bq
    assert math.isclose(
        payload["suvFactor"],
        payload["petAcquisition"]["patientWeightKg"] * 1000.0 / payload["decayedDoseBq"],
        rel_tol=SUV_FACTOR_RELATIVE_TOLERANCE,
    )
    serialized = json.dumps(_call({"locator": {"kind": "local-folder", "path": str(tmp_path)}, "seriesInstanceUID": pet.BQML_SERIES_UID}), allow_nan=False)
    assert "NaN" not in serialized and "Infinity" not in serialized


def test_inconsistent_and_unavailable_dispositions(tmp_path: Path) -> None:
    series = pet.pet_uid(4030, 2)
    pet.write_pet_instance(tmp_path, "a.dcm", block=4030, index=1)
    pet.write_pet_instance(tmp_path, "b.dcm", block=4030, index=2, total_dose=pet.TOTAL_DOSE_BQ * 1.1)
    inconsistent = _result(series, tmp_path)
    assert inconsistent["status"] == "invalid" and _reason(inconsistent) == "inconsistent-pet-metadata"
    pet.write_pet_bqml(tmp_path)
    missing = _result("1.2.826.0.1.3680043.10.9999.1", tmp_path)
    assert missing["status"] == "unavailable" and _reason(missing) == "series-not-found"
    assert missing["studyInstanceUID"] is None
    not_pet = _result(_series(tmp_path, 4020, modality="CT"), tmp_path)
    assert not_pet["status"] == "unavailable" and _reason(not_pet) == "not-a-pet-series"
    for payload in (inconsistent, missing, not_pet):
        assert "suvFactor" not in payload


@pytest.mark.parametrize(("tag", "overrides"), MISSING_TAG_CASES)
def test_missing_required_tags_are_unavailable(tag: str, overrides: dict[str, Any], tmp_path: Path) -> None:
    payload = _result(_series(tmp_path, 4010, **overrides), tmp_path)
    assert payload["status"] == "unavailable"
    assert _reason(payload) == f"missing-required-tag:{tag}"
    assert "suvFactor" not in payload


@pytest.mark.filterwarnings("ignore:Invalid value for VR TM:UserWarning")
@pytest.mark.parametrize(("reason", "overrides"), INVALID_CASES)
def test_invalid_inputs_fail_closed(reason: str, overrides: dict[str, Any], tmp_path: Path) -> None:
    payload = _result(_series(tmp_path, 4011, **overrides), tmp_path)
    assert payload["status"] == "invalid"
    assert _reason(payload) == reason
    assert "suvFactor" not in payload


def test_decay_underflow_is_named_invalid(tmp_path: Path) -> None:
    series = _series(tmp_path, 4040, half_life=50.0, start_time="000000", series_time="235959")
    payload = _result(series, tmp_path)
    assert payload["status"] == "invalid"
    assert _reason(payload) == "non-positive-decayed-dose"
    assert payload["diagnostics"][0]["code"] == DIAGNOSTIC_NON_POSITIVE_DECAYED_DOSE
    assert "suvFactor" not in payload
    serialized = json.dumps(payload, allow_nan=False)
    assert "NaN" not in serialized and "Infinity" not in serialized


def test_denormal_decayed_dose_yields_non_finite_factor(tmp_path: Path) -> None:
    series = _series(tmp_path, 4041, half_life=82.0, start_time="000000", series_time="235959")
    payload = _result(series, tmp_path)
    assert payload["status"] == "invalid"
    assert _reason(payload) == "non-finite-suv-factor"
    assert "suvFactor" not in payload


def test_mixed_modality_series_is_order_independent(tmp_path: Path) -> None:
    series = pet.pet_uid(4050, 2)
    pet.write_pet_instance(tmp_path, "a-ct.dcm", block=4050, index=1, modality="CT")
    pet.write_pet_instance(tmp_path, "b-pt.dcm", block=4050, index=2, modality="PT")
    reversed_dir = tmp_path / "reversed"
    reversed_dir.mkdir()
    pet.write_pet_instance(reversed_dir, "a-pt.dcm", block=4050, index=1, modality="PT")
    pet.write_pet_instance(reversed_dir, "b-ct.dcm", block=4050, index=2, modality="CT")
    for directory in (tmp_path, reversed_dir):
        payload = _result(series, directory)
        assert payload["status"] == "invalid"
        assert _reason(payload) == "inconsistent-pet-metadata"
        assert "suvFactor" not in payload


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


def test_no_absolute_paths_or_phi(tmp_path: Path) -> None:
    pet.write_pet_bqml(tmp_path)
    serialized = json.dumps(_call({"locator": {"kind": "local-folder", "path": str(tmp_path)}, "seriesInstanceUID": pet.BQML_SERIES_UID}))
    assert str(tmp_path) not in serialized
    assert "PatientName" not in serialized


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
