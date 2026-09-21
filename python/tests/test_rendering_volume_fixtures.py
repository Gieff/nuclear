"""P3.2 evidence for the committed pixel-bearing CT/PT volume fixtures.

Every check reads the committed artifacts under
``tests/rendering/fixtures/volumes/`` and exercises the real worker through
``build_dispatcher()`` with the generator's frozen clock. Nothing here is a
clinical claim; the fixtures are test-only (ADR-004).
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any, cast

import numpy as np
import pydicom
import pytest
import synthetic_pixel_volume as spv

from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import DICOM_GEOMETRY_METHOD, DICOM_INSPECT_METHOD

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_ROOT = REPO_ROOT / "tests" / "rendering" / "fixtures" / "volumes"

PAYLOAD_KEYS = [
    "encoding",
    "byteOrder",
    "dtype",
    "signedness",
    "samplesPerPixel",
    "bitsAllocated",
    "bitsStored",
    "highBit",
    "photometricInterpretation",
    "scalarDataDomain",
    "rescale",
    "dimensions",
    "values",
]

# fixture directory -> (modality, classification, payload dtype, scalar domain)
CASES: list[tuple[str, str, str, str, str]] = [
    ("ct-axial", "CT", "ct-primary", "int16", "rescaled-hu"),
    ("pt-axial", "PT", "pt-primary", "float32", "rescaled-bqml"),
]
CASE_IDS = [case[0] for case in CASES]


def _load_json(path: Path) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(raw, dict)
    return cast(dict[str, Any], raw)


def _call(method: str, params: dict[str, Any]) -> dict[str, Any]:
    dispatcher = build_dispatcher(now=lambda: spv.FROZEN_NOW)
    request = {
        "jsonrpc": "2.0",
        "id": "req-p32",
        "protocolVersion": "1.0",
        "method": method,
        "params": params,
    }
    return process_record(json.dumps(request), 0, dispatcher)


def _locator(directory: Path) -> dict[str, Any]:
    return {"kind": "local-folder", "path": str(directory)}


def _numpy_dtype(dtype_name: str) -> np.dtype[Any]:
    return np.dtype("<i2") if dtype_name == "int16" else np.dtype("<f4")


@pytest.mark.parametrize(
    ("name", "modality", "classification", "dtype_name", "domain"), CASES, ids=CASE_IDS
)
def test_regeneration_is_byte_identical(
    name: str, modality: str, classification: str, dtype_name: str, domain: str, tmp_path: Path
) -> None:
    spv.write_fixtures(tmp_path)
    committed = FIXTURES_ROOT / name
    regenerated = tmp_path / name
    file_names = sorted(path.name for path in (committed / "instances").glob("*.dcm"))
    assert file_names == [f"{name}-{index}.dcm" for index in (1, 2, 3)]
    for file_name in file_names:
        assert (regenerated / "instances" / file_name).read_bytes() == (
            committed / "instances" / file_name
        ).read_bytes(), file_name
    assert (regenerated / "pixels.json").read_text(encoding="utf-8") == (
        committed / "pixels.json"
    ).read_text(encoding="utf-8")
    assert (regenerated / "fixture.json").read_text(encoding="utf-8") == (
        committed / "fixture.json"
    ).read_text(encoding="utf-8")
    # The captured worker evidence is path-independent, so it must reproduce too.
    assert _load_json(regenerated / "expected-geometry.json") == _load_json(
        committed / "expected-geometry.json"
    )


@pytest.mark.parametrize(
    ("name", "modality", "classification", "dtype_name", "domain"), CASES, ids=CASE_IDS
)
def test_payload_matches_committed_pixels_and_dicom(
    name: str, modality: str, classification: str, dtype_name: str, domain: str
) -> None:
    directory = FIXTURES_ROOT / name
    pixels = _load_json(directory / "pixels.json")
    assert list(pixels) == PAYLOAD_KEYS
    assert pixels["encoding"] == "base64"
    assert pixels["byteOrder"] == "little"
    assert pixels["dtype"] == dtype_name
    assert pixels["scalarDataDomain"] == domain
    assert pixels["signedness"] == ("signed" if dtype_name == "int16" else "not-applicable")
    assert pixels["samplesPerPixel"] == 1
    assert pixels["bitsAllocated"] == 16
    assert pixels["bitsStored"] == 16
    assert pixels["highBit"] == 15
    assert pixels["photometricInterpretation"] == "MONOCHROME2"
    assert pixels["dimensions"] == [spv.COLUMNS, spv.ROWS, spv.SLICES]

    numpy_dtype = _numpy_dtype(dtype_name)
    decoded = base64.b64decode(pixels["values"])
    assert len(decoded) == spv.COLUMNS * spv.ROWS * spv.SLICES * numpy_dtype.itemsize

    files = sorted((directory / "instances").glob("*.dcm"))
    assert len(files) == spv.SLICES
    slices: list[Any] = []
    for path in files:
        dataset = pydicom.dcmread(str(path))
        assert int(dataset.Rows) == spv.ROWS
        assert int(dataset.Columns) == spv.COLUMNS
        assert int(dataset.SamplesPerPixel) == 1
        assert str(dataset.PhotometricInterpretation) == "MONOCHROME2"
        assert int(dataset.BitsAllocated) == pixels["bitsAllocated"]
        assert int(dataset.BitsStored) == pixels["bitsStored"]
        assert int(dataset.HighBit) == pixels["highBit"]
        assert int(dataset.PixelRepresentation) == 1
        assert float(dataset.RescaleSlope) == pytest.approx(pixels["rescale"]["slope"])
        assert float(dataset.RescaleIntercept) == pytest.approx(pixels["rescale"]["intercept"])
        slices.append(dataset.pixel_array)

    stored = np.stack(slices).astype(np.float64)
    rescaled = stored * float(pixels["rescale"]["slope"]) + float(pixels["rescale"]["intercept"])
    declared = rescaled.astype(numpy_dtype)
    assert declared.size * numpy_dtype.itemsize == len(decoded)
    assert declared.tobytes() == decoded
    assert base64.b64encode(declared.tobytes()).decode("ascii") == pixels["values"]


@pytest.mark.parametrize(
    ("name", "modality", "classification", "dtype_name", "domain"), CASES, ids=CASE_IDS
)
def test_declared_rescale_is_load_bearing(
    name: str, modality: str, classification: str, dtype_name: str, domain: str
) -> None:
    """Negative control: a wrong rescale must not reproduce the committed payload."""
    pixels = _load_json(FIXTURES_ROOT / name / "pixels.json")
    files = sorted((FIXTURES_ROOT / name / "instances").glob("*.dcm"))
    stored = np.stack([pydicom.dcmread(str(path)).pixel_array for path in files]).astype(np.float64)
    wrong = stored * 2.0 + 7.0
    wrong_bytes = wrong.astype(_numpy_dtype(dtype_name)).tobytes()
    assert base64.b64encode(wrong_bytes).decode("ascii") != pixels["values"]


@pytest.mark.parametrize(
    ("name", "modality", "classification", "dtype_name", "domain"), CASES, ids=CASE_IDS
)
def test_worker_geometry_evidence_is_accepted(
    name: str, modality: str, classification: str, dtype_name: str, domain: str
) -> None:
    directory = FIXTURES_ROOT / name
    fixture = _load_json(directory / "fixture.json")
    response = _call(
        DICOM_GEOMETRY_METHOD,
        {
            "locator": _locator(directory / "instances"),
            "seriesInstanceUID": fixture["seriesInstanceUID"],
        },
    )
    assert "result" in response, response
    result = response["result"]
    assert result == _load_json(directory / "expected-geometry.json")
    assert result["status"] == "computed"
    assert result["modality"] == modality
    assert result["instanceCount"] == spv.SLICES
    assert result["diagnostics"] == []
    geometry = result["geometry"]
    assert geometry["dimensions"] == [spv.COLUMNS, spv.ROWS, spv.SLICES]
    assert geometry["sliceNormal"] == [0.0, 0.0, 1.0]
    assert geometry["slicePositionsLpsMm"] == [
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 2.0],
        [0.0, 0.0, 4.0],
    ]
    assert str(geometry["geometricDigest"]).startswith("sha256:")


@pytest.mark.parametrize(
    ("name", "modality", "classification", "dtype_name", "domain"), CASES, ids=CASE_IDS
)
def test_inspect_classifies_series_as_supported(
    name: str, modality: str, classification: str, dtype_name: str, domain: str
) -> None:
    directory = FIXTURES_ROOT / name
    fixture = _load_json(directory / "fixture.json")
    response = _call(DICOM_INSPECT_METHOD, {"locator": _locator(directory / "instances")})
    assert "result" in response, response
    result = response["result"]
    assert result["skippedFileCount"] == 0
    assert result["diagnostics"] == []
    studies = result["studies"]
    assert len(studies) == 1
    series = studies[0]["series"]
    assert len(series) == 1
    entry = series[0]
    assert entry["classification"] == classification
    assert entry["modality"] == modality
    assert entry["supported"] is True
    assert entry["reason"] is None
    assert entry["instanceCount"] == spv.SLICES
    assert fixture["classification"] == {"supported": True, "reason": None}
    assert fixture["modality"] == modality
    assert fixture["availability"] == "online"
    assert fixture["instanceCount"] == spv.SLICES


def _mutated_instances(name: str, tmp_path: Path) -> Path:
    """Copy the committed slices, dropping the tag that grants classification."""
    target = tmp_path / "instances"
    target.mkdir()
    for path in sorted((FIXTURES_ROOT / name / "instances").glob("*.dcm")):
        dataset = pydicom.dcmread(str(path))
        if name == "ct-axial":
            dataset.ImageType = ["ORIGINAL", "PRIMARY"]
        else:
            dataset.CorrectedImage = ["DECY", "SCAT"]
        dataset.save_as(str(target / path.name), enforce_file_format=True)
    return target


@pytest.mark.parametrize(
    ("name", "modality", "classification", "dtype_name", "domain"), CASES, ids=CASE_IDS
)
def test_mutated_classification_tags_fail_closed(
    name: str, modality: str, classification: str, dtype_name: str, domain: str, tmp_path: Path
) -> None:
    """Negative control: the declared classification tags are load-bearing."""
    response = _call(DICOM_INSPECT_METHOD, {"locator": _locator(_mutated_instances(name, tmp_path))})
    assert "result" in response, response
    entry = response["result"]["studies"][0]["series"][0]
    assert entry["supported"] is False
    assert entry["classification"] not in {classification}
    if name == "ct-axial":
        assert entry["reason"] == "non-primary-image-type"
    else:
        assert entry["reason"] == "attenuation-correction-missing"
