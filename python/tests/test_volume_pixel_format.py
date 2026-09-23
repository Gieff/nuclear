"""Focused ADR-013 §3/§8 tests for the pixel-format/transfer-syntax boundary.

The required ``SamplesPerPixel`` tag is never defaulted and the declared
``TransferSyntaxUID`` must be native/uncompressed: a missing tag is
``missing-pixel-format``, a compressed syntax is
``unsupported-pixel-representation`` and malformed transfer-syntax metadata is
``decode-error`` — every case a typed ``-32013`` raised before ``pixel_array``
(never a leaked ``ValueError``/``TypeError`` -> ``-32603``).

Both ``RescaleSlope``/``RescaleIntercept`` absent is raw ``stored-values`` with
no implicit transform; a partial, malformed or non-finite pair likewise fails
closed as ``-32013``. Explicit scaling and native raw fixtures keep their exact
declared behaviour.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

import numpy as np
import pydicom
import pytest
from numpy.typing import NDArray
from pydicom.dataset import Dataset
from pydicom.encaps import encapsulate
from pydicom.uid import JPEGBaseline8Bit, UID

from dicom.locators import SourceLocator
from dicom.volume_operations import _pixel_format, _rescale, prepare_series
from dicom.volume_store import VolumeStore
from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import DICOM_VOLUME_METHOD, ProtocolError, VOLUME_DECODE_FAILED

FROZEN = datetime(2026, 9, 23, 0, 0, 0, tzinfo=timezone.utc)
FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "rendering" / "fixtures" / "volumes"
CT_INSTANCES = FIXTURES / "ct-axial" / "instances"
CT_SERIES = "1.2.826.0.1.3680043.10.5001.2"


def _locator(path: Path) -> SourceLocator:
    return SourceLocator(kind="local-folder", path=str(path))


def _mutated_dir(tmp_path: Path, mutate: Callable[[Dataset], None]) -> Path:
    """Copy the CT fixture and apply ``mutate`` to every instance, then save."""
    directory = tmp_path / "instances"
    directory.mkdir()
    for path in sorted(CT_INSTANCES.glob("*.dcm")):
        dataset = pydicom.dcmread(str(path))
        mutate(dataset)
        dataset.save_as(str(directory / path.name), enforce_file_format=True)
    return directory


def _compressed_dir(tmp_path: Path) -> Path:
    """Copy the CT fixture and declare a compressed transfer syntax (no codec)."""
    directory = tmp_path / "compressed"
    directory.mkdir()
    for path in sorted(CT_INSTANCES.glob("*.dcm")):
        dataset = pydicom.dcmread(str(path))
        dataset.PixelData = encapsulate([dataset.PixelData])
        dataset.file_meta.TransferSyntaxUID = JPEGBaseline8Bit
        dataset.save_as(str(directory / path.name), enforce_file_format=True)
    return directory


def _volume_params(directory: Path) -> dict[str, Any]:
    """Build the real ``nuclear.dicom.volume`` params for a copied fixture."""
    fingerprint = cast(
        dict[str, Any],
        json.loads((FIXTURES / "ct-axial" / "expected-fingerprint.json").read_text()),
    )
    return {
        "locator": {"kind": "local-folder", "path": str(directory)},
        "seriesInstanceUID": CT_SERIES,
        "expectedFingerprint": fingerprint,
        "expectedFrameOfReferenceUID": fingerprint["frameOfReferenceUID"],
    }


def _volume_response(store: VolumeStore, directory: Path) -> dict[str, Any]:
    """Run ``nuclear.dicom.volume`` through the real envelope and dispatcher."""
    record = {
        "jsonrpc": "2.0", "id": "req-pixel-format", "protocolVersion": "1.0",
        "method": DICOM_VOLUME_METHOD,
        "params": _volume_params(directory),
    }
    return process_record(
        json.dumps(record), 0,
        build_dispatcher(now=lambda: FROZEN, volume_store=store))


def _worker_error(tmp_path: Path, directory: Path) -> dict[str, Any]:
    """Run ``nuclear.dicom.volume`` and return the fail-closed error payload."""
    response = _volume_response(VolumeStore(tmp_path / "volumes", clock=lambda: FROZEN), directory)
    assert "result" not in response, response
    return cast(dict[str, Any], response["error"])


def _forbid_pixel_array(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail loudly if any refused path reaches ``pixel_array`` before validation."""

    def _boom(_dataset: Dataset) -> Any:
        raise AssertionError("pixel_array was reached before pixel-format validation")

    monkeypatch.setattr(Dataset, "pixel_array", property(_boom))


def _stored_ct_volume() -> NDArray[Any]:
    slices = [pydicom.dcmread(str(path)) for path in sorted(CT_INSTANCES.glob("*.dcm"))]
    slices.sort(key=lambda dataset: float(dataset.ImagePositionPatient[2]))
    return np.stack([dataset.pixel_array for dataset in slices]).astype(np.dtype("<i2"))


def _drop_rescale(dataset: Dataset) -> None:
    for keyword in ("RescaleSlope", "RescaleIntercept"):
        if keyword in dataset:
            delattr(dataset, keyword)


def test_absent_both_rescale_tags_decode_as_raw_stored_values(tmp_path: Path) -> None:
    prepared = prepare_series(_locator(_mutated_dir(tmp_path, _drop_rescale)), CT_SERIES)
    assert prepared.format.scalar_data_domain == "stored-values"
    assert prepared.format.rescale is None
    assert prepared.format.dtype == "int16"
    volume = prepared.decode()
    assert volume.format.rescale is None
    assert volume.scalar.dtype == np.dtype("<i2")
    assert np.array_equal(volume.scalar, _stored_ct_volume())  # no rescale applied


def test_absent_samples_per_pixel_fails_closed_before_pixel_array(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _drop_samples(dataset: Dataset) -> None:
        delattr(dataset, "SamplesPerPixel")

    directory = _mutated_dir(tmp_path, _drop_samples)
    _forbid_pixel_array(monkeypatch)
    store = VolumeStore(tmp_path / "volumes", clock=lambda: FROZEN)
    response = _volume_response(store, directory)
    assert "result" not in response, response
    error = cast(dict[str, Any], response["error"])
    assert error["code"] == VOLUME_DECODE_FAILED  # never the internal -32603
    assert error["data"]["reason"] == "missing-pixel-format"
    assert store.tracked_bytes() == 0  # no payload/descriptor was emitted
    assert list(store.root.iterdir()) == []


def test_compressed_transfer_syntax_fails_closed_before_pixel_array(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory = _compressed_dir(tmp_path)
    _forbid_pixel_array(monkeypatch)
    store = VolumeStore(tmp_path / "volumes", clock=lambda: FROZEN)
    response = _volume_response(store, directory)
    assert "result" not in response, response
    error = cast(dict[str, Any], response["error"])
    assert error["code"] == VOLUME_DECODE_FAILED  # never the internal -32603
    assert error["data"]["reason"] == "unsupported-pixel-representation"
    assert store.tracked_bytes() == 0  # no payload/descriptor was emitted
    assert list(store.root.iterdir()) == []


def _first_ct_dataset() -> Dataset:
    """Read the first committed CT fixture instance as a metadata-only dataset."""
    return pydicom.dcmread(str(min(CT_INSTANCES.glob("*.dcm"))), stop_before_pixels=True)


def test_absent_transfer_syntax_metadata_fails_closed() -> None:
    dataset = _first_ct_dataset()
    del dataset.file_meta.TransferSyntaxUID
    with pytest.raises(ProtocolError) as excinfo:
        _pixel_format(dataset, CT_SERIES)
    assert excinfo.value.code == VOLUME_DECODE_FAILED
    assert excinfo.value.data["reason"] == "missing-pixel-format"


def test_malformed_transfer_syntax_metadata_fails_closed_as_decode_error() -> None:
    dataset = _first_ct_dataset()
    dataset.file_meta.TransferSyntaxUID = UID("1.2.3.4.5.6.7.89.9")  # not a transfer syntax
    with pytest.raises(ProtocolError) as excinfo:
        _pixel_format(dataset, CT_SERIES)
    assert excinfo.value.code == VOLUME_DECODE_FAILED  # never the internal -32603
    assert excinfo.value.data["reason"] == "decode-error"


def test_native_transfer_syntax_raw_fixture_unchanged() -> None:
    prepared = prepare_series(_locator(CT_INSTANCES), CT_SERIES)
    assert prepared.format.scalar_data_domain == "rescaled-hu"
    assert prepared.format.samples_per_pixel == 1
    assert prepared.decode().scalar.dtype == np.dtype("<f4")


@pytest.mark.parametrize("keyword", ["RescaleSlope", "RescaleIntercept"])
def test_partial_rescale_pair_fails_closed(tmp_path: Path, keyword: str) -> None:
    def _drop_one(dataset: Dataset) -> None:
        delattr(dataset, keyword)

    error = _worker_error(tmp_path, _mutated_dir(tmp_path, _drop_one))
    assert error["code"] == VOLUME_DECODE_FAILED  # not an internal -32603
    assert error["data"]["reason"] == "missing-pixel-format"


def test_non_scalar_rescale_value_fails_closed_as_decode_error(tmp_path: Path) -> None:
    def _multi(dataset: Dataset) -> None:
        dataset.RescaleSlope = [1.0, 2.0]  # non-scalar DS survives the DICOM round-trip

    error = _worker_error(tmp_path, _mutated_dir(tmp_path, _multi))
    assert error["code"] == VOLUME_DECODE_FAILED
    assert error["data"]["reason"] == "decode-error"


@pytest.mark.parametrize(
    ("keyword", "value"),
    [("RescaleSlope", float("nan")), ("RescaleSlope", float("inf")),
     ("RescaleIntercept", float("-inf"))],
)
def test_non_finite_rescale_value_fails_closed_as_decode_error(
    tmp_path: Path, keyword: str, value: float
) -> None:
    def _non_finite(dataset: Dataset) -> None:
        setattr(dataset, keyword, value)

    error = _worker_error(tmp_path, _mutated_dir(tmp_path, _non_finite))
    assert error["code"] == VOLUME_DECODE_FAILED
    assert error["data"]["reason"] == "decode-error"


def test_explicit_rescale_keeps_declared_behaviour() -> None:
    prepared = prepare_series(_locator(CT_INSTANCES), CT_SERIES)
    assert prepared.format.scalar_data_domain == "rescaled-hu"
    assert prepared.format.rescale == (1.0, -1024.0)
    expected = (_stored_ct_volume().astype(np.float64) - 1024.0).astype("<f4")
    volume = prepared.decode()
    assert volume.format.rescale == (1.0, -1024.0)
    assert np.array_equal(volume.scalar, expected)


def test_rescale_helper_closed_reason_contract() -> None:
    absent = Dataset()
    assert _rescale(absent, CT_SERIES) is None
    both = Dataset()
    both.RescaleSlope = 1.5
    both.RescaleIntercept = -2.5
    assert _rescale(both, CT_SERIES) == (1.5, -2.5)
    partial = Dataset()
    partial.RescaleSlope = 2.0
    with pytest.raises(ProtocolError) as missing:
        _rescale(partial, CT_SERIES)
    assert missing.value.code == VOLUME_DECODE_FAILED
    assert missing.value.data["reason"] == "missing-pixel-format"
    malformed = Dataset()
    malformed.RescaleSlope = [1.0, 2.0]
    malformed.RescaleIntercept = 0.0
    with pytest.raises(ProtocolError) as bad:
        _rescale(malformed, CT_SERIES)
    assert bad.value.data["reason"] == "decode-error"
    non_finite = Dataset()
    non_finite.RescaleSlope = float("nan")
    non_finite.RescaleIntercept = 0.0
    with pytest.raises(ProtocolError) as nan:
        _rescale(non_finite, CT_SERIES)
    assert nan.value.data["reason"] == "decode-error"
