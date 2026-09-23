"""ADR-013 §7 publication-anchored TTL evidence (2B.3b, Python half).

The descriptor must declare the absolute UTC publication instant and the exact
store TTL, so a bridge can validate reads against descriptor publication rather
than request receipt. A custom store TTL must never be replaced by the hard-coded
deployment default.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from dicom.locators import SourceLocator
from dicom.volume_operations import prepare_series
from dicom.volume_payload import DecodedVolume, _utc_rfc3339, descriptor_for
from dicom.volume_store import VolumeStore
from worker.protocol import ProtocolError

FROZEN = datetime(2026, 9, 22, 12, 0, 0, tzinfo=timezone.utc)
_CT_INSTANCES = (
    Path(__file__).resolve().parents[2]
    / "tests" / "rendering" / "fixtures" / "volumes" / "ct-axial" / "instances"
)
_CT_SERIES = "1.2.826.0.1.3680043.10.5001.2"


def _decode() -> DecodedVolume:
    locator = SourceLocator(kind="local-folder", path=str(_CT_INSTANCES))
    return prepare_series(locator, _CT_SERIES).decode()


def _ticking(start: datetime) -> Callable[[], datetime]:
    ticks = {"n": 0}

    def clock() -> datetime:
        ticks["n"] += 1
        return start + timedelta(seconds=ticks["n"])

    return clock


def test_descriptor_declares_publication_instant_and_exact_store_ttl(tmp_path: Path) -> None:
    store = VolumeStore(tmp_path / "v", clock=lambda: FROZEN, ttl_seconds=42)
    descriptor = store.publish(_decode())
    assert descriptor["ttlSeconds"] == 42 == store.capability()["handleTtlSeconds"]
    assert descriptor["publishedAt"] == "2026-09-22T12:00:00.000000Z"
    record = store._records[descriptor["handle"]]
    assert record.published_at == FROZEN
    assert record.published_at.utcoffset() == timedelta(0)


def test_descriptor_timestamp_is_the_record_publication_instant(tmp_path: Path) -> None:
    store = VolumeStore(tmp_path / "v", clock=_ticking(FROZEN), ttl_seconds=30)
    descriptor = store.publish(_decode())
    record = store._records[descriptor["handle"]]
    assert descriptor["publishedAt"] == _utc_rfc3339(record.published_at)


def test_store_enforces_exactly_the_declared_ttl(tmp_path: Path) -> None:
    now = [FROZEN]
    store = VolumeStore(tmp_path / "v", clock=lambda: now[0], ttl_seconds=42)
    descriptor = store.publish(_decode())
    now[0] = FROZEN + timedelta(seconds=41, microseconds=999000)
    assert store.read_payload(descriptor["handle"])
    now[0] = FROZEN + timedelta(seconds=42)
    with pytest.raises(ProtocolError) as expired:
        store.read_payload(descriptor["handle"])
    assert expired.value.data["reason"] == "expired-handle"


def test_utc_rfc3339_is_absolute_subsecond_and_rejects_naive() -> None:
    offset = timezone(timedelta(hours=2))
    assert _utc_rfc3339(
        datetime(2026, 9, 22, 14, 0, 0, 123456, tzinfo=offset)
    ) == "2026-09-22T12:00:00.123456Z"
    with pytest.raises(ValueError):
        _utc_rfc3339(datetime(2026, 9, 22, 12, 0, 0))


def test_descriptor_for_rejects_naive_publication_instant() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        descriptor_for(
            _decode(), handle="0" * 32, file_name="x.bin",
            content_hash_value="sha256:" + "0" * 64, ttl_seconds=30,
            published_at=datetime(2026, 9, 22, 12, 0, 0),
        )
