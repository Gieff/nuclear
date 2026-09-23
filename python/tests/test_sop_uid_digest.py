"""Owner-ratified ``sopInstanceUIDsHash`` golden, negative and order evidence.

The digest is computed here by a second, independently written encoder that does
not import the implementation, and pinned to a hard-coded literal, so a change to
:mod:`dicom.sop_uid_digest` cannot silently redefine the ratified ADR-013 §5
contract. Committed synthetic UIDs only; no patient data.
"""

from __future__ import annotations

import hashlib
import struct

import pytest

from dicom.sop_uid_digest import (
    SOP_UID_DIGEST_DOMAIN,
    SopUidDigestRefusal,
    canonical_sop_uid_bytes,
    compute_sop_instance_uids_hash,
    is_sop_uid_digest,
    is_valid_sop_instance_uid,
)

#: Independently encoded from the ADR-013 §5 framing for these exact ASCII UIDs.
GOLDEN_UIDS = ("1.2.3", "1.2.840.10008.5.1.4.1.1.2", "10.20.30")
GOLDEN_DIGEST = "sha256:1b22e59a045fdbd49a9e2f8ea21e9717302d3c67f6076e735efc90bea7064e70"


def _reference_encoder(uids: list[str]) -> str:
    """Independent encoder: ``bytearray`` framing with ``int.to_bytes``."""
    ordered = sorted(uids, key=lambda uid: uid.encode("ascii"))
    out = bytearray()
    out += len(SOP_UID_DIGEST_DOMAIN).to_bytes(8, "big")
    out += SOP_UID_DIGEST_DOMAIN
    out += len(ordered).to_bytes(8, "big")
    for uid in ordered:
        encoded = uid.encode("utf-8")
        out += len(encoded).to_bytes(8, "big")
        out += encoded
    return "sha256:" + hashlib.sha256(bytes(out)).hexdigest()


def test_golden_digest_is_pinned_by_an_independent_encoder() -> None:
    assert _reference_encoder(list(GOLDEN_UIDS)) == GOLDEN_DIGEST
    assert compute_sop_instance_uids_hash(list(GOLDEN_UIDS)) == GOLDEN_DIGEST


def test_digest_is_order_independent() -> None:
    assert compute_sop_instance_uids_hash(list(reversed(GOLDEN_UIDS))) == GOLDEN_DIGEST
    shuffled = ["1.2.30", "10.20.30", "1.2.3", "1.2.3.40", "1.2.840.10008.5.1.4.1.1.2", "1.2.3.4"]
    assert compute_sop_instance_uids_hash(shuffled) == _reference_encoder(shuffled)


def test_altering_one_uid_changes_the_digest() -> None:
    assert compute_sop_instance_uids_hash(["1.2.4", *GOLDEN_UIDS[1:]]) != GOLDEN_DIGEST


def test_canonical_bytes_frame_domain_count_and_records_exactly() -> None:
    uid = "1.2.3"
    encoded = uid.encode("ascii")
    expected = (
        struct.pack(">Q", len(SOP_UID_DIGEST_DOMAIN)) + SOP_UID_DIGEST_DOMAIN
        + struct.pack(">Q", 1) + struct.pack(">Q", len(encoded)) + encoded
    )
    assert canonical_sop_uid_bytes([uid]) == expected
    assert compute_sop_instance_uids_hash([uid]) == "sha256:" + hashlib.sha256(expected).hexdigest()


@pytest.mark.parametrize(
    "bad",
    [None, "", " ", " 1.2.3 ", "1.2.3 ", " 1.2.3", "1.2.3\n", "1.2.3\x00", "01.2.3",
     "1..2", ".1.2", "1.2.", "1.2.a", "x" * 65, "١.٢.٣", "１.２.３"],
)
def test_invalid_non_ascii_and_no_trim_uids_are_refused(bad: object) -> None:
    assert not is_valid_sop_instance_uid(bad)
    with pytest.raises(SopUidDigestRefusal):
        compute_sop_instance_uids_hash([bad])


def test_exact_valid_uid_syntax_is_accepted() -> None:
    for ok in ("0", "0.0", "1.2.3", "1.2.840.10008.5.1.4.1.1.128", "1" * 64):
        assert is_valid_sop_instance_uid(ok)
    assert not is_valid_sop_instance_uid("1.2.3" + "0" * 60)  # 65 characters


def test_missing_duplicate_and_invalid_uids_refuse_without_partial_digest() -> None:
    with pytest.raises(SopUidDigestRefusal):
        compute_sop_instance_uids_hash(["1.2.3", "01.2"])
    with pytest.raises(SopUidDigestRefusal):
        compute_sop_instance_uids_hash(["1.2.3", "1.2.10", "1.2.3"])
    with pytest.raises(SopUidDigestRefusal):
        compute_sop_instance_uids_hash(["1.2.3", " 1.2.3 "])


def test_digest_format_helper_requires_lowercase_sha256() -> None:
    assert is_sop_uid_digest(GOLDEN_DIGEST)
    assert not is_sop_uid_digest("sha256:" + "A" * 64)
    assert not is_sop_uid_digest("sha256:" + "0" * 63)
    assert not is_sop_uid_digest("md5:" + "0" * 64)
