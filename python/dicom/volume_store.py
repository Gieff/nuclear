"""Worker-owned private payload store and lifecycle (ADR-013 §§2/7/8).

Owns the transport side of the hydration boundary: an owner-only (``0700``)
temp root, atomic publication (write -> flush/fsync -> close -> ``os.replace``
-> verify length/hash), TTL checked on every use/read, startup sweep,
single-owner idempotent release and the ``-32014..-32018`` refusals. It never
decodes DICOM; descriptors carry only an opaque handle and a worker-generated
name, and every resolution is canonical-contained (no symlinks/traversal).
Authority: ADR-013.
"""

from __future__ import annotations

import os
import secrets
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from worker.protocol import (
    ERROR_MESSAGES,
    VOLUME_CLEANUP_FAILED,
    VOLUME_HANDLE_INVALID,
    VOLUME_LIMIT_EXCEEDED,
    VOLUME_TRANSPORT_INTEGRITY,
    ProtocolError,
)

from .volume_payload import (
    HANDLE_TTL_SECONDS,
    MAX_PAYLOAD_BYTES,
    MAX_RESIDENT_PAYLOADS,
    MAX_TRACKED_PAYLOAD_BYTES,
    DecodedVolume,
    content_hash,
    descriptor_for,
    enforce_volume_limits,
)

Clock = Callable[[], datetime]

#: Session lock file the owning worker holds; never swept as a payload.
SESSION_LOCK_NAME = ".nuclear-session.lock"


def _utc_now() -> datetime:
    """Return the current timezone-aware UTC instant."""
    return datetime.now(timezone.utc)


def _refusal(code: int, reason: str, diagnostic: str, **extra: Any) -> ProtocolError:
    """Build a typed ADR-013 refusal with the closed reason and no path leakage."""
    data: dict[str, Any] = {"diagnostic": diagnostic, "reason": reason}
    data.update({key: value for key, value in extra.items() if value is not None})
    return ProtocolError(code, ERROR_MESSAGES[code], data)


@dataclass(frozen=True)
class _Record:
    """One published payload bound to an opaque handle."""

    handle: str
    file_name: str
    byte_length: int
    content_hash: str
    published_at: datetime
    series_instance_uid: str


class VolumeStore:
    """Worker-owned temp root, atomic publication, TTL and idempotent release."""

    def __init__(
        self,
        root: Path,
        *,
        clock: Clock | None = None,
        ttl_seconds: int = HANDLE_TTL_SECONDS,
    ) -> None:
        """Create (or adopt) the private root and sweep stale payloads."""
        self._root = Path(root)
        self._clock: Clock = clock if clock is not None else _utc_now
        self._ttl_seconds = ttl_seconds
        self._records: dict[str, _Record] = {}
        self._released: set[str] = set()
        self._quarantined: dict[str, _Record] = {}
        self._root.mkdir(parents=True, exist_ok=True)
        os.chmod(self._root, 0o700)
        self.reset()

    @property
    def root(self) -> Path:
        """The advertised owner-only temp root (the bridge resolves under it)."""
        return self._root

    def capability(self) -> dict[str, Any]:
        """Return the additive handshake ``capabilities.volumeTransport`` block."""
        return {"root": str(self._root), "handleTtlSeconds": self._ttl_seconds,
                "maxResidentPayloads": MAX_RESIDENT_PAYLOADS,
                "maxPayloadBytes": MAX_PAYLOAD_BYTES}

    def reset(self) -> None:
        """Delete every stale payload and invalidate all handles (startup sweep)."""
        for path in sorted(self._root.iterdir()):
            if (path.is_file() or path.is_symlink()) and path.name != SESSION_LOCK_NAME:
                try:
                    path.unlink()
                except OSError:  # pragma: no cover - best-effort startup sweep
                    continue
        self._records.clear()
        self._released.clear()
        self._quarantined.clear()

    def tracked_bytes(self) -> int:
        """Return the tracked temp-payload bytes (active + quarantined)."""
        return sum(record.byte_length for record in self._records.values()) + sum(
            record.byte_length for record in self._quarantined.values()
        )

    def resolve_contained(self, file_name: object) -> Path:
        """Resolve a worker-generated name inside the root, else refuse ``-32017``."""
        if not isinstance(file_name, str) or not file_name or file_name in {".", ".."}:
            raise self._invalid("unknown-handle", "payload file name is not a single contained name.")
        if Path(file_name).name != file_name or os.path.isabs(file_name):
            raise self._invalid("unknown-handle", "payload file name must not contain a path.")
        candidate = self._root / file_name
        try:
            resolved = candidate.resolve()
        except OSError as exc:  # pragma: no cover - platform-dependent
            raise self._invalid("unknown-handle", "payload path could not be resolved.") from exc
        if candidate.is_symlink() or resolved.parent != self._root.resolve():
            raise self._invalid("unknown-handle", "payload path escapes the worker temp root.")
        return resolved

    def publish(self, volume: DecodedVolume) -> dict[str, Any]:
        """Atomically write ``volume`` and return its verified descriptor."""
        series_uid = volume.series_instance_uid
        enforce_volume_limits(volume.voxel_count(), volume.byte_length(), series_uid)
        self._sweep_expired()
        if len(self._records) >= MAX_RESIDENT_PAYLOADS:
            raise _refusal(
                VOLUME_LIMIT_EXCEEDED, "tracked-payload-limit",
                f"{len(self._records)} active payloads; the v1 cap is {MAX_RESIDENT_PAYLOADS}.",
                seriesInstanceUID=series_uid, expected=MAX_RESIDENT_PAYLOADS,
                observed=len(self._records),
            )
        length = volume.byte_length()
        if self.tracked_bytes() + length > MAX_TRACKED_PAYLOAD_BYTES:
            raise _refusal(
                VOLUME_LIMIT_EXCEEDED, "tracked-payload-limit",
                "tracked temp-payload bytes would exceed the v1 cap.",
                seriesInstanceUID=series_uid, expected=MAX_TRACKED_PAYLOAD_BYTES,
                observed=self.tracked_bytes() + length,
            )
        data = volume.payload_bytes()
        digest = content_hash(data)
        handle = secrets.token_hex(16)
        file_name = f"{uuid.uuid4().hex}.bin"
        self._atomic_write(file_name, data)
        self._verify_written(file_name, length, digest, handle)
        published_at = self._clock()
        descriptor = descriptor_for(
            volume, handle=handle, file_name=file_name, content_hash_value=digest,
            ttl_seconds=self._ttl_seconds, published_at=published_at)
        self._records[handle] = _Record(
            handle, file_name, length, digest, published_at, series_uid)
        return descriptor

    def read_payload(self, handle: str) -> bytes:
        """Read and verify a tracked payload; TTL is checked before the read."""
        record = self._records.get(handle)
        if record is None:
            if handle in self._quarantined:
                raise _refusal(
                    VOLUME_CLEANUP_FAILED, "release-failed",
                    "handle is quarantined pending cleanup; retry release.", handle=handle)
            reason = "already-released" if handle in self._released else "unknown-handle"
            raise self._invalid(reason, "handle is not tracked by this worker.", handle)
        if self._expired(record, self._clock()):
            self._sweep_expired()
            raise self._invalid("expired-handle", "handle TTL elapsed.", handle)
        try:
            data = self.resolve_contained(record.file_name).read_bytes()
        except FileNotFoundError as exc:
            raise _refusal(
                VOLUME_TRANSPORT_INTEGRITY, "file-missing", "tracked payload file is missing.",
                handle=handle,
            ) from exc
        if len(data) < record.byte_length:
            raise _refusal(
                VOLUME_TRANSPORT_INTEGRITY, "file-short",
                "tracked payload is shorter than its declared byteLength.", handle=handle,
            )
        if len(data) > record.byte_length:
            raise _refusal(
                VOLUME_TRANSPORT_INTEGRITY, "file-long",
                "tracked payload is longer than its declared byteLength.", handle=handle,
            )
        if content_hash(data) != record.content_hash:
            raise _refusal(
                VOLUME_TRANSPORT_INTEGRITY, "hash-mismatch",
                "tracked payload content hash does not match its descriptor.", handle=handle,
            )
        return data

    def release(self, handle: str) -> bool:
        """Release a handle; idempotent and single-owner. ``-32018`` on unlink failure."""
        tracked = self._records.get(handle)
        if tracked is not None and self._expired(tracked, self._clock()):
            self._sweep_expired()
            raise self._invalid("expired-handle", "handle TTL elapsed.", handle)
        record = self._records.pop(handle, None)
        if record is None:
            record = self._quarantined.pop(handle, None)
        if record is None:
            self._released.add(handle)
            return False
        try:
            os.unlink(self._root / record.file_name)
        except FileNotFoundError:
            self._released.add(handle)
            return True
        except OSError as exc:
            self._quarantined[handle] = record
            raise _refusal(
                VOLUME_CLEANUP_FAILED, "unlink-failed",
                "payload file could not be removed; it remains quarantined for the next sweep.",
                handle=handle,
            ) from exc
        self._released.add(handle)
        return True

    def _invalid(self, reason: str, diagnostic: str, handle: str | None = None) -> ProtocolError:
        return _refusal(VOLUME_HANDLE_INVALID, reason, diagnostic, handle=handle)

    def _atomic_write(self, file_name: str, data: bytes) -> None:
        """Write to a temp name, flush/fsync/close, atomically replace.

        Loops over partial writes and removes the temp file on failure.
        """
        temporary = self._root / f".{file_name}.tmp"
        target = self._root / file_name
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            try:
                view = memoryview(data)
                while view:
                    written = os.write(descriptor, view)
                    if written <= 0:
                        raise OSError("payload write made no progress")
                    view = view[written:]
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
            os.replace(temporary, target)
            os.chmod(target, 0o600)
        except OSError:
            try:
                os.unlink(temporary)
            except OSError:  # pragma: no cover - best-effort temp cleanup
                pass
            raise

    def _verify_written(self, file_name: str, length: int, digest: str, handle: str) -> None:
        """Verify the file's length and hash before the descriptor is published."""
        path = self._root / file_name
        actual = path.stat().st_size
        if actual < length:
            raise _refusal(VOLUME_TRANSPORT_INTEGRITY, "file-short",
                           "written payload is shorter than declared.", handle=handle)
        if actual > length:
            raise _refusal(VOLUME_TRANSPORT_INTEGRITY, "file-long",
                           "written payload is longer than declared.", handle=handle)
        if content_hash(path.read_bytes()) != digest:
            raise _refusal(VOLUME_TRANSPORT_INTEGRITY, "hash-mismatch",
                           "written payload hash does not match the decoded bytes.", handle=handle)

    def _expired(self, record: _Record, moment: datetime) -> bool:
        return (moment - record.published_at).total_seconds() >= self._ttl_seconds

    def _sweep_expired(self) -> None:
        """Remove expired payloads; failures stay quarantined (retryable)."""
        now = self._clock()
        for handle, record in list(self._records.items()):
            if not self._expired(record, now):
                continue
            try:
                os.unlink(self._root / record.file_name)
            except FileNotFoundError:
                pass
            except OSError:  # pragma: no cover - platform-dependent
                self._quarantined[handle] = record
            del self._records[handle]
            self._released.add(handle)
