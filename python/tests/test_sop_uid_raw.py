"""Fail-closed raw ``SOPInstanceUID`` capture evidence (pydicom parse boundary).

Positive and negative tests for :mod:`dicom.sop_uid_raw` and its integration in
:mod:`dicom.source_fingerprint`. The load-bearing negative is a real committed
fixture whose raw SOP value is mutated to the non-conformant single trailing
space: pydicom silently normalizes it to the valid UID, while NuClear refuses it
before any descriptor is published. Synthetic/committed fixtures only; no
patient data.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path
from typing import Any

import pydicom
import pytest
from pydicom import config
from pydicom.dataelem import RawDataElement
from test_volume_transport import _call, _error, _load_fingerprint, _store

from dicom.locators import SourceLocator
from dicom.sop_uid_digest import compute_sop_instance_uids_hash, is_valid_sop_instance_uid
from dicom.sop_uid_raw import (
    SopUidRawRefusal,
    read_raw_sop_instance_uid,
    validate_raw_sop_uid_bytes,
)
from dicom.source_fingerprint import load_series_source
from worker.protocol import DICOM_VOLUME_METHOD, VOLUME_DECODE_FAILED, ProtocolError

FIXTURES_ROOT = Path(__file__).resolve().parents[2] / "tests" / "rendering" / "fixtures" / "volumes"
CT_INSTANCES = FIXTURES_ROOT / "ct-axial" / "instances"
CT_SERIES = "1.2.826.0.1.3680043.10.5001.2"
CT_FILES = sorted(CT_INSTANCES.glob("*.dcm"))
_SOP_HEADER = b"\x08\x00\x18\x00UI"
pytestmark = pytest.mark.filterwarnings("ignore:Invalid value for VR UI:UserWarning")


def _sop_offset(raw: bytes) -> int:
    offset = raw.find(_SOP_HEADER)
    assert offset != -1, "committed fixture must carry an explicit UI SOPInstanceUID"
    return offset


def _sop_value(raw: bytes) -> bytes:
    offset = _sop_offset(raw)
    length = int.from_bytes(raw[offset + 6:offset + 8], "little")
    return raw[offset + 8:offset + 8 + length]


def _rewrite_sop_value(raw: bytes, value: bytes) -> bytes:
    offset = _sop_offset(raw)
    length = int.from_bytes(raw[offset + 6:offset + 8], "little")
    return raw[:offset + 6] + len(value).to_bytes(2, "little") + value + raw[offset + 8 + length:]


def _duplicate_sop_element(raw: bytes) -> bytes:
    offset = _sop_offset(raw)
    length = int.from_bytes(raw[offset + 6:offset + 8], "little")
    end = offset + 8 + length
    return raw[:end] + raw[offset:end] + raw[end:]


def _mutate_sop(raw: bytes, kind: str) -> bytes:
    value = _sop_value(raw)
    if kind == "duplicate":
        return _duplicate_sop_element(raw)
    if kind == "space-pad":
        return _rewrite_sop_value(raw, value[:-1] + b" ")
    if kind == "leading-space":
        return _rewrite_sop_value(raw, b" " + value[1:])
    if kind == "embedded-nul":
        middle = bytearray(value)
        middle[3] = 0x00
        return _rewrite_sop_value(raw, bytes(middle))
    if kind == "bom":
        return _rewrite_sop_value(raw, b"\xef\xbb\xbf" + value[3:])
    if kind == "non-ascii":
        return _rewrite_sop_value(raw, b"\xc3\xa9" + value[2:])
    if kind == "invalid-syntax":
        return _rewrite_sop_value(raw, b"01.2.3" + value[6:])
    if kind == "odd-no-pad":
        return _rewrite_sop_value(raw, value[:-1])
    if kind == "double-pad":
        return _rewrite_sop_value(raw, value + b"\x00")
    raise AssertionError(f"unknown mutation '{kind}'")


def _mutated_series(tmp_path: Path, kind: str) -> Path:
    directory = tmp_path / kind
    directory.mkdir()
    for path in CT_FILES:
        (directory / path.name).write_bytes(path.read_bytes())
    target = directory / CT_FILES[0].name
    target.write_bytes(_mutate_sop(target.read_bytes(), kind))
    return directory


@pytest.mark.parametrize(
    ("raw_value", "expected"),
    [
        (b"1\x00", "1"),
        (b"1.2.3\x00", "1.2.3"),
        (b"1.2345", "1.2345"),
        (b"1.2.840.10008.5.1.4.1.1.128\x00", "1.2.840.10008.5.1.4.1.1.128"),
    ],
)
def test_raw_uid_accepts_only_exact_ascii_with_conformant_nul(raw_value: bytes, expected: str) -> None:
    assert validate_raw_sop_uid_bytes(raw_value) == expected
    assert is_valid_sop_instance_uid(expected)


@pytest.mark.parametrize(
    "raw_value",
    [
        None,
        b"",
        b" ",
        b"1.2.3 ",
        b" 1.2.3",
        b"1.2.3\x00\x00",
        b"12\x00",
        b"1.23\x00\x00",
        b"\xef\xbb\xbf1.2",
        b"\xc3\xa91.2",
        b"01.2",
        b"1..2",
        b".1.2",
        b"1.2.",
        b"x" * 65,
    ],
)
def test_raw_uid_refuses_non_conformant_encodings(raw_value: object) -> None:
    with pytest.raises(SopUidRawRefusal):
        validate_raw_sop_uid_bytes(raw_value)


def test_committed_fixture_raw_uid_matches_pydicom_and_digest_bytes() -> None:
    for path in CT_FILES:
        logical = read_raw_sop_instance_uid(path.read_bytes())
        parsed = str(pydicom.dcmread(path, stop_before_pixels=True).SOPInstanceUID)
        assert logical == parsed
        assert is_valid_sop_instance_uid(logical)
        # The ratified digest input is the parsed logical UTF-8 UID, not the pad.
        assert compute_sop_instance_uids_hash([logical]) == compute_sop_instance_uids_hash([parsed])


def test_pydicom_would_silently_accept_the_space_pad_raw_uid_is_refused() -> None:
    """The reviewer's parse-boundary concern: pydicom trims a space pad silently."""
    raw = CT_FILES[0].read_bytes()
    space_padded = _mutate_sop(raw, "space-pad")
    parsed = str(pydicom.dcmread(io.BytesIO(space_padded), stop_before_pixels=True).SOPInstanceUID)
    assert parsed == _sop_value(raw)[:-1].decode("ascii")
    assert is_valid_sop_instance_uid(parsed)
    with pytest.raises(SopUidRawRefusal):
        read_raw_sop_instance_uid(space_padded)


@pytest.mark.parametrize(
    "kind",
    ["space-pad", "leading-space", "embedded-nul", "bom", "non-ascii",
     "invalid-syntax", "odd-no-pad", "double-pad"],
)
def test_mutated_fixture_raw_uid_is_refused_before_hydration(kind: str) -> None:
    with pytest.raises(SopUidRawRefusal):
        read_raw_sop_instance_uid(_mutate_sop(CT_FILES[0].read_bytes(), kind))


def test_duplicate_raw_sop_instance_uid_tag_is_refused() -> None:
    with pytest.raises(SopUidRawRefusal, match="exactly once"):
        read_raw_sop_instance_uid(_duplicate_sop_element(CT_FILES[0].read_bytes()))


@pytest.mark.parametrize("kind", ["space-pad", "duplicate"])
def test_load_series_source_refuses_bad_raw_uid_in_local_folder(tmp_path: Path, kind: str) -> None:
    with pytest.raises(ProtocolError) as excinfo:
        load_series_source(
            SourceLocator(kind="local-folder", path=str(_mutated_series(tmp_path, kind))), CT_SERIES)
    assert excinfo.value.code == VOLUME_DECODE_FAILED == -32013
    assert excinfo.value.data["reason"] == "decode-error"
    assert "seriesInstanceUID" in excinfo.value.data


def test_load_series_source_refuses_space_padded_uid_in_archive(tmp_path: Path) -> None:
    archive = tmp_path / "series.zip"
    with zipfile.ZipFile(archive, "w") as bundle:
        for path in sorted(_mutated_series(tmp_path, "space-pad").glob("*.dcm")):
            bundle.write(path, arcname=path.name)
    with pytest.raises(ProtocolError) as excinfo:
        load_series_source(
            SourceLocator(kind="archive-entry", archive_path=str(archive)), CT_SERIES)
    assert excinfo.value.code == VOLUME_DECODE_FAILED
    assert excinfo.value.data["reason"] == "decode-error"


def test_volume_operation_refuses_before_descriptor_publication(tmp_path: Path) -> None:
    fingerprint = _load_fingerprint("ct-axial")
    store = _store(tmp_path / "volumes")
    params: dict[str, Any] = {
        "locator": {"kind": "local-folder", "path": str(_mutated_series(tmp_path, "space-pad"))},
        "seriesInstanceUID": CT_SERIES,
        "expectedFingerprint": fingerprint,
        "expectedFrameOfReferenceUID": fingerprint["frameOfReferenceUID"],
    }
    error = _error(_call(store, DICOM_VOLUME_METHOD, params))
    assert error["code"] == VOLUME_DECODE_FAILED == -32013
    assert error["data"]["reason"] == "decode-error"
    assert list(store.root.iterdir()) == []


_SENTINEL_CALLBACK_KWARGS: list[dict[str, Any]] = []


def _sentinel_callback(raw_elem: RawDataElement, **kwargs: Any) -> RawDataElement:
    _SENTINEL_CALLBACK_KWARGS.append(dict(kwargs))
    return raw_elem


def test_pre_existing_pydicom_callback_configuration_is_restored() -> None:
    original_callback = config.data_element_callback
    original_kwargs = dict(config.data_element_callback_kwargs)
    _SENTINEL_CALLBACK_KWARGS.clear()
    config.data_element_callback = _sentinel_callback
    config.data_element_callback_kwargs = {"sentinel": True}
    try:
        assert read_raw_sop_instance_uid(CT_FILES[0].read_bytes()) == _sop_value(
            CT_FILES[0].read_bytes()).decode("ascii").rstrip("\x00")
        with pytest.raises(SopUidRawRefusal):
            read_raw_sop_instance_uid(_mutate_sop(CT_FILES[0].read_bytes(), "space-pad"))
        assert config.data_element_callback is _sentinel_callback
        assert config.data_element_callback_kwargs == {"sentinel": True}
        assert _SENTINEL_CALLBACK_KWARGS
        assert all(call.get("sentinel") is True for call in _SENTINEL_CALLBACK_KWARGS)
    finally:
        config.data_element_callback = original_callback
        config.data_element_callback_kwargs = original_kwargs
