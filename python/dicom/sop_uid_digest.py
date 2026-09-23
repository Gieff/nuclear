"""Owner-ratified ``SourceFingerprint.sopInstanceUIDsHash`` (ADR-013 §5, 2026-09-23).

Pure canonicalization of the ordered-independent set of selected-series SOP
Instance UIDs. Syntax validity requires an exact DICOM UI value; the exact parsed
value is preserved with no BOM, trimming, Unicode normalization or padding.

Canonical input (every integer is an unsigned 64-bit big-endian byte count)::

    uint64be(len(domain)) || domain           # ASCII NuClear-DICOM-SOPInstanceUIDs-v1
    || uint64be(uidCount)
    || repeat(uint64be(uidUtf8Length) || uidUtf8)

UIDs are sorted lexicographically by their exact ASCII bytes and the digest is
``sha256:<64 lowercase hex>``. It is distinct from the raw-instance
``contentDigest`` and the decoded scalar payload ``contentHash``.
"""

from __future__ import annotations

import hashlib
import re
import struct
from collections.abc import Sequence

from pydicom.uid import RE_VALID_UID

SOP_UID_DIGEST_DOMAIN = b"NuClear-DICOM-SOPInstanceUIDs-v1"
SOP_UID_DIGEST_PREFIX = "sha256:"
SOP_UID_DIGEST_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
MAX_UID_LENGTH = 64


class SopUidDigestRefusal(Exception):
    """Missing/duplicate/syntactically invalid SOP identity; no partial digest."""

    def __init__(self, diagnostic: str) -> None:
        super().__init__(diagnostic)
        self.diagnostic = diagnostic


def is_valid_sop_instance_uid(value: object) -> bool:
    """Return whether ``value`` is an exact, syntactically valid DICOM UID.

    ``RE_VALID_UID`` is pydicom's own UI-VR syntax. It is applied with
    ``fullmatch`` because pydicom's ``UID`` constructor strips whitespace and its
    ``is_valid`` property uses ``re.match`` with ``$`` (tolerating a trailing
    newline). NuClear must reject ``" 1.2.3 "`` rather than silently trim it.
    """
    return (
        isinstance(value, str)
        and 0 < len(value) <= MAX_UID_LENGTH
        and RE_VALID_UID.fullmatch(value) is not None
    )


def require_valid_sop_instance_uid(value: object) -> str:
    """Return the exact valid UID, else refuse with no partial digest.

    Raises:
        SopUidDigestRefusal: ``value`` is absent or not exact DICOM UID syntax.
    """
    if not is_valid_sop_instance_uid(value):
        raise SopUidDigestRefusal("an instance has a missing or syntactically invalid SOPInstanceUID.")
    assert isinstance(value, str)  # guaranteed by is_valid_sop_instance_uid
    return value


def is_sop_uid_digest(value: object) -> bool:
    """Return whether ``value`` is an accepted ``sha256:<64 lowercase hex>`` hash."""
    return isinstance(value, str) and SOP_UID_DIGEST_PATTERN.fullmatch(value) is not None


def canonical_sop_uid_bytes(values: Sequence[object]) -> bytes:
    """Return the exact ADR-013 §5 canonical byte input for ``values``.

    Raises:
        SopUidDigestRefusal: A missing, duplicate or invalid UID is present.
    """
    validated: list[str] = []
    seen: set[str] = set()
    for value in values:
        uid = require_valid_sop_instance_uid(value)
        if uid in seen:
            raise SopUidDigestRefusal("an instance duplicates a SOPInstanceUID.")
        seen.add(uid)
        validated.append(uid)
    ordered = sorted(validated, key=lambda uid: uid.encode("utf-8"))
    parts = [
        struct.pack(">Q", len(SOP_UID_DIGEST_DOMAIN)),
        SOP_UID_DIGEST_DOMAIN,
        struct.pack(">Q", len(ordered)),
    ]
    for uid in ordered:
        encoded = uid.encode("utf-8")
        parts.append(struct.pack(">Q", len(encoded)))
        parts.append(encoded)
    return b"".join(parts)


def compute_sop_instance_uids_hash(values: Sequence[object]) -> str:
    """Return ``sha256:<hex>`` over the canonical SOP Instance UID set."""
    return SOP_UID_DIGEST_PREFIX + hashlib.sha256(canonical_sop_uid_bytes(values)).hexdigest()
