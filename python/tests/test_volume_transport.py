"""ADR-013 transport + lifecycle evidence (2B.3b, Python half).

``nuclear.dicom.volume``/``nuclear.volume.release`` over the committed CT volume,
plus TTL/cleanup/restart and atomic-publication coverage; no patient data.
"""

from __future__ import annotations

import hashlib
import json
import os
import stat
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, cast

import numpy as np
import pydicom
import pytest
from pydicom.dataset import Dataset

from dicom.locators import SourceLocator
from dicom.volume_operations import prepare_series
from dicom.volume_payload import enforce_registration_working_set, enforce_volume_limits
from dicom.volume_store import VolumeStore
from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import (
    DICOM_VOLUME_METHOD, INVALID_PARAMS, VOLUME_DECODE_FAILED,
    VOLUME_FINGERPRINT_MISMATCH, VOLUME_LIMIT_EXCEEDED,
    VOLUME_RELEASE_METHOD, VOLUME_TRANSPORT_INTEGRITY, ProtocolError,
)

FROZEN = datetime(2026, 9, 22, 12, 0, 0, tzinfo=timezone.utc)
FIXTURES_ROOT = Path(__file__).resolve().parents[2] / "tests" / "rendering" / "fixtures" / "volumes"
CT_INSTANCES = FIXTURES_ROOT / "ct-axial" / "instances"
CT_STUDY, CT_SERIES, CT_FRAME = (
    "1.2.826.0.1.3680043.10.5001.1", "1.2.826.0.1.3680043.10.5001.2",
    "1.2.826.0.1.3680043.10.5001.4")
FLOAT32_BYTES = 4


def _store(root: Path, *, ttl_seconds: int = 300, clock: Any = None) -> VolumeStore:
    return VolumeStore(root, clock=clock if clock is not None else (lambda: FROZEN), ttl_seconds=ttl_seconds)


def _call(store: VolumeStore, method: str, params: dict[str, Any]) -> dict[str, Any]:
    return process_record(json.dumps(
        {"jsonrpc": "2.0", "id": "req-vol", "protocolVersion": "1.0", "method": method, "params": params}),
        0, build_dispatcher(now=lambda: FROZEN, volume_store=store))


def _load_fingerprint(name: str) -> dict[str, Any]:
    return cast(dict[str, Any], json.loads((FIXTURES_ROOT / name / "expected-fingerprint.json").read_text()))


def _volume_params(series_uid: str = CT_SERIES) -> dict[str, Any]:
    fingerprint = _load_fingerprint("ct-axial")
    return {"locator": {"kind": "local-folder", "path": str(CT_INSTANCES)},
            "seriesInstanceUID": series_uid, "expectedFingerprint": fingerprint,
            "expectedFrameOfReferenceUID": fingerprint["frameOfReferenceUID"]}


def _error(response: dict[str, Any]) -> dict[str, Any]:
    assert "result" not in response, response
    error: dict[str, Any] = response["error"]
    return error


def _committed_ct_payload() -> bytes:
    slices = [pydicom.dcmread(str(path)) for path in sorted(CT_INSTANCES.glob("*.dcm"))]
    slices.sort(key=lambda dataset: float(dataset.ImagePositionPatient[2]))
    stored = np.stack([dataset.pixel_array for dataset in slices]).astype(np.float64)
    rescaled = stored * float(slices[0].RescaleSlope) + float(slices[0].RescaleIntercept)
    return np.ascontiguousarray(rescaled.astype("<f4")).tobytes()


def test_volume_descriptor_payload_hash_and_byte_length(tmp_path: Path) -> None:
    store = _store(tmp_path / "volumes")
    response = _call(store, DICOM_VOLUME_METHOD, _volume_params())
    assert "result" in response, response
    descriptor = response["result"]["descriptor"]
    assert set(descriptor) == {
        "handle", "fileName", "byteOrder", "dtype", "signedness", "samplesPerPixel",
        "bitsAllocated", "bitsStored", "highBit", "photometricInterpretation",
        "scalarDataDomain", "rescale", "dimensions", "byteLength", "contentHash",
        "geometricDigest", "ttlSeconds", "publishedAt", "correlation"}
    assert len(descriptor["handle"]) == 32 and int(descriptor["handle"], 16) >= 0
    assert "/" not in descriptor["fileName"] and descriptor["fileName"].endswith(".bin")
    assert (descriptor["byteOrder"], descriptor["dtype"], descriptor["signedness"]) == (
        "little", "float32", "not-applicable")
    assert (descriptor["samplesPerPixel"], descriptor["bitsAllocated"], descriptor["bitsStored"],
            descriptor["highBit"], descriptor["photometricInterpretation"]) == (
        1, 16, 16, 15, "MONOCHROME2")
    assert (descriptor["scalarDataDomain"], descriptor["rescale"], descriptor["dimensions"],
            descriptor["byteLength"], descriptor["ttlSeconds"]) == (
        "rescaled-hu", {"slope": 1.0, "intercept": -1024.0}, [4, 4, 3], 192, 300)
    assert descriptor["byteLength"] == 4 * 4 * 3 * FLOAT32_BYTES
    assert descriptor["publishedAt"] == "2026-09-22T12:00:00.000000Z"
    fingerprint = _load_fingerprint("ct-axial")
    geometry = json.loads((FIXTURES_ROOT / "ct-axial" / "expected-geometry.json").read_text())
    assert descriptor["geometricDigest"] == geometry["geometry"]["geometricDigest"]
    assert descriptor["correlation"] == {
        "studyInstanceUID": CT_STUDY, "seriesInstanceUID": CT_SERIES, "instanceCount": 3,
        "frameOfReferenceUID": CT_FRAME, "totalBytes": fingerprint["totalBytes"],
        "contentDigest": fingerprint["contentDigest"],
        "geometricDigest": geometry["geometry"]["geometricDigest"],
        "sopInstanceUIDsHash": fingerprint["sopInstanceUIDsHash"]}
    assert descriptor["contentHash"] != descriptor["correlation"]["contentDigest"]

    expected = _committed_ct_payload()
    raw = store.read_payload(descriptor["handle"])
    assert len(raw) == descriptor["byteLength"] == len(expected)
    assert "sha256:" + hashlib.sha256(raw).hexdigest() == descriptor["contentHash"]
    assert raw == expected
    files = list(store.root.iterdir())
    assert [path.name for path in files] == [descriptor["fileName"]]
    assert stat.S_IMODE(files[0].stat().st_mode) == 0o600
    assert stat.S_IMODE(store.root.stat().st_mode) == 0o700


def test_ttl_boundary_release_and_single_owner(tmp_path: Path) -> None:
    now = [FROZEN]
    store = _store(tmp_path / "volumes", clock=lambda: now[0])
    handle = _call(store, DICOM_VOLUME_METHOD, _volume_params())["result"]["descriptor"]["handle"]
    now[0] = FROZEN + timedelta(seconds=299, microseconds=999000)
    assert store.read_payload(handle)  # strictly before the 300 s boundary
    now[0] = FROZEN + timedelta(seconds=300)
    with pytest.raises(ProtocolError) as expired:
        store.release(handle)
    assert expired.value.data["reason"] == "expired-handle"
    assert list(store.root.iterdir()) == []

    fresh = _store(tmp_path / "fresh")
    fresh_handle = _call(fresh, DICOM_VOLUME_METHOD, _volume_params())["result"]["descriptor"]["handle"]
    assert fresh.release(fresh_handle) is True
    assert fresh.release(fresh_handle) is False      # idempotent no-op
    assert fresh.release("f" * 32) is False          # unknown handle no-op
    with pytest.raises(ProtocolError) as released:
        fresh.read_payload(fresh_handle)
    assert released.value.data["reason"] == "already-released"
    with pytest.raises(ProtocolError) as foreign:
        _store(tmp_path / "other").read_payload(fresh_handle)
    assert foreign.value.data["reason"] == "unknown-handle"
    assert _call(fresh, VOLUME_RELEASE_METHOD, {"handle": fresh_handle})["result"]["status"] == "noop"


@pytest.mark.parametrize(
    ("mutation", "reason"),
    [("truncate", "file-short"), ("extend", "file-long"),
     ("corrupt", "hash-mismatch"), ("remove", "file-missing")],
)
def test_transport_integrity_refusals(tmp_path: Path, mutation: str, reason: str) -> None:
    store = _store(tmp_path / "volumes")
    descriptor = _call(store, DICOM_VOLUME_METHOD, _volume_params())["result"]["descriptor"]
    path = store.root / descriptor["fileName"]
    if mutation == "truncate":
        path.write_bytes(path.read_bytes()[:-1])
    elif mutation == "extend":
        path.write_bytes(path.read_bytes() + b"\x00")
    elif mutation == "corrupt":
        data = bytearray(path.read_bytes())
        data[0] ^= 0xFF
        path.write_bytes(bytes(data))
    else:
        path.unlink()
    with pytest.raises(ProtocolError) as excinfo:
        store.read_payload(descriptor["handle"])
    assert excinfo.value.code == VOLUME_TRANSPORT_INTEGRITY
    assert excinfo.value.data["reason"] == reason


def _set_expected(params: dict[str, Any], field: str, value: Any) -> None:
    target = params["expectedFingerprint"] if field in params["expectedFingerprint"] else params
    target[field] = value


def test_expected_fingerprint_required_and_mismatch_fails_closed(tmp_path: Path) -> None:
    store = _store(tmp_path / "volumes")
    for field in ("expectedFingerprint", "expectedFrameOfReferenceUID"):
        params = _volume_params()
        params.pop(field)
        assert _error(_call(store, DICOM_VOLUME_METHOD, params))["code"] == INVALID_PARAMS
    for field, value, reason in (
        ("contentDigest", "sha256:" + "0" * 64, "content-digest"),
        ("instanceCount", 9, "instance-count"),
        ("expectedFrameOfReferenceUID", "9.9.9", "frame-of-reference"),
    ):
        params = _volume_params()
        _set_expected(params, field, value)
        error = _error(_call(store, DICOM_VOLUME_METHOD, params))
        assert error["code"] == VOLUME_FINGERPRINT_MISMATCH
        assert error["data"]["reason"] == reason
    assert list(store.root.iterdir()) == []  # no descriptor on mismatch


def test_limits_preflight_and_resident_cap(tmp_path: Path) -> None:
    for kwargs, reason in (({"max_voxels": 5}, "voxel-limit"), ({"max_bytes": 10}, "payload-limit")):
        with pytest.raises(ProtocolError) as excinfo:
            enforce_volume_limits(10, 100, "1.2.3", **kwargs)
        assert (excinfo.value.code, excinfo.value.data["reason"]) == (VOLUME_LIMIT_EXCEEDED, reason)
    with pytest.raises(ProtocolError) as working:
        enforce_registration_working_set([10, 10], "1.2.3", budget=1)
    assert (working.value.code, working.value.data["reason"]) == (
        VOLUME_LIMIT_EXCEEDED, "working-set-limit")

    store = _store(tmp_path / "volumes")
    first = _call(store, DICOM_VOLUME_METHOD, _volume_params())["result"]["descriptor"]
    _call(store, DICOM_VOLUME_METHOD, _volume_params())
    error = _error(_call(store, DICOM_VOLUME_METHOD, _volume_params()))
    assert error["data"]["reason"] == "tracked-payload-limit"
    store.release(first["handle"])
    assert "result" in _call(store, DICOM_VOLUME_METHOD, _volume_params())


def _mutate(dataset: Dataset, field: str, value: Any) -> None:
    if value is None:
        delattr(dataset, field)
    else:
        setattr(dataset, field, value)


@pytest.mark.parametrize(
    ("label", "field", "value", "reason"),
    [("multi-sample", "SamplesPerPixel", 2, "unsupported-pixel-representation"),
     ("non-monochrome", "PhotometricInterpretation", "RGB", "unsupported-pixel-representation"),
     ("missing-bits-stored", "BitsStored", None, "missing-pixel-format")],
)
def test_unsupported_missing_and_multi_sample_pixel_formats(
    tmp_path: Path, label: str, field: str, value: Any, reason: str
) -> None:
    directory = tmp_path / label
    directory.mkdir()
    for path in sorted(CT_INSTANCES.glob("*.dcm")):
        dataset = pydicom.dcmread(str(path))
        _mutate(dataset, field, value)
        dataset.save_as(str(directory / path.name), enforce_file_format=True)
    error = _error(_call(
        _store(tmp_path / f"store-{label}"), DICOM_VOLUME_METHOD,
        {"locator": {"kind": "local-folder", "path": str(directory)},
         "seriesInstanceUID": CT_SERIES, "expectedFingerprint": _load_fingerprint("ct-axial"),
         "expectedFrameOfReferenceUID": CT_FRAME}))
    assert error["code"] == VOLUME_DECODE_FAILED
    assert error["data"]["reason"] == reason


def test_atomic_write_handles_partial_writes_and_leaves_no_false_descriptor(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = _store(tmp_path / "partial")
    real_write = os.write
    monkeypatch.setattr("dicom.volume_store.os.write", lambda fd, data: real_write(fd, bytes(data)[:1]))
    descriptor = _call(store, DICOM_VOLUME_METHOD, _volume_params())["result"]["descriptor"]
    monkeypatch.undo()
    assert store.read_payload(descriptor["handle"]) == _committed_ct_payload()

    def _fail_replace(source: object, target: object) -> None:
        raise OSError("replace failed")

    volume = prepare_series(SourceLocator(kind="local-folder", path=str(CT_INSTANCES)), CT_SERIES).decode()
    monkeypatch.setattr("dicom.volume_store.os.replace", _fail_replace)
    failing = _store(tmp_path / "failing")
    with pytest.raises(OSError):
        failing.publish(volume)
    assert failing.tracked_bytes() == 0
    assert list(failing.root.iterdir()) == []
