"""P2.4 conformance evidence for PET extraction, DT parsing and the decay law.

Structure follows DICOM PS3.3 C.8.9: dose/half-life/administration live inside a
single ``RadiopharmaceuticalInformationSequence`` item; acquisition start is a
root ``AcquisitionDateTime``. ``START`` decays to the acquisition instant, so the
decay identities below use ``elapsed = acquisition - administration`` and do not
re-implement the production expression line-for-line.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest
import synthetic_pet as pet
from synthetic_common import write_metadata_dataset

from dicom.metadata import PET_IMAGE_STORAGE
from dicom.pet_metadata import PetInstance
from dicom.quantitation import build_quantitation_result
from dicom.quantitation_math import (
    ELAPSED_SECONDS_EPSILON,
    SUV_FACTOR_RELATIVE_TOLERANCE,
    parse_dicom_datetime,
)
from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import QUANTITATION_SUVBW_METHOD

FROZEN_NOW = datetime(2026, 9, 20, 0, 0, 0, tzinfo=timezone.utc)

REASON_CASES: list[tuple[str, Any, str, str, str]] = [
    ("missing-sequence", pet.write_pet_missing_sequence, pet.MISSING_SEQUENCE_SERIES_UID,
     "unavailable", "missing-required-tag:RadiopharmaceuticalInformationSequence"),
    ("ambiguous", pet.write_pet_multiple_sequence_items, pet.AMBIGUOUS_SERIES_UID,
     "invalid", "ambiguous-radiopharmaceutical-information"),
    ("missing-dose", pet.write_pet_missing_dose, pet.MISSING_DOSE_SERIES_UID,
     "unavailable", "missing-required-tag:RadionuclideTotalDose"),
    ("missing-half-life", pet.write_pet_missing_half_life, pet.MISSING_HALF_LIFE_SERIES_UID,
     "unavailable", "missing-required-tag:RadionuclideHalfLife"),
    ("missing-start-datetime", pet.write_pet_missing_start_datetime, pet.MISSING_START_DATETIME_SERIES_UID,
     "unavailable", "missing-required-tag:RadiopharmaceuticalStartDateTime"),
    ("admin", pet.write_pet_admin_decay, pet.ADMIN_SERIES_UID,
     "invalid", "unsupported-decay-correction"),
    ("inconsistent-study", pet.write_pet_inconsistent_study, pet.INCONSISTENT_STUDY_SERIES_UID,
     "invalid", "inconsistent-study-uid"),
    ("duplicate-sop", pet.write_pet_duplicate_sop, pet.DUPLICATE_SOP_SERIES_UID,
     "invalid", "duplicate-sop-instance-uid"),
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


def _instance(**overrides: Any) -> PetInstance:
    values: dict[str, Any] = {
        "study_instance_uid": "1.2.3",
        "series_instance_uid": "1.2.3.4",
        "sop_instance_uid": "1.2.3.5",
        "modality": "PT",
        "units": "BQML",
        "decay_correction": "START",
        "patient_weight_kg": pet.WEIGHT_KG,
        "radiopharmaceutical_sequence_count": 1,
        "radionuclide_half_life_seconds": pet.HALF_LIFE_SECONDS,
        "radionuclide_total_dose_bq": pet.TOTAL_DOSE_BQ,
        "radiopharmaceutical_start_datetime": pet.START_DATETIME,
        "acquisition_datetime": pet.ACQUISITION_DATETIME,
        "file": "pet.dcm",
    }
    values.update(overrides)
    return PetInstance(**values)


@pytest.mark.parametrize(("name", "writer", "series_uid", "status", "reason"), REASON_CASES)
def test_conformant_dispositions(
    name: str, writer: Any, series_uid: str, status: str, reason: str, tmp_path: Path
) -> None:
    writer(tmp_path)
    payload = _result(series_uid, tmp_path)
    assert payload["status"] == status
    assert _reason(payload) == reason
    assert "suvFactor" not in payload
    json.dumps(payload, allow_nan=False)


def test_root_only_tags_do_not_satisfy_pet_requirements(tmp_path: Path) -> None:
    series = pet.pet_uid(4099, 2)
    for index in (1, 2):
        write_metadata_dataset(
            tmp_path, f"root-{index}.dcm",
            study_uid=pet.pet_uid(4099, 1), series_uid=series, sop_uid=f"{pet.pet_uid(4099, 3)}.{index}",
            sop_class_uid=PET_IMAGE_STORAGE, modality="PT", units="BQML", decay_correction="START",
            radionuclide_total_dose=pet.TOTAL_DOSE_BQ, radionuclide_half_life=pet.HALF_LIFE_SECONDS,
            radiopharmaceutical_start_time="090000", series_time="100000", patient_weight=pet.WEIGHT_KG,
        )
    payload = _result(series, tmp_path)
    assert payload["status"] == "unavailable"
    assert _reason(payload) == "missing-required-tag:RadiopharmaceuticalInformationSequence"


def test_conformant_dataset_computes_with_sequence_field_names(tmp_path: Path) -> None:
    pet.write_pet_bqml(tmp_path)
    payload = _result(pet.BQML_SERIES_UID, tmp_path)
    assert payload["status"] == "computed"
    acquisition = payload["petAcquisition"]
    assert set(acquisition) == {
        "units", "decayCorrection", "radionuclideHalfLifeSeconds", "radionuclideTotalDoseBq",
        "radiopharmaceuticalStartDateTime", "acquisitionDateTime", "patientWeightKg",
    }
    assert "radiopharmaceuticalStartTime" not in acquisition and "seriesTime" not in acquisition
    assert payload["suvFactor"] > 0.0  # g/Bq
    assert math.isclose(
        payload["suvFactor"], acquisition["patientWeightKg"] * 1000.0 / payload["decayedDoseBq"],
        rel_tol=SUV_FACTOR_RELATIVE_TOLERANCE,
    )


def test_parse_dicom_datetime_fractional_and_offset() -> None:
    base = parse_dicom_datetime("20260920100000")
    assert base is not None
    fractional = parse_dicom_datetime("20260920100000.500000")
    assert fractional is not None
    assert math.isclose(fractional - base, 0.5, abs_tol=ELAPSED_SECONDS_EPSILON)
    offset = parse_dicom_datetime("20260920100000+0200")
    assert offset is not None
    assert math.isclose(base - offset, 7200.0, abs_tol=ELAPSED_SECONDS_EPSILON)
    assert parse_dicom_datetime("2026092010") is None
    assert parse_dicom_datetime("20261340100000") is None


def test_decay_identities_use_acquisition_minus_administration() -> None:
    zero = build_quantitation_result(
        [_instance(acquisition_datetime=pet.START_DATETIME)], "1.2.3.4", []
    )
    assert zero["status"] == "computed"
    assert math.isclose(zero["elapsedSeconds"], 0.0, abs_tol=ELAPSED_SECONDS_EPSILON)
    assert math.isclose(zero["decayedDoseBq"], pet.TOTAL_DOSE_BQ, rel_tol=SUV_FACTOR_RELATIVE_TOLERANCE)
    assert math.isclose(
        zero["suvFactor"], pet.WEIGHT_KG * 1000.0 / pet.TOTAL_DOSE_BQ,
        rel_tol=SUV_FACTOR_RELATIVE_TOLERANCE,
    )
    half = build_quantitation_result(
        [_instance(acquisition_datetime="20260920104946.2")], "1.2.3.4", []
    )
    assert math.isclose(half["elapsedSeconds"], pet.HALF_LIFE_SECONDS, abs_tol=ELAPSED_SECONDS_EPSILON)
    assert math.isclose(
        half["decayedDoseBq"], pet.TOTAL_DOSE_BQ / 2.0, rel_tol=SUV_FACTOR_RELATIVE_TOLERANCE
    )


def test_mixed_timezone_convention_is_ambiguous(tmp_path: Path) -> None:
    pet.write_pet_series(
        tmp_path, "mixed-tz", block=4100,
        information_items=[pet.information_item(start_datetime="20260920090000+0200")],
        acquisition_datetime="20260920100000",
    )
    payload = _result(pet.pet_uid(4100, 2), tmp_path)
    assert payload["status"] == "invalid"
    assert _reason(payload) == "ambiguous-time-base"
    assert "suvFactor" not in payload
    json.dumps(payload, allow_nan=False)


def test_offset_aware_convention_still_computes(tmp_path: Path) -> None:
    pet.write_pet_series(
        tmp_path, "aware-tz", block=4101,
        information_items=[pet.information_item(start_datetime="20260920090000+0200")],
        acquisition_datetime="20260920100000+0200",
    )
    payload = _result(pet.pet_uid(4101, 2), tmp_path)
    assert payload["status"] == "computed"
    assert math.isclose(payload["elapsedSeconds"], 3600.0, abs_tol=ELAPSED_SECONDS_EPSILON)


def test_acquisition_date_time_fallback_computes(tmp_path: Path) -> None:
    pet.write_pet_acquisition_date_time(tmp_path)
    payload = _result(pet.DATETIME_FALLBACK_SERIES_UID, tmp_path)
    assert payload["status"] == "computed"
    assert payload["petAcquisition"]["acquisitionDateTime"] == "20260920100000"
    assert math.isclose(payload["elapsedSeconds"], 3600.0, abs_tol=ELAPSED_SECONDS_EPSILON)


def test_missing_study_uid_is_unavailable_without_empty_uid() -> None:
    payload = build_quantitation_result([_instance(study_instance_uid=None)], "1.2.3.4", [])
    assert payload["status"] == "unavailable"
    assert _reason(payload) == "missing-required-tag:StudyInstanceUID"
    assert payload["studyInstanceUID"] is None
