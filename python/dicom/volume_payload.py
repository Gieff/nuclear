"""Declared scalar-payload vocabulary, limits and typed volume record (ADR-013).

Owns ADR-013 §§3/6 dtypes, exact ``byteLength``, ``sha256:`` payload hash, v1
limits, :class:`DecodedVolume`, the ``SourceFingerprint`` expectation schema and
the §7 publication timestamp; lifecycle is :mod:`dicom.volume_store`.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
from numpy.typing import NDArray

from worker.protocol import (
    ERROR_MESSAGES,
    VOLUME_LIMIT_EXCEEDED,
    ProtocolError,
)

from .sop_uid_digest import is_sop_uid_digest

ScalarDataType = Literal["int8", "uint8", "int16", "uint16", "float32"]
Signedness = Literal["signed", "unsigned", "not-applicable"]
ScalarDataDomain = Literal["stored-values", "rescaled-hu", "rescaled-bqml"]

BYTES_PER_VOXEL: dict[str, int] = {"int8": 1, "uint8": 1, "int16": 2, "uint16": 2, "float32": 4}
SIGNEDNESS_BY_DTYPE: dict[str, Signedness] = {
    "int8": "signed",
    "uint8": "unsigned",
    "int16": "signed",
    "uint16": "unsigned",
    "float32": "not-applicable",
}
NUMPY_DTYPE: dict[str, str] = {
    "int8": "<i1",
    "uint8": "<u1",
    "int16": "<i2",
    "uint16": "<u2",
    "float32": "<f4",
}

BYTE_ORDER = "little"
CONTENT_HASH_PREFIX = "sha256:"

#: ADR-013 §6 v1 deployment profile (not universal clinical constants).
MAX_VOXELS_PER_VOLUME = 2**28
MAX_BYTES_PER_VOXEL = 4
MAX_PAYLOAD_BYTES = 2**30
MAX_RESIDENT_PAYLOADS = 2
MAX_TRACKED_PAYLOAD_BYTES = 4 * 2**30
REGISTRATION_PYRAMID_OVERHEAD_FACTOR = 3
MAX_REGISTRATION_WORKING_SET_BYTES = 8 * 2**30

#: ADR-013 §7: TTL starts at descriptor publication and is checked on every use.
HANDLE_TTL_SECONDS = 300


def bytes_per_voxel(dtype: ScalarDataType) -> int:
    """Return the byte size of one voxel of the accepted ``dtype``."""
    return BYTES_PER_VOXEL[dtype]


def payload_byte_length(dimensions: Sequence[int], dtype: ScalarDataType) -> int:
    """Return the verified ``byteLength = nx * ny * nz * bytesPerVoxel``."""
    nx, ny, nz = int(dimensions[0]), int(dimensions[1]), int(dimensions[2])
    return nx * ny * nz * bytes_per_voxel(dtype)


def numpy_dtype(dtype: ScalarDataType) -> np.dtype[Any]:
    """Return the little-endian numpy dtype for an accepted ``dtype``."""
    return np.dtype(NUMPY_DTYPE[dtype])


def content_hash(data: bytes) -> str:
    """Return the mandatory ``sha256:<hex>`` content hash of ``data``."""
    return CONTENT_HASH_PREFIX + hashlib.sha256(data).hexdigest()


def _limit_error(
    reason: str,
    series_uid: str,
    diagnostic: str,
    *,
    expected: int | None = None,
    observed: int | None = None,
) -> ProtocolError:
    """Build a ``-32014`` limit refusal with the closed reason and diagnostics."""
    data: dict[str, Any] = {
        "diagnostic": diagnostic,
        "reason": reason,
        "seriesInstanceUID": series_uid,
    }
    if expected is not None:
        data["expected"] = expected
    if observed is not None:
        data["observed"] = observed
    return ProtocolError(VOLUME_LIMIT_EXCEEDED, ERROR_MESSAGES[VOLUME_LIMIT_EXCEEDED], data)


def enforce_volume_limits(
    voxel_count: int,
    byte_length: int,
    series_uid: str,
    *,
    max_voxels: int | None = None,
    max_bytes: int | None = None,
) -> None:
    """Refuse a decoded volume that exceeds the per-volume ADR-013 §6 limits."""
    max_voxels = MAX_VOXELS_PER_VOLUME if max_voxels is None else max_voxels
    max_bytes = MAX_PAYLOAD_BYTES if max_bytes is None else max_bytes
    if voxel_count > max_voxels:
        raise _limit_error("voxel-limit", series_uid,
            f"Decoded volume has {voxel_count} voxels; the per-volume cap is {max_voxels}.",
            expected=max_voxels, observed=voxel_count)
    if byte_length > max_bytes:
        raise _limit_error("payload-limit", series_uid,
            f"Decoded payload is {byte_length} bytes; the per-payload cap is {max_bytes}.",
            expected=max_bytes, observed=byte_length)


def registration_working_set_bytes(voxel_counts: Sequence[int], *, bytes_per: int = MAX_BYTES_PER_VOXEL) -> int:
    """Return the ADR-013 §6 registration working-set estimate for one request."""
    return bytes_per * sum(int(count) for count in voxel_counts) * REGISTRATION_PYRAMID_OVERHEAD_FACTOR


def enforce_registration_working_set(
    voxel_counts: Sequence[int], series_uid: str, *, budget: int | None = None
) -> int:
    """Refuse a registration whose pre-flight working set exceeds ``budget``."""
    budget = MAX_REGISTRATION_WORKING_SET_BYTES if budget is None else budget
    estimate = registration_working_set_bytes(voxel_counts)
    if estimate > budget:
        raise _limit_error("working-set-limit", series_uid,
            f"Registration working set estimates to {estimate} bytes; the cap is {budget}.",
            expected=budget, observed=estimate)
    return estimate


@dataclass(frozen=True)
class ExpectedFingerprint:
    """A schema-valid caller-declared ``SourceFingerprint`` expectation; present optional fields are exact."""

    study_instance_uid: str
    series_instance_uid: str
    instance_count: int
    content_digest: str
    sop_instance_uids_hash: str | None = None
    total_bytes: int | None = None
    geometric_digest: str | None = None


class FingerprintSchemaError(ValueError):
    """A caller-declared expected fingerprint violates the contract shape."""


def _required_string(value: object, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise FingerprintSchemaError(f"{name} must be a non-empty string.")
    return value


def parse_expected_fingerprint(value: object, name: str) -> ExpectedFingerprint:
    """Validate a caller-declared ``SourceFingerprint`` expectation exactly."""
    if not isinstance(value, dict):
        raise FingerprintSchemaError(f"{name} must be an object.")
    count = value.get("instanceCount")
    if isinstance(count, bool) or not isinstance(count, int) or count < 0:
        raise FingerprintSchemaError(f"{name}.instanceCount must be a non-negative integer.")
    total = value.get("totalBytes")
    if total is not None and (isinstance(total, bool) or not isinstance(total, int) or total < 0):
        raise FingerprintSchemaError(
            f"{name}.totalBytes must be a non-negative integer when present."
        )
    parsed: dict[str, str | None] = {
        key: _required_string(value.get(key), f"{name}.{key}") if value.get(key) is not None else None
        for key in ("sopInstanceUIDsHash", "geometricDigest")
    }
    sop_hash = parsed["sopInstanceUIDsHash"]
    if sop_hash is not None and not is_sop_uid_digest(sop_hash):
        raise FingerprintSchemaError(f"{name}.sopInstanceUIDsHash must be a 'sha256:<hex>' digest.")
    return ExpectedFingerprint(
        study_instance_uid=_required_string(value.get("studyInstanceUID"), f"{name}.studyInstanceUID"),
        series_instance_uid=_required_string(value.get("seriesInstanceUID"), f"{name}.seriesInstanceUID"),
        instance_count=count,
        content_digest=_required_string(value.get("contentDigest"), f"{name}.contentDigest"),
        sop_instance_uids_hash=sop_hash,
        total_bytes=total,
        geometric_digest=parsed["geometricDigest"],
    )


@dataclass(frozen=True)
class PayloadFormat:
    """The declared pixel format of a decoded payload (never inferred downstream)."""

    dtype: ScalarDataType
    signedness: Signedness
    samples_per_pixel: int
    bits_allocated: int
    bits_stored: int
    high_bit: int
    photometric_interpretation: str
    scalar_data_domain: ScalarDataDomain
    rescale: tuple[float, float] | None = None


@dataclass(frozen=True)
class DecodedVolume:
    """A decoded DICOM series: declared scalar bytes plus accepted geometry.

    ``scalar`` is C-contiguous with shape ``(slices, rows, columns)`` (z, y, x),
    matching the ingestion layout for ``dimensions = [columns, rows, slices]``.
    """

    scalar: NDArray[Any]
    format: PayloadFormat
    dimensions: tuple[int, int, int]
    geometry: Mapping[str, Any]
    study_instance_uid: str
    series_instance_uid: str
    instance_count: int
    total_bytes: int
    content_digest: str
    sop_instance_uids_hash: str

    def voxel_count(self) -> int:
        """Return the number of voxels in this volume."""
        return int(self.dimensions[0]) * int(self.dimensions[1]) * int(self.dimensions[2])

    def byte_length(self) -> int:
        """Return the verified little-endian payload byte length."""
        return payload_byte_length(self.dimensions, self.format.dtype)

    def payload_bytes(self) -> bytes:
        """Return the C-contiguous little-endian payload bytes."""
        return np.ascontiguousarray(self.scalar).tobytes()


def _utc_rfc3339(when: datetime) -> str:
    """Format an aware instant as RFC 3339 UTC with microseconds (never naive)."""
    if when.tzinfo is None or when.utcoffset() is None:
        raise ValueError("publishedAt must be a timezone-aware UTC instant.")
    return when.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def descriptor_for(
    volume: DecodedVolume,
    *,
    handle: str,
    file_name: str,
    content_hash_value: str,
    ttl_seconds: int,
    published_at: datetime,
) -> dict[str, Any]:
    """Build the JSON transport descriptor (no voxels, no absolute path).

    ``correlation`` carries the observed ``SourceFingerprint`` fields (ADR-013 §5);
    ``publishedAt`` is the absolute UTC publication instant, ``ttlSeconds`` its TTL.
    """
    format_ = volume.format
    descriptor: dict[str, Any] = {
        "handle": handle,
        "fileName": file_name,
        "byteOrder": BYTE_ORDER,
        "dtype": format_.dtype,
        "signedness": format_.signedness,
        "samplesPerPixel": format_.samples_per_pixel,
        "bitsAllocated": format_.bits_allocated,
        "bitsStored": format_.bits_stored,
        "highBit": format_.high_bit,
        "photometricInterpretation": format_.photometric_interpretation,
        "scalarDataDomain": format_.scalar_data_domain,
        "dimensions": [int(value) for value in volume.dimensions],
        "byteLength": volume.byte_length(),
        "contentHash": content_hash_value,
        "geometricDigest": volume.geometry["geometricDigest"],
        "ttlSeconds": ttl_seconds,
        "publishedAt": _utc_rfc3339(published_at),
        "correlation": {
            "studyInstanceUID": volume.study_instance_uid,
            "seriesInstanceUID": volume.series_instance_uid,
            "instanceCount": volume.instance_count,
            "contentDigest": volume.content_digest,
            "geometricDigest": volume.geometry["geometricDigest"],
            "sopInstanceUIDsHash": volume.sop_instance_uids_hash,
            "totalBytes": volume.total_bytes,
            "frameOfReferenceUID": volume.geometry["frameOfReferenceUID"],
        },
    }
    if format_.rescale is not None:
        descriptor["rescale"] = {
            "slope": format_.rescale[0],
            "intercept": format_.rescale[1],
        }
    return descriptor
