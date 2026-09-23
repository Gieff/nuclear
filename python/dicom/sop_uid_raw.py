"""Fail-closed raw ``SOPInstanceUID`` capture at the pydicom parse boundary.

Pydicom normalizes a **UI** value before NuClear can apply the ratified exact
``RE_VALID_UID`` check: it strips one trailing NUL pad *and* silently strips a
non-conformant trailing space. A dataset whose on-disk ``SOPInstanceUID`` is the
invalid ``1.2.3 `` therefore reaches :func:`dicom.sop_uid_digest.is_valid_sop_instance_uid`
as the valid-looking ``1.2.3``, and the ADR-013 §5 source and UID digests are
computed over a value that never existed in conformant DICOM.

This module captures the *raw logical bytes* of the dataset ``(0008,0018)``
``SOPInstanceUID`` element through pydicom's own documented parse-boundary
extension point, :data:`pydicom.config.data_element_callback`. The hook runs
before pydicom converts the UI value, so the exact on-disk bytes are visible.
Pydicom remains the single DICOM parser: the hook does not parse bytes; it
observes a :class:`~pydicom.dataelem.RawDataElement` that pydicom produced. The
previous callback configuration (the callback and its kwargs) is saved and
restored in ``finally`` so no global pydicom state leaks, even on refusal.
``config.data_element_callback`` is deprecated in pydicom 3.0 in favour of the
narrower ``hooks`` API, but it is the only pre-conversion seam that sees the raw
value element and is supported across the declared ``pydicom>=2.4.0`` floor.

Accepted raw encoding (DICOM PS3.5 Table 6.2-1, UI): the value field is an even
number of ASCII bytes; an odd-length UID carries exactly one terminal NUL
(``0x00``) VR pad. Leading/trailing spaces, an embedded NUL, a second pad, BOM or
other non-ASCII bytes, an odd value length and invalid UID syntax all fail
closed. :func:`validate_raw_sop_uid_bytes` returns the pre-pad ASCII text, so the
ADR-013 §5 digest input is byte-for-byte unchanged for every conformant value.

A duplicate raw ``SOPInstanceUID`` element is refused as well: pydicom's dataset
dictionary would silently keep only one occurrence (last wins), so the element
generator's ``stop_when`` observer counts raw occurrences and
:func:`read_raw_sop_instance_uid` refuses anything other than exactly one.
"""

from __future__ import annotations

import io
from threading import RLock
from typing import Any

from pydicom import config
from pydicom.dataelem import RawDataElement
from pydicom.filereader import read_partial
from pydicom.tag import BaseTag, Tag

from .sop_uid_digest import is_valid_sop_instance_uid

#: Dataset tag ``(0008,0018) SOPInstanceUID`` (UI VR).
SOP_INSTANCE_UID_TAG = Tag(0x00080018)
_PYDICOM_CALLBACK_LOCK = RLock()

#: Same pixel-data stop condition pydicom's ``dcmread(stop_before_pixels=True)`` uses.
_PIXEL_DATA_TAGS = frozenset({0x7FE00010, 0x7FE00009, 0x7FE00008})


class SopUidRawRefusal(Exception):
    """The raw SOP Instance UID cannot be accepted; no value may be consumed."""

    def __init__(self, diagnostic: str) -> None:
        super().__init__(diagnostic)
        self.diagnostic = diagnostic


def validate_raw_sop_uid_bytes(raw_value: object) -> str:
    """Return the exact pre-pad UID text, or refuse a non-conformant encoding.

    The value field is only accepted as an even-length ASCII byte string whose
    optional single terminal NUL is the DICOM VR pad for an odd-length UID. No
    trimming, Unicode normalization or pydicom decoding is applied.

    Args:
        raw_value: The ``RawDataElement.value`` bytes for ``(0008,0018)``.

    Returns:
        The exact ASCII UID (the conformant terminal NUL pad removed).

    Raises:
        SopUidRawRefusal: The bytes are missing, oddly sized, padded wrongly,
            non-ASCII, contain an embedded NUL, or are not valid DICOM UID text.
    """
    if not isinstance(raw_value, bytes) or not raw_value:
        raise SopUidRawRefusal("SOPInstanceUID has no raw value bytes.")
    if len(raw_value) % 2 != 0:
        raise SopUidRawRefusal(
            "SOPInstanceUID raw value length is not an even number of bytes."
        )
    logical = raw_value[:-1] if raw_value.endswith(b"\x00") else raw_value
    if b"\x00" in logical:
        raise SopUidRawRefusal("SOPInstanceUID raw value contains an embedded NUL byte.")
    if not logical:
        raise SopUidRawRefusal("SOPInstanceUID raw value is empty.")
    try:
        text = logical.decode("ascii")
    except UnicodeDecodeError as exc:
        raise SopUidRawRefusal("SOPInstanceUID raw value is not ASCII.") from exc
    if not is_valid_sop_instance_uid(text):
        raise SopUidRawRefusal(
            "SOPInstanceUID raw value is not a syntactically valid DICOM UID."
        )
    return text


def read_raw_sop_instance_uid(raw_bytes: bytes) -> str:
    """Capture and validate ``(0008,0018)`` before pydicom normalizes the UI value.

    Pydicom is used as the parser through :func:`pydicom.filereader.read_partial`;
    a temporary :data:`pydicom.config.data_element_callback` records the raw value
    bytes and a ``stop_when`` observer counts raw occurrences. Both pydicom
    globals are restored before returning or raising.

    Args:
        raw_bytes: The exact instance bytes already being hashed by the caller.

    Returns:
        The exact pre-pad ASCII UID text.

    Raises:
        SopUidRawRefusal: The tag is absent, duplicated, not captured, or the raw
            value is not a conformant ASCII DICOM UI encoding.
    """
    with _PYDICOM_CALLBACK_LOCK:
        saved_callback = config.data_element_callback
        saved_kwargs = dict(config.data_element_callback_kwargs)
        captured: list[bytes | None] = []
        occurrences = 0

        def _capture(raw_elem: RawDataElement, **kwargs: Any) -> RawDataElement:
            observed = raw_elem
            if saved_callback is not None:
                observed = saved_callback(raw_elem, **{**saved_kwargs, **kwargs})
            if int(observed.tag) == int(SOP_INSTANCE_UID_TAG):
                captured.append(observed.value)
            return observed

        def _observe(tag: BaseTag, _vr: str | None, _length: int) -> bool:
            nonlocal occurrences
            if int(tag) == int(SOP_INSTANCE_UID_TAG):
                occurrences += 1
            return int(tag) in _PIXEL_DATA_TAGS

        config.data_element_callback = _capture
        config.data_element_callback_kwargs = {}
        try:
            with io.BytesIO(raw_bytes) as stream:
                dataset = read_partial(
                    stream, stop_when=_observe, specific_tags=[SOP_INSTANCE_UID_TAG]
                )
            # Force pydicom to convert the element so the hook sees ``raw.value``.
            dataset.get(SOP_INSTANCE_UID_TAG)
        finally:
            config.data_element_callback = saved_callback
            config.data_element_callback_kwargs = saved_kwargs

    if occurrences != 1:
        raise SopUidRawRefusal(
            "SOPInstanceUID must appear exactly once as a raw dataset element."
        )
    if len(captured) != 1:
        raise SopUidRawRefusal("SOPInstanceUID raw value bytes were not captured.")
    return validate_raw_sop_uid_bytes(captured[0])


__all__ = [
    "SOP_INSTANCE_UID_TAG",
    "SopUidRawRefusal",
    "read_raw_sop_instance_uid",
    "validate_raw_sop_uid_bytes",
]
