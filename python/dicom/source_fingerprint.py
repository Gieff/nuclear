"""Source-series digests and fail-closed fingerprint correlation (ADR-013 §5).

Owns the owner-ratified ``contentDigest`` and ``sopInstanceUIDsHash``
canonicalizations plus expected-vs-observed correlation. Reads the exact raw bytes
of the selected series only, never decodes pixels and never mutates the hashed
bytes (no TOCTOU); both digests are distinct from the decoded ``contentHash``.
"""

from __future__ import annotations

import hashlib
import io
import struct
import zipfile
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pydicom
from pydicom.dataset import Dataset

from worker.protocol import (
    ERROR_MESSAGES,
    VOLUME_DECODE_FAILED,
    VOLUME_FINGERPRINT_MISMATCH,
    ProtocolError,
)

from .locators import SourceLocator, source_unavailable_error
from .metadata import text_from_dataset
from .sop_uid_digest import SopUidDigestRefusal, compute_sop_instance_uids_hash
from .sop_uid_raw import SopUidRawRefusal, read_raw_sop_instance_uid
from .volume_payload import ExpectedFingerprint

CONTENT_DIGEST_DOMAIN = b"NuClear-DICOM-Series-Content-v1"
CONTENT_DIGEST_PREFIX = "sha256:"


class SourceDigestRefusal(Exception):
    """Missing/duplicate SOP identity: no partial digest may be produced."""

    def __init__(self, diagnostic: str) -> None:
        super().__init__(diagnostic)
        self.diagnostic = diagnostic


@dataclass(frozen=True)
class SourceInstance:
    """One selected-series instance: identity, exact raw bytes and metadata."""

    file_name: str
    sop_instance_uid: str
    study_instance_uid: str
    series_instance_uid: str
    frame_of_reference_uid: str
    raw_bytes: bytes
    dataset: Dataset


@dataclass(frozen=True)
class SeriesSource:
    """Every selected-series instance (sorted by SOP UID) plus its digest."""

    series_uid: str
    instances: tuple[SourceInstance, ...]
    content_digest: str
    sop_instance_uids_hash: str
    total_bytes: int
    study_instance_uid: str
    frame_of_reference_uid: str

    @property
    def instance_count(self) -> int:
        """Number of decoded/hashed instances in the series."""
        return len(self.instances)


@dataclass(frozen=True)
class ObservedFingerprint:
    """The worker's observed source fingerprint (no fabricated fields)."""

    study_instance_uid: str
    series_instance_uid: str
    instance_count: int
    content_digest: str
    geometric_digest: str
    sop_instance_uids_hash: str
    total_bytes: int
    frame_of_reference_uid: str

    def as_correlation(self) -> dict[str, Any]:
        """Return the ADR-013 §5 descriptor ``correlation`` block."""
        return {
            "studyInstanceUID": self.study_instance_uid,
            "seriesInstanceUID": self.series_instance_uid,
            "instanceCount": self.instance_count,
            "contentDigest": self.content_digest,
            "geometricDigest": self.geometric_digest,
            "sopInstanceUIDsHash": self.sop_instance_uids_hash,
            "totalBytes": self.total_bytes,
            "frameOfReferenceUID": self.frame_of_reference_uid,
        }

def compute_content_digest(records: Sequence[tuple[str, bytes]]) -> str:
    """Return the ratified ``sha256:<hex>``; a missing/duplicate UID refuses."""
    seen: set[str] = set()
    digest = hashlib.sha256()
    for sop_instance_uid, raw_bytes in sorted(records, key=lambda item: item[0]):
        if not sop_instance_uid:
            raise SourceDigestRefusal("an instance has no SOPInstanceUID.")
        if sop_instance_uid in seen:
            raise SourceDigestRefusal(f"SOPInstanceUID '{sop_instance_uid}' is duplicated.")
        seen.add(sop_instance_uid)
        uid_utf8 = sop_instance_uid.encode("utf-8")
        digest.update(struct.pack(">Q", len(CONTENT_DIGEST_DOMAIN)))
        digest.update(CONTENT_DIGEST_DOMAIN)
        digest.update(struct.pack(">Q", len(uid_utf8)))
        digest.update(uid_utf8)
        digest.update(struct.pack(">Q", len(raw_bytes)))
        digest.update(hashlib.sha256(raw_bytes).digest())
    return CONTENT_DIGEST_PREFIX + digest.hexdigest()


def _source_instance(file_name: str, raw: bytes) -> SourceInstance:
    """Parse metadata-only from exactly ``raw``; never a second byte source.

    The SOP Instance UID is captured before pydicom normalizes it (see
    :mod:`dicom.sop_uid_raw`), so a non-conformant pad cannot pass as valid.
    """
    dataset = pydicom.dcmread(io.BytesIO(raw), stop_before_pixels=True)
    sop_uid = read_raw_sop_instance_uid(raw)
    return SourceInstance(
        file_name=file_name,
        sop_instance_uid=sop_uid,
        study_instance_uid=text_from_dataset(dataset, "StudyInstanceUID") or "",
        series_instance_uid=text_from_dataset(dataset, "SeriesInstanceUID") or "",
        frame_of_reference_uid=text_from_dataset(dataset, "FrameOfReferenceUID") or "",
        raw_bytes=raw,
        dataset=dataset,
    )


def _local_paths(locator: SourceLocator) -> list[Path]:
    """Resolve a folder/file-list locator to its candidate files (``-32010``)."""
    if locator.kind == "local-folder":
        root = Path(locator.path)
        if not root.is_dir():
            raise source_unavailable_error(
                locator.kind, "Local folder source is not a readable directory.", root.name
            )
        return [path for path in sorted(root.rglob("*")) if path.is_file()]
    base = Path(locator.base_path) if locator.base_path else None
    resolved = [
        base / Path(entry) if base is not None and not Path(entry).is_absolute() else Path(entry)
        for entry in locator.files
    ]
    missing = next((candidate for candidate in resolved if not candidate.is_file()), None)
    if missing is not None:
        raise source_unavailable_error(locator.kind, "Listed source file cannot be read.", missing.name)
    return sorted(resolved)


def _collect_local(paths: Sequence[Path], series_uid: str) -> list[SourceInstance]:
    """Read exact bytes only for instances whose series matches ``series_uid``."""
    found: list[SourceInstance] = []
    for path in paths:
        try:
            header = pydicom.dcmread(str(path), stop_before_pixels=True)
        except Exception:  # noqa: BLE001, S112 - skip unreadable file, never abort
            continue
        if text_from_dataset(header, "SeriesInstanceUID") != series_uid:
            continue
        instance = _source_instance(path.name, path.read_bytes())
        if instance.series_instance_uid == series_uid:
            found.append(instance)
    return found


def _collect_archive(locator: SourceLocator, series_uid: str) -> list[SourceInstance]:
    """Read exact archive entry bytes only for the selected series."""
    archive = Path(locator.archive_path)
    if not archive.is_file():
        raise source_unavailable_error(locator.kind, "Archive source cannot be read.", archive.name)
    found: list[SourceInstance] = []
    with zipfile.ZipFile(archive) as bundle:
        names = sorted(name for name in bundle.namelist() if not name.endswith("/"))
        if locator.inner_entry_prefix:
            names = [name for name in names if name.startswith(locator.inner_entry_prefix)]
        for name in names:
            try:
                with bundle.open(name) as handle:
                    header = pydicom.dcmread(handle, stop_before_pixels=True)
            except Exception:  # noqa: BLE001, S112 - skip unreadable entry, never abort
                continue
            if text_from_dataset(header, "SeriesInstanceUID") != series_uid:
                continue
            instance = _source_instance(Path(name).name, bundle.read(name))
            if instance.series_instance_uid == series_uid:
                found.append(instance)
    return found


def _decode_refusal(series_uid: str, diagnostic: str) -> ProtocolError:
    """Build the ``-32013`` decode-error refusal with a safe diagnostic."""
    return ProtocolError(
        VOLUME_DECODE_FAILED, ERROR_MESSAGES[VOLUME_DECODE_FAILED],
        {"diagnostic": diagnostic, "reason": "decode-error", "seriesInstanceUID": series_uid})


def load_series_source(locator: SourceLocator, series_uid: str) -> SeriesSource:
    """Read the selected series' exact raw bytes and compute both digests."""
    try:
        instances = (
            _collect_archive(locator, series_uid) if locator.kind == "archive-entry"
            else _collect_local(_local_paths(locator), series_uid)
        )
    except SopUidRawRefusal as refusal:
        raise _decode_refusal(series_uid, refusal.diagnostic) from refusal
    if not instances:
        raise _decode_refusal(series_uid, "no readable instance belongs to the requested series.")
    ordered = tuple(sorted(instances, key=lambda item: item.sop_instance_uid))
    try:
        digest = compute_content_digest([(item.sop_instance_uid, item.raw_bytes) for item in ordered])
        sop_hash = compute_sop_instance_uids_hash([item.sop_instance_uid for item in ordered])
    except (SourceDigestRefusal, SopUidDigestRefusal) as refusal:
        raise _decode_refusal(series_uid, refusal.diagnostic) from refusal
    return SeriesSource(
        series_uid=series_uid, instances=ordered, content_digest=digest,
        sop_instance_uids_hash=sop_hash,
        total_bytes=sum(len(item.raw_bytes) for item in ordered),
        study_instance_uid=ordered[0].study_instance_uid,
        frame_of_reference_uid=ordered[0].frame_of_reference_uid)


def _mismatch(
    reason: str, series_uid: str, diagnostic: str,
    *, expected_digest: str | None = None, observed_digest: str | None = None,
) -> ProtocolError:
    """Build a ``-32015`` refusal with only the ADR-013 §8 closed reason/diagnostics."""
    data: dict[str, Any] = {"diagnostic": diagnostic, "reason": reason, "seriesInstanceUID": series_uid}
    if expected_digest is not None:
        data["expectedDigest"] = expected_digest
    if observed_digest is not None:
        data["observedDigest"] = observed_digest
    return ProtocolError(VOLUME_FINGERPRINT_MISMATCH, ERROR_MESSAGES[VOLUME_FINGERPRINT_MISMATCH], data)


def require_matching_fingerprint(
    observed: ObservedFingerprint, expected: ExpectedFingerprint, *, series_uid: str
) -> None:
    """Fail closed on any expected-vs-observed fingerprint mismatch (``-32015``).

    Present optional fields are exact; absent ones are never defaulted. A
    study-UID mismatch is reported as a ``series`` identity mismatch naming
    study/series in the safe diagnostic (the ADR has no ``study`` reason).
    """
    if expected.series_instance_uid != observed.series_instance_uid:
        raise _mismatch("series", series_uid, (
            f"expected seriesInstanceUID '{expected.series_instance_uid}' but observed "
            f"'{observed.series_instance_uid}'."))
    if expected.study_instance_uid != observed.study_instance_uid:
        raise _mismatch("series", series_uid, (
            f"series identity mismatch: expected studyInstanceUID '{expected.study_instance_uid}' "
            f"series '{expected.series_instance_uid}' but observed '{observed.study_instance_uid}' "
            f"series '{observed.series_instance_uid}'."))
    if expected.instance_count != observed.instance_count:
        raise _mismatch("instance-count", series_uid, (
            f"expected {expected.instance_count} instances but observed {observed.instance_count}."))
    if expected.content_digest != observed.content_digest:
        raise _mismatch("content-digest", series_uid,
            "expected source-series content digest differs from the observed raw-instance digest.",
            expected_digest=expected.content_digest, observed_digest=observed.content_digest)
    if expected.geometric_digest is not None and expected.geometric_digest != observed.geometric_digest:
        raise _mismatch("geometric-digest", series_uid,
            "expected geometric digest differs from the accepted worker geometry digest.",
            expected_digest=expected.geometric_digest, observed_digest=observed.geometric_digest)
    if expected.total_bytes is not None and expected.total_bytes != observed.total_bytes:
        raise _mismatch("content-digest", series_uid, (
            f"expected totalBytes {expected.total_bytes} but observed {observed.total_bytes}; "
            "the raw source content differs."))
    if (
        expected.sop_instance_uids_hash is not None
        and expected.sop_instance_uids_hash != observed.sop_instance_uids_hash
    ):
        raise _mismatch("series", series_uid,
            "expected sopInstanceUIDsHash differs from the observed SOP Instance UID digest.",
            expected_digest=expected.sop_instance_uids_hash,
            observed_digest=observed.sop_instance_uids_hash)


def require_expected_frame_of_reference(
    observed: str, expected: str, *, series_uid: str
) -> None:
    """Fail closed when the observed Frame of Reference differs from ``expected``."""
    if observed != expected:
        raise _mismatch(
            "frame-of-reference", series_uid,
            f"expected frameOfReferenceUID '{expected}' but observed '{observed}'.",
        )
