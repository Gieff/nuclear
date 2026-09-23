"""Owner-ratified source-series contentDigest and correlation evidence (ADR-013 §5).

Unit and fixture evidence for :mod:`dicom.source_fingerprint`: the exact
length-delimited canonization (independently reimplemented here), raw-series
reading across folder/file-list/archive locators, and every closed ``-32015``
mismatch reason. Committed synthetic CT fixtures only; no patient data.
"""

from __future__ import annotations

import hashlib
import json
import struct
import zipfile
from pathlib import Path
from typing import cast

import pytest

from dicom.locators import SourceLocator
from dicom.source_fingerprint import (
    ObservedFingerprint,
    SourceDigestRefusal,
    compute_content_digest,
    load_series_source,
    require_expected_frame_of_reference,
    require_matching_fingerprint,
)
from dicom.volume_operations import prepare_series
from dicom.volume_payload import (
    ExpectedFingerprint,
    FingerprintSchemaError,
    parse_expected_fingerprint,
)
from test_volume_transport import _call, _error, _store, _volume_params
from worker.protocol import (
    DICOM_VOLUME_METHOD,
    INVALID_PARAMS,
    VOLUME_CLEANUP_FAILED,
    VOLUME_DECODE_FAILED,
    VOLUME_FINGERPRINT_MISMATCH,
    VOLUME_HANDLE_INVALID,
    ProtocolError,
)

FIXTURES_ROOT = Path(__file__).resolve().parents[2] / "tests" / "rendering" / "fixtures" / "volumes"
CT_INSTANCES = FIXTURES_ROOT / "ct-axial" / "instances"
CT_SERIES = "1.2.826.0.1.3680043.10.5001.2"
DOMAIN = b"NuClear-DICOM-Series-Content-v1"
FIXTURE_NAMES = ("ct-axial", "pt-axial", "pt-axial-coreg", "mi-fixed", "mi-moving")


def _expected_digest(records: list[tuple[str, bytes]]) -> str:
    """Independent reimplementation of the ratified canonization."""
    parts = b""
    for uid, raw in sorted(records, key=lambda item: item[0]):
        uid_bytes = uid.encode("utf-8")
        parts += struct.pack(">Q", len(DOMAIN)) + DOMAIN
        parts += struct.pack(">Q", len(uid_bytes)) + uid_bytes
        parts += struct.pack(">Q", len(raw)) + hashlib.sha256(raw).digest()
    return "sha256:" + hashlib.sha256(parts).hexdigest()


def _fingerprint(name: str) -> dict[str, object]:
    return cast(dict[str, object], json.loads((FIXTURES_ROOT / name / "expected-fingerprint.json").read_text()))


def _identity(name: str) -> dict[str, object]:
    """Read the committed fixture identity (``fixture.json``)."""
    return cast(dict[str, object], json.loads((FIXTURES_ROOT / name / "fixture.json").read_text()))


def test_digest_matches_independent_reimplementation_and_is_order_independent() -> None:
    records = [("1.2.3", b"alpha"), ("1.2.10", b"beta"), ("1.2.2", b"gamma")]
    assert compute_content_digest(records) == _expected_digest(records)
    assert compute_content_digest(list(reversed(records))) == compute_content_digest(records)
    assert compute_content_digest([("1.2.3", b"alpha")]) != _expected_digest(
        [("1.2.3", b"alpha\x00")]
    )


def test_digest_refuses_missing_or_duplicate_sop_identity() -> None:
    with pytest.raises(SourceDigestRefusal):
        compute_content_digest([("", b"alpha")])
    with pytest.raises(SourceDigestRefusal):
        compute_content_digest([("1.2.3", b"alpha"), ("1.2.3", b"beta")])


def test_load_series_source_folds_the_committed_ct_literal() -> None:
    source = load_series_source(SourceLocator(kind="local-folder", path=str(CT_INSTANCES)), CT_SERIES)
    fingerprint = _fingerprint("ct-axial")
    assert source.content_digest == fingerprint["contentDigest"]
    assert source.study_instance_uid == fingerprint["studyInstanceUID"]
    assert source.frame_of_reference_uid == fingerprint["frameOfReferenceUID"]
    assert source.instance_count == fingerprint["instanceCount"] == 3
    assert source.total_bytes == fingerprint["totalBytes"]
    assert all(item.raw_bytes == (CT_INSTANCES / f"ct-axial-{index}.dcm").read_bytes()
               for item, index in zip(source.instances, (1, 2, 3)))


def test_load_series_source_supports_file_list_and_archive(tmp_path: Path) -> None:
    files = [str(path) for path in sorted(CT_INSTANCES.glob("*.dcm"))]
    file_list = load_series_source(
        SourceLocator(kind="local-file-list", files=tuple(files)), CT_SERIES)
    assert file_list.content_digest == _fingerprint("ct-axial")["contentDigest"]

    archive = tmp_path / "series.zip"
    with zipfile.ZipFile(archive, "w") as bundle:
        for path in sorted(CT_INSTANCES.glob("*.dcm")):
            bundle.write(path, arcname=path.name)
    archived = load_series_source(
        SourceLocator(kind="archive-entry", archive_path=str(archive)), CT_SERIES)
    assert archived.content_digest == file_list.content_digest
    assert archived.instance_count == 3


def _prepared_fixture(name: str) -> ObservedFingerprint:
    """Run the worker-owned ``prepare_series`` and return its observed fingerprint."""
    locator = SourceLocator(kind="local-folder", path=str(FIXTURES_ROOT / name / "instances"))
    return prepare_series(locator, cast(str, _identity(name)["seriesInstanceUID"])).observed_fingerprint()


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_checked_in_fingerprint_is_derived_from_the_committed_fixture(name: str) -> None:
    """2B.3b: every committed expected-fingerprint.json must match its real DICOM series."""
    expected, identity, observed = _fingerprint(name), _identity(name), _prepared_fixture(name)
    assert observed.study_instance_uid == expected["studyInstanceUID"]
    assert observed.series_instance_uid == expected["seriesInstanceUID"]
    assert observed.instance_count == expected["instanceCount"]
    assert observed.content_digest == expected["contentDigest"]
    assert observed.geometric_digest == expected["geometricDigest"]
    assert observed.total_bytes == expected["totalBytes"]
    assert observed.frame_of_reference_uid == expected["frameOfReferenceUID"]
    assert observed.sop_instance_uids_hash == expected["sopInstanceUIDsHash"]
    assert observed.content_digest != observed.sop_instance_uids_hash
    # The expected values must belong to the same committed fixture identity.
    for key in ("studyInstanceUID", "seriesInstanceUID", "frameOfReferenceUID", "instanceCount"):
        if key in identity:
            assert identity[key] == expected[key], f"{name} fixture.json disagrees on {key}"


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_committed_fingerprint_rejects_a_tampered_content_digest(name: str) -> None:
    """Negative: the exact checked-in values are load-bearing, not vacuously accepted."""
    observed = _prepared_fixture(name)
    tampered = parse_expected_fingerprint(
        {**_fingerprint(name), "contentDigest": "sha256:" + "0" * 64}, f"tampered.{name}")
    with pytest.raises(ProtocolError) as excinfo:
        require_matching_fingerprint(observed, tampered, series_uid=observed.series_instance_uid)
    assert excinfo.value.code == VOLUME_FINGERPRINT_MISMATCH == -32015
    assert excinfo.value.data["reason"] == "content-digest"


def _observed() -> ObservedFingerprint:
    return ObservedFingerprint(
        study_instance_uid="1.2.3.4", series_instance_uid="1.2.3.4.5", instance_count=3,
        content_digest="sha256:" + "a" * 64, geometric_digest="sha256:" + "b" * 64,
        sop_instance_uids_hash="sha256:" + "c" * 64,
        total_bytes=100, frame_of_reference_uid="1.2.3.4.for")


def _expected(**overrides: object) -> ExpectedFingerprint:
    base: dict[str, object] = {
        "studyInstanceUID": "1.2.3.4", "seriesInstanceUID": "1.2.3.4.5", "instanceCount": 3,
        "contentDigest": "sha256:" + "a" * 64}
    base.update(overrides)
    return parse_expected_fingerprint(base, "expected")


def test_expected_fingerprint_is_matched_exactly() -> None:
    require_matching_fingerprint(_observed(), _expected(), series_uid="1.2.3.4.5")
    require_matching_fingerprint(
        _observed(), _expected(geometricDigest="sha256:" + "b" * 64, totalBytes=100),
        series_uid="1.2.3.4.5")


@pytest.mark.parametrize(
    ("overrides", "reason"),
    [
        ({"seriesInstanceUID": "9.9"}, "series"),
        ({"studyInstanceUID": "9.9"}, "series"),
        ({"instanceCount": 9}, "instance-count"),
        ({"contentDigest": "sha256:" + "0" * 64}, "content-digest"),
        ({"geometricDigest": "sha256:" + "0" * 64}, "geometric-digest"),
        ({"totalBytes": 1}, "content-digest"),
    ],
)
def test_fingerprint_mismatch_reasons(overrides: dict[str, object], reason: str) -> None:
    with pytest.raises(ProtocolError) as excinfo:
        require_matching_fingerprint(_observed(), _expected(**overrides), series_uid="1.2.3.4.5")
    assert excinfo.value.code == VOLUME_FINGERPRINT_MISMATCH == -32015
    assert excinfo.value.data["reason"] == reason


def test_sop_instance_uids_hash_is_computed_and_compared_only_when_present() -> None:
    observed = _observed()
    # Absent expected field: observation present, no comparison and no default.
    require_matching_fingerprint(observed, _expected(), series_uid="1.2.3.4.5")
    assert observed.sop_instance_uids_hash == "sha256:" + "c" * 64
    # Present and equal: accepted exactly.
    require_matching_fingerprint(
        observed, _expected(sopInstanceUIDsHash=observed.sop_instance_uids_hash),
        series_uid="1.2.3.4.5")
    # Present and different: fail closed as a ``series`` mismatch with safe digests.
    with pytest.raises(ProtocolError) as excinfo:
        require_matching_fingerprint(
            observed, _expected(sopInstanceUIDsHash="sha256:" + "d" * 64),
            series_uid="1.2.3.4.5")
    error = excinfo.value
    assert error.code == VOLUME_FINGERPRINT_MISMATCH == -32015
    assert error.data["reason"] == "series"
    assert error.data["expectedDigest"] == "sha256:" + "d" * 64
    assert error.data["observedDigest"] == observed.sop_instance_uids_hash
    assert set(error.data) == {
        "diagnostic", "reason", "seriesInstanceUID", "expectedDigest", "observedDigest"}
    assert "path" not in json.dumps(error.data).lower()


def test_expected_sop_instance_uids_hash_format_is_validated_as_schema(tmp_path: Path) -> None:
    for malformed in ("sha256:" + "A" * 64, "sha256:" + "0" * 63, "md5:" + "0" * 64, "sha256:xyz"):
        with pytest.raises(FingerprintSchemaError):
            _expected(sopInstanceUIDsHash=malformed)
    params = _volume_params()
    params["expectedFingerprint"]["sopInstanceUIDsHash"] = "sha256:" + "A" * 64
    error = _error(_call(_store(tmp_path / "schema"), DICOM_VOLUME_METHOD, params))
    assert error["code"] == INVALID_PARAMS == -32602


def test_volume_operation_always_reports_the_observed_sop_hash(tmp_path: Path) -> None:
    """Even with an absent expected field, the descriptor carries the observation."""
    store = _store(tmp_path / "volumes")
    params = _volume_params()
    del params["expectedFingerprint"]["sopInstanceUIDsHash"]
    descriptor = _call(store, DICOM_VOLUME_METHOD, params)["result"]["descriptor"]
    correlation = descriptor["correlation"]
    assert correlation["sopInstanceUIDsHash"] == _fingerprint("ct-axial")["sopInstanceUIDsHash"]
    assert descriptor["contentHash"] != correlation["sopInstanceUIDsHash"]


def test_volume_operation_refuses_a_sop_hash_mismatch_as_series(tmp_path: Path) -> None:
    store = _store(tmp_path / "volumes")
    params = _volume_params()
    params["expectedFingerprint"]["sopInstanceUIDsHash"] = "sha256:" + "0" * 64
    error = _error(_call(store, DICOM_VOLUME_METHOD, params))
    assert error["code"] == VOLUME_FINGERPRINT_MISMATCH == -32015
    assert error["data"]["reason"] == "series"
    assert set(error["data"]) == {
        "diagnostic", "reason", "seriesInstanceUID", "expectedDigest", "observedDigest"}
    assert list(store.root.iterdir()) == []  # no descriptor is published on mismatch


def test_frame_of_reference_expectation_is_exact() -> None:
    require_expected_frame_of_reference("1.2.3.4.for", "1.2.3.4.for", series_uid="1.2.3.4.5")
    with pytest.raises(ProtocolError) as excinfo:
        require_expected_frame_of_reference("1.2.3.4.for", "9.9", series_uid="1.2.3.4.5")
    assert excinfo.value.code == VOLUME_FINGERPRINT_MISMATCH
    assert excinfo.value.data["reason"] == "frame-of-reference"


def test_expected_fingerprint_schema_is_strict() -> None:
    for value in (
        None,
        {"seriesInstanceUID": "1.2", "instanceCount": 3, "contentDigest": "sha256:x"},
        {"studyInstanceUID": "1.2", "seriesInstanceUID": "1.2", "instanceCount": -1,
         "contentDigest": "sha256:x"},
        {"studyInstanceUID": "1.2", "seriesInstanceUID": "1.2", "instanceCount": 3,
         "contentDigest": "sha256:x", "totalBytes": True},
    ):
        with pytest.raises(FingerprintSchemaError):
            parse_expected_fingerprint(value, "expected")


def test_unknown_series_and_containment_refusals(tmp_path: Path) -> None:
    store = _store(tmp_path / "volumes")
    error = _error(_call(store, DICOM_VOLUME_METHOD, _volume_params("1.2.3.4.999")))
    assert (error["code"], error["data"]["reason"]) == (VOLUME_DECODE_FAILED, "decode-error")
    for name in ("../escape.bin", "/etc/passwd", "nested/payload.bin"):
        with pytest.raises(ProtocolError) as excinfo:
            store.resolve_contained(name)
        assert excinfo.value.code == VOLUME_HANDLE_INVALID
    (store.root / "evil.bin").symlink_to("/etc/passwd")
    with pytest.raises(ProtocolError) as symlink:
        store.resolve_contained("evil.bin")
    assert symlink.value.code == VOLUME_HANDLE_INVALID


def test_cleanup_failure_is_quarantined_and_retryable(tmp_path: Path) -> None:
    store = _store(tmp_path / "volumes")
    descriptor = _call(store, DICOM_VOLUME_METHOD, _volume_params())["result"]["descriptor"]
    path = store.root / descriptor["fileName"]
    path.unlink()
    path.mkdir()
    for _ in range(2):
        with pytest.raises(ProtocolError) as excinfo:
            store.release(descriptor["handle"])
        assert excinfo.value.code == VOLUME_CLEANUP_FAILED
        assert excinfo.value.data["reason"] == "unlink-failed"
        assert store.tracked_bytes() > 0  # the file may still exist
    path.rmdir()
    assert store.release(descriptor["handle"]) is True
