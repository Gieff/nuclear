"""P2.2 evidence for ``nuclear.dicom.inspect`` source handling and classification.

Every synthetic case is generated into a temporary directory and inspected
through the real ``build_dispatcher()`` composition point with a frozen clock.
The six ratified cases are compared for exact equality against the committed
``tests/fixtures/dicom/classification/*.expected.json`` files with
``workerMetadata`` excluded.
"""

from __future__ import annotations

import json
import zipfile
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest
import synthetic_dicom

from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import DICOM_INSPECT_METHOD, INVALID_PARAMS, SOURCE_UNAVAILABLE

FROZEN_NOW = datetime(2026, 9, 20, 0, 0, 0, tzinfo=timezone.utc)
FROZEN_TIMESTAMP = "2026-09-20T00:00:00Z"
REPO_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_DIR = REPO_ROOT / "tests" / "fixtures" / "dicom" / "classification"
GENERATOR_MODULE = "python/tests/synthetic_dicom.py"
PAYLOAD_KEYS = ("studies", "diagnostics", "skippedFileCount")
Writer = Callable[[Path], None]

# name -> (writer, classification, supported, reason). Drives both the decision
# tree test and the manifest reconciliation test.
CASES: list[tuple[str, Writer, str, bool, str | None]] = [
    ("ct-primary", synthetic_dicom.write_ct_primary, "ct-primary", True, None),
    ("pt-attenuation-corrected", synthetic_dicom.write_pt_attenuation_corrected, "pt-primary", True, None),
    ("localizer", synthetic_dicom.write_ct_localizer, "localizer", False, None),
    ("secondary-capture", synthetic_dicom.write_secondary_capture, "secondary-capture", False, None),
    ("unsupported-modality", synthetic_dicom.write_unsupported_modality, "unsupported", False, "unsupported-modality"),
    ("missing-required-tag", synthetic_dicom.write_missing_required_tag, "unsupported", False, "missing-required-tag:Modality"),
]


def _call(locator: dict[str, Any]) -> dict[str, Any]:
    dispatcher = build_dispatcher(now=lambda: FROZEN_NOW)
    request = {
        "jsonrpc": "2.0",
        "id": "req-p22",
        "protocolVersion": "1.0",
        "method": DICOM_INSPECT_METHOD,
        "params": {"locator": locator},
    }
    return process_record(json.dumps(request), 0, dispatcher)


def _payload(locator: dict[str, Any]) -> dict[str, Any]:
    response = _call(locator)
    assert "result" in response, response
    result = response["result"]
    metadata = result["workerMetadata"]
    assert metadata["operation"] == DICOM_INSPECT_METHOD
    assert metadata["timestamp"] == FROZEN_TIMESTAMP
    return {key: result[key] for key in PAYLOAD_KEYS}


def _folder(tmp_path: Path, writer: Writer) -> dict[str, Any]:
    writer(tmp_path)
    return _payload({"kind": "local-folder", "path": str(tmp_path)})


def _single_series(payload: dict[str, Any]) -> dict[str, Any]:
    assert len(payload["studies"]) == 1, payload["studies"]
    series = payload["studies"][0]["series"]
    assert len(series) == 1, series
    return series[0]


@pytest.mark.parametrize(
    ("writer", "classification", "supported", "reason"),
    [pytest.param(w, c, s, r, id=n) for n, w, c, s, r in CASES],
)
def test_classification_tree(
    writer: Writer, classification: str, supported: bool, reason: str | None, tmp_path: Path
) -> None:
    series = _single_series(_folder(tmp_path, writer))
    assert series["classification"] == classification
    assert series["supported"] is supported
    assert series["reason"] == reason


@pytest.mark.parametrize(
    ("writer", "expected_name"),
    [pytest.param(w, f"{n}.expected.json", id=n) for n, w, *_ in CASES],
)
def test_committed_expected_output(writer: Writer, expected_name: str, tmp_path: Path) -> None:
    expected = json.loads((EXPECTED_DIR / expected_name).read_text(encoding="utf-8"))
    assert _folder(tmp_path, writer) == expected


def test_ct_non_axial_is_non_primary_image_type(tmp_path: Path) -> None:
    series = _single_series(_folder(tmp_path, synthetic_dicom.write_ct_non_axial))
    assert series["classification"] == "unsupported"
    assert series["supported"] is False
    assert series["reason"] == "non-primary-image-type"


def test_missing_required_tag_records_diagnostic_and_other_modality(tmp_path: Path) -> None:
    payload = _folder(tmp_path, synthetic_dicom.write_missing_required_tag)
    series = _single_series(payload)
    assert series["modality"] == "OT"
    diagnostic = payload["diagnostics"][0]
    assert diagnostic["code"] == "dicom.missing-required-tag"
    assert diagnostic["severity"] == "error"
    assert diagnostic["file"] == "missing-required-tag-1.dcm"


def test_mixed_folder_classifies_all_series_and_skips_non_dicom(tmp_path: Path) -> None:
    payload = _folder(tmp_path, synthetic_dicom.write_mixed_folder)
    series = payload["studies"][0]["series"]
    assert [entry["classification"] for entry in series] == [
        "ct-primary",
        "localizer",
        "secondary-capture",
    ]
    assert [entry["seriesNumber"] for entry in series] == [2, 3, 4]
    assert payload["skippedFileCount"] == 1
    assert payload["diagnostics"] == [
        {
            "code": "dicom.skipped-file",
            "severity": "warning",
            "message": "File is not a readable DICOM instance.",
            "file": "notes.txt",
        }
    ]


def test_non_dicom_only_folder_is_skipped_without_aborting(tmp_path: Path) -> None:
    synthetic_dicom.write_non_dicom(tmp_path)
    payload = _payload({"kind": "local-folder", "path": str(tmp_path)})
    assert payload["studies"] == []
    assert payload["skippedFileCount"] == 1
    assert payload["diagnostics"][0]["file"] == "notes.txt"


def test_local_file_list_locator_resolves_against_base_path(tmp_path: Path) -> None:
    synthetic_dicom.write_ct_primary(tmp_path)
    names = sorted(path.name for path in tmp_path.glob("*.dcm"))
    payload = _payload({"kind": "local-file-list", "files": names, "basePath": str(tmp_path)})
    series = _single_series(payload)
    assert series["classification"] == "ct-primary"
    assert series["instanceCount"] == 3


def test_archive_entry_locator_reads_matching_zip_entries(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.mkdir()
    synthetic_dicom.write_ct_primary(source)
    archive = tmp_path / "bundle.zip"
    with zipfile.ZipFile(archive, "w") as bundle:
        for path in sorted(source.glob("*.dcm")):
            bundle.write(path, arcname=f"study/{path.name}")
    payload = _payload(
        {"kind": "archive-entry", "archivePath": str(archive), "innerEntryPrefix": "study/"}
    )
    assert _single_series(payload)["classification"] == "ct-primary"


def test_malformed_locators_are_invalid_params() -> None:
    malformed: list[dict[str, Any]] = [
        {},
        {"kind": "dicomweb", "url": "https://example.invalid"},
        {"kind": "local-folder"},
        {"kind": "local-file-list", "files": []},
        {"kind": "archive-entry", "archivePath": ""},
    ]
    for locator in malformed:
        response = _call(locator)
        assert response["error"]["code"] == INVALID_PARAMS, (locator, response)
        assert response["error"]["data"]["violations"], locator
        assert "result" not in response


def test_unresolvable_sources_are_source_unavailable(tmp_path: Path) -> None:
    corrupt = tmp_path / "corrupt.zip"
    corrupt.write_bytes(b"not a zip archive")
    cases: list[dict[str, Any]] = [
        {"kind": "local-folder", "path": str(tmp_path / "absent")},
        {"kind": "local-file-list", "files": ["absent.dcm"], "basePath": str(tmp_path)},
        {"kind": "local-file-list", "files": [str(tmp_path / "absent-absolute.dcm")]},
        {"kind": "archive-entry", "archivePath": str(corrupt)},
        {"kind": "archive-entry", "archivePath": str(tmp_path / "missing.zip")},
    ]
    for locator in cases:
        response = _call(locator)
        assert response["error"]["code"] == SOURCE_UNAVAILABLE, (locator, response)
        assert response["error"]["data"]["diagnostic"], locator
        assert str(tmp_path) not in json.dumps(response["error"]["data"]["sourceName"])
        assert "result" not in response


def test_result_contains_no_absolute_paths_or_phi(tmp_path: Path) -> None:
    synthetic_dicom.write_mixed_folder(tmp_path)
    serialized = json.dumps(_call({"kind": "local-folder", "path": str(tmp_path)}))
    assert str(tmp_path) not in serialized
    assert "PatientName" not in serialized
    assert "notes.txt" in serialized


def test_worker_metadata_reports_effective_parameters(tmp_path: Path) -> None:
    synthetic_dicom.write_ct_primary(tmp_path)
    response = _call({"kind": "local-folder", "path": str(tmp_path)})
    parameters = response["result"]["workerMetadata"]["parameters"]
    assert parameters["locatorKind"] == "local-folder"
    assert parameters["instanceCount"] == 3
    assert parameters["seriesCount"] == 1
    assert parameters["studyCount"] == 1
    assert str(tmp_path) not in json.dumps(parameters)


def test_manifest_reconciles_classification_fixtures(
    manifest: dict[str, Any], repo_root: Path
) -> None:
    entries = {
        fixture["id"]: fixture
        for fixture in manifest["fixtures"]
        if fixture["id"].startswith("dicom.classification.")
    }
    writers = {name: writer for name, writer, *_ in CASES}
    assert set(entries) == {f"dicom.classification.{name}" for name in writers}
    for name, writer in writers.items():
        fixture = entries[f"dicom.classification.{name}"]
        assert fixture["status"] == "established"
        assert fixture["ownerSlice"] == "P2.2"
        expected_path = fixture["expectedPath"]
        assert isinstance(expected_path, str) and (repo_root / expected_path).is_file()
        generator = fixture["generator"]
        assert isinstance(generator, str)
        module_name, separator, function_name = generator.partition("::")
        assert separator == "::" and module_name == GENERATOR_MODULE
        resolved = getattr(synthetic_dicom, function_name, None)
        assert callable(resolved) and resolved is writer
