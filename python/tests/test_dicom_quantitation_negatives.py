"""P2.4 numeric and consistency negatives for ``nuclear.quantitation.suvbw``.

Covers non-positive/non-finite inputs, decay underflow/denormal guards,
unparseable and negative elapsed time, intra-series consistency, deterministic
mixed-modality handling and the unavailable dispositions. Every case asserts the
named reason, that no ``suvFactor`` key is emitted, and strict JSON validity.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest
import synthetic_pet as pet
from synthetic_common import write_metadata_dataset

from dicom.metadata import PET_IMAGE_STORAGE
from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import QUANTITATION_SUVBW_METHOD

FROZEN_NOW = datetime(2026, 9, 20, 0, 0, 0, tzinfo=timezone.utc)

NEGATIVE_CASES: list[tuple[str, dict[str, Any]]] = [
    ("non-positive-patient-weight", {"weight": 0.0}),
    ("non-positive-total-dose", {"information_items": [pet.information_item(dose=0.0)]}),
    ("non-positive-half-life", {"information_items": [pet.information_item(half_life=0.0)]}),
    ("non-finite-pet-metadata", {"information_items": [pet.information_item(dose=float("inf"))]}),
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
    return {key: value for key, value in payload.items() if key != "workerMetadata"}


def _reason(payload: dict[str, Any]) -> str:
    code = payload["diagnostics"][0]["code"]
    assert isinstance(code, str)
    return code.removeprefix("dicom.quantitation.")


def _series(directory: Path, block: int, **overrides: Any) -> str:
    pet.write_pet_series(directory, f"n{block}", block=block, **overrides)
    return pet.pet_uid(block, 2)


def _assert_invalid(payload: dict[str, Any], reason: str) -> None:
    assert payload["status"] == "invalid"
    assert _reason(payload) == reason
    assert "suvFactor" not in payload
    serialized = json.dumps(payload, allow_nan=False)
    assert "NaN" not in serialized and "Infinity" not in serialized


@pytest.mark.parametrize(("reason", "overrides"), NEGATIVE_CASES)
def test_non_positive_and_non_finite_inputs(
    reason: str, overrides: dict[str, Any], tmp_path: Path
) -> None:
    _assert_invalid(_result(_series(tmp_path, 4011, **overrides), tmp_path), reason)


def test_short_half_life_underflow_is_named_invalid(tmp_path: Path) -> None:
    series = _series(
        tmp_path, 4040,
        information_items=[pet.information_item(half_life=50.0, start_datetime="20260920000000")],
        acquisition_datetime="20260920235959",
    )
    _assert_invalid(_result(series, tmp_path), "non-positive-decayed-dose")


def test_denormal_decayed_dose_yields_non_finite_factor(tmp_path: Path) -> None:
    series = _series(
        tmp_path, 4041,
        information_items=[pet.information_item(half_life=82.0, start_datetime="20260920000000")],
        acquisition_datetime="20260920235959",
    )
    _assert_invalid(_result(series, tmp_path), "non-finite-suv-factor")


def test_negative_elapsed_time_is_deferred(tmp_path: Path) -> None:
    series = _series(
        tmp_path, 4042,
        information_items=[pet.information_item(start_datetime="20260920100000")],
        acquisition_datetime="20260920090000",
    )
    _assert_invalid(_result(series, tmp_path), "negative-elapsed-time")


@pytest.mark.filterwarnings("ignore:Invalid value for VR DT:UserWarning")
def test_unparseable_datetime_is_invalid(tmp_path: Path) -> None:
    series = _series(
        tmp_path, 4043,
        information_items=[pet.information_item(start_datetime="20261340100000")],
    )
    _assert_invalid(_result(series, tmp_path), "unparseable-time")


def test_inconsistent_units_and_timing_are_rejected(tmp_path: Path) -> None:
    series = pet.pet_uid(4050, 2)
    pet.write_pet_instance(tmp_path, "units-a.dcm", block=4050, index=1, units="BQML")
    pet.write_pet_instance(tmp_path, "units-b.dcm", block=4050, index=2, units="CNTS")
    _assert_invalid(_result(series, tmp_path), "inconsistent-pet-metadata")
    other = tmp_path / "timing"
    other.mkdir()
    pet.write_pet_instance(other, "time-a.dcm", block=4050, index=1)
    pet.write_pet_instance(other, "time-b.dcm", block=4050, index=2, acquisition_datetime="20260920110000")
    _assert_invalid(_result(series, other), "inconsistent-pet-metadata")


def test_unavailable_dispositions(tmp_path: Path) -> None:
    pet.write_pet_bqml(tmp_path)
    missing = _result("1.2.826.0.1.3680043.10.9999.1", tmp_path)
    assert missing["status"] == "unavailable" and _reason(missing) == "series-not-found"
    assert missing["studyInstanceUID"] is None
    not_pet = _result(_series(tmp_path, 4020, modality="CT"), tmp_path)
    assert not_pet["status"] == "unavailable" and _reason(not_pet) == "not-a-pet-series"
    for payload in (missing, not_pet):
        assert "suvFactor" not in payload
        json.dumps(payload, allow_nan=False)


def _write_pair(
    directory: Path,
    series_uid: str,
    *,
    acquisition_datetime: str | None = None,
    information_items: list[list[tuple[str, Any]]] | None = None,
    series_time: str | None = None,
    root_legacy: bool = False,
) -> None:
    items = [pet.information_item()] if information_items is None else information_items
    extras: dict[str, Any] = {}
    if series_time is not None:
        extras["series_time"] = series_time
    if root_legacy:
        extras.update(
            radionuclide_total_dose=1.0,
            radionuclide_half_life=1.0,
            radiopharmaceutical_start_time="090000",
        )
    for index in (1, 2):
        write_metadata_dataset(
            directory, f"iso-{index}.dcm",
            study_uid=pet.pet_uid(4999, 1), series_uid=series_uid, sop_uid=f"{pet.pet_uid(4999, 3)}.{index}",
            sop_class_uid=PET_IMAGE_STORAGE, modality="PT", units="BQML", decay_correction="START",
            patient_weight=pet.WEIGHT_KG, acquisition_datetime=acquisition_datetime,
            radiopharmaceutical_information=items, **extras,
        )


def test_series_time_is_not_an_acquisition_start(tmp_path: Path) -> None:
    series = pet.pet_uid(4102, 2)
    _write_pair(tmp_path, series, series_time="100000")
    payload = _result(series, tmp_path)
    assert payload["status"] == "unavailable"
    assert _reason(payload) == "missing-required-tag:AcquisitionDateTime"


def test_deprecated_time_only_start_is_not_used(tmp_path: Path) -> None:
    series = pet.pet_uid(4103, 2)
    _write_pair(
        tmp_path, series, acquisition_datetime=pet.ACQUISITION_DATETIME,
        information_items=[pet.information_item(start_datetime=None, legacy_start_time="090000")],
    )
    payload = _result(series, tmp_path)
    assert payload["status"] == "unavailable"
    assert _reason(payload) == "missing-required-tag:RadiopharmaceuticalStartDateTime"


def test_legacy_root_tags_are_ignored(tmp_path: Path) -> None:
    series = pet.pet_uid(4104, 2)
    _write_pair(tmp_path, series, acquisition_datetime=pet.ACQUISITION_DATETIME, root_legacy=True)
    payload = _result(series, tmp_path)
    assert payload["status"] == "computed"
    assert payload["petAcquisition"]["radionuclideTotalDoseBq"] == pet.TOTAL_DOSE_BQ
    assert payload["petAcquisition"]["radionuclideHalfLifeSeconds"] == pet.HALF_LIFE_SECONDS


def test_mixed_modality_series_is_order_independent(tmp_path: Path) -> None:
    series = pet.pet_uid(4060, 2)
    forward_dir = tmp_path / "forward"
    forward_dir.mkdir()
    pet.write_pet_instance(forward_dir, "a-ct.dcm", block=4060, index=1, modality="CT")
    pet.write_pet_instance(forward_dir, "b-pt.dcm", block=4060, index=2, modality="PT")
    reversed_dir = tmp_path / "reversed"
    reversed_dir.mkdir()
    pet.write_pet_instance(reversed_dir, "a-pt.dcm", block=4060, index=1, modality="PT")
    pet.write_pet_instance(reversed_dir, "b-ct.dcm", block=4060, index=2, modality="CT")
    for directory in (forward_dir, reversed_dir):
        _assert_invalid(_result(series, directory), "inconsistent-pet-metadata")
