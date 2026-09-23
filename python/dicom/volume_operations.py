"""DICOM pixel decode and volume transport operations (ADR-013 §§1/3/8).

Validates geometry/format/§6 before pixels; ``PreparedSeries.decode`` parses only
the exact bytes hashed by :mod:`dicom.source_fingerprint` (``-32013..-32018``).
"""
from __future__ import annotations

import io
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

import numpy as np
import pydicom
from pydicom.dataset import Dataset
from pydicom.uid import UID

from worker.protocol import (
    DICOM_VOLUME_METHOD, ERROR_MESSAGES, INVALID_PARAMS, VOLUME_DECODE_FAILED,
    VOLUME_RELEASE_METHOD, ProtocolError, iso8601_utc,
)

from .geometry import extract_series_geometry
from .geometry_metadata import geometry_instance_from_dataset
from .locators import SourceLocator, parse_locator
from .source_fingerprint import (
    ObservedFingerprint, SeriesSource, load_series_source,
    require_expected_frame_of_reference, require_matching_fingerprint,
)
from .volume_payload import (
    SIGNEDNESS_BY_DTYPE, DecodedVolume, ExpectedFingerprint, FingerprintSchemaError,
    PayloadFormat, ScalarDataDomain, ScalarDataType, enforce_volume_limits, numpy_dtype,
    parse_expected_fingerprint, payload_byte_length,
)
from .volume_store import VolumeStore

Clock = Callable[[], datetime]
DecodeReason = Literal["unsupported-pixel-representation", "missing-pixel-format", "decode-error"]

_MONOCHROME = frozenset({"MONOCHROME1", "MONOCHROME2"})
_STORED_DTYPE: dict[tuple[int, int], ScalarDataType] = {
    (8, 0): "uint8", (8, 1): "int8", (16, 0): "uint16", (16, 1): "int16",
}


def _invalid_params(method: str, violations: list[str]) -> ProtocolError:
    """Build the ``-32602`` schema violation carrying every collected message."""
    return ProtocolError(INVALID_PARAMS, ERROR_MESSAGES[INVALID_PARAMS],
        {"diagnostic": f"Invalid params for {method}.", "violations": violations})


def _series_uid(params: Mapping[str, Any], method: str) -> str:
    """Return a validated non-empty ``seriesInstanceUID``, else refuse ``-32602``."""
    value = params.get("seriesInstanceUID")
    if not isinstance(value, str) or not value:
        raise _invalid_params(method, ["params.seriesInstanceUID must be a non-empty string."])
    return value


def _decode_error(reason: DecodeReason, series_uid: str, diagnostic: str) -> ProtocolError:
    """Build a ``-32013`` decode refusal with the closed reason."""
    return ProtocolError(VOLUME_DECODE_FAILED, ERROR_MESSAGES[VOLUME_DECODE_FAILED],
        {"diagnostic": diagnostic, "reason": reason, "seriesInstanceUID": series_uid})


def _position(dataset: Dataset) -> tuple[float, float, float]:
    """Return ``ImagePositionPatient`` as finite floats for slice ordering."""
    raw = dataset.get("ImagePositionPatient")
    values = [float(item) for item in raw] if raw is not None else [0.0, 0.0, 0.0]
    return (values[0], values[1], values[2])


def _require_tag(dataset: Dataset, keyword: str, series_uid: str) -> Any:
    """Return a required Type-1 metadata tag, else refuse ``-32013`` (no default)."""
    value = dataset.get(keyword)
    if value is None:
        raise _decode_error("missing-pixel-format", series_uid, f"{keyword} is absent.")
    return value


def _rescale(dataset: Dataset, series_uid: str) -> tuple[float, float] | None:
    """Return finite ``(slope, intercept)``; ``None`` when both tags are absent (ADR-013)."""
    raw = (dataset.get("RescaleSlope"), dataset.get("RescaleIntercept"))
    if raw == (None, None):
        return None
    if None in raw:
        raise _decode_error("missing-pixel-format", series_uid,
            "exactly one rescale tag is present; no implicit transform is applied.")
    try:
        pair = (float(raw[0]), float(raw[1]))
    except (TypeError, ValueError) as exc:
        raise _decode_error("decode-error", series_uid, "rescale tags are not numeric.") from exc
    if not all(np.isfinite(value) for value in pair):
        raise _decode_error("decode-error", series_uid, "rescale tags are not finite.")
    return pair


def _require_native_transfer_syntax(dataset: Dataset, series_uid: str) -> None:
    """Refuse a non-native/absent ``TransferSyntaxUID`` before any pixel decode (§8).

    A compressed syntax is ``unsupported-pixel-representation``, absent metadata is
    ``missing-pixel-format`` and an unrecognised UID is ``decode-error``; no codec or
    decoder fallback is ever installed.
    """
    file_meta = getattr(dataset, "file_meta", None)
    raw = file_meta.get("TransferSyntaxUID") if file_meta is not None else None
    if not raw:
        raise _decode_error("missing-pixel-format", series_uid, "TransferSyntaxUID is absent.")
    try:
        compressed = UID(str(raw)).is_compressed
    except ValueError as exc:
        raise _decode_error("decode-error", series_uid, "TransferSyntaxUID is unrecognised.") from exc
    if compressed:
        raise _decode_error("unsupported-pixel-representation", series_uid,
            f"TransferSyntaxUID '{raw}' is compressed; v1 installs no codec.")


def _pixel_format(dataset: Dataset, series_uid: str) -> PayloadFormat:
    """Derive the declared payload format, fail-closed (never inferred).

    A native uncompressed ``TransferSyntaxUID`` and a present ``SamplesPerPixel``
    are required. Both rescale tags absent is raw ``stored-values``; a partial or
    malformed/non-finite pair is refused; a non-identity rescale emits ``float32``.
    """
    _require_native_transfer_syntax(dataset, series_uid)
    samples = int(_require_tag(dataset, "SamplesPerPixel", series_uid))
    photometric = str(_require_tag(dataset, "PhotometricInterpretation", series_uid))
    bits_allocated = int(_require_tag(dataset, "BitsAllocated", series_uid))
    representation = int(_require_tag(dataset, "PixelRepresentation", series_uid))
    stored_key = (bits_allocated, representation)
    if samples != 1:
        raise _decode_error("unsupported-pixel-representation", series_uid,
            f"SamplesPerPixel is {samples}; the v1 scalar payload requires 1.")
    if photometric not in _MONOCHROME:
        raise _decode_error("unsupported-pixel-representation", series_uid,
            f"PhotometricInterpretation '{photometric}' is not monochrome.")
    if stored_key not in _STORED_DTYPE:
        raise _decode_error("unsupported-pixel-representation", series_uid,
            f"BitsAllocated={bits_allocated} PixelRepresentation={representation} is not supported.")
    bits_stored = int(_require_tag(dataset, "BitsStored", series_uid))
    high_bit = int(_require_tag(dataset, "HighBit", series_uid))
    modality = str(dataset.get("Modality") or "").upper()
    units = str(dataset.get("Units") or "").upper()
    pair = _rescale(dataset, series_uid)
    if pair is None or pair == (1.0, 0.0):
        domain: ScalarDataDomain = "stored-values"
        dtype: ScalarDataType = _STORED_DTYPE[stored_key]
        rescale: tuple[float, float] | None = None
    elif modality == "CT":
        domain, dtype, rescale = "rescaled-hu", "float32", pair
    elif modality == "PT" and units == "BQML":
        domain, dtype, rescale = "rescaled-bqml", "float32", pair
    else:
        raise _decode_error("unsupported-pixel-representation", series_uid,
            f"Modality '{modality}' Units '{units}' does not map to an accepted scalarDataDomain.")
    return PayloadFormat(dtype=dtype, signedness=SIGNEDNESS_BY_DTYPE[dtype],
        samples_per_pixel=1, bits_allocated=bits_allocated, bits_stored=bits_stored, high_bit=high_bit,
        photometric_interpretation=photometric, scalar_data_domain=domain, rescale=rescale)


def _format_from_instances(source: SeriesSource) -> PayloadFormat:
    """Return the single declared format shared by all selected instances."""
    format_: PayloadFormat | None = None
    for instance in source.instances:
        declared = _pixel_format(instance.dataset, source.series_uid)
        if format_ is None:
            format_ = declared
        elif declared != format_:
            raise _decode_error("decode-error", source.series_uid, "instances declare inconsistent formats.")
    assert format_ is not None  # guaranteed by the non-empty source
    return format_


@dataclass(frozen=True)
class PreparedSeries:
    """A validated series: geometry, declared format and raw bytes (no pixels)."""

    source: SeriesSource
    geometry: Mapping[str, Any]
    format: PayloadFormat
    dimensions: tuple[int, int, int]

    def voxel_count(self) -> int:
        """Return ``nx * ny * nz``."""
        return int(self.dimensions[0]) * int(self.dimensions[1]) * int(self.dimensions[2])

    def byte_length(self) -> int:
        """Return ``nx * ny * nz * bytesPerVoxel`` for the declared dtype."""
        return payload_byte_length(self.dimensions, self.format.dtype)

    def observed_fingerprint(self) -> ObservedFingerprint:
        """Return the observed source fingerprint (geometry from worker evidence)."""
        return ObservedFingerprint(
            study_instance_uid=self.source.study_instance_uid, series_instance_uid=self.source.series_uid,
            instance_count=self.source.instance_count, content_digest=self.source.content_digest,
            geometric_digest=str(self.geometry["geometricDigest"]),
            sop_instance_uids_hash=self.source.sop_instance_uids_hash, total_bytes=self.source.total_bytes,
            frame_of_reference_uid=str(self.geometry["frameOfReferenceUID"]))

    def decode(self) -> DecodedVolume:
        """Parse pixels from the exact hashed raw bytes into a typed payload."""
        normal = [float(value) for value in self.geometry["sliceNormal"]]
        rows, columns = int(self.dimensions[1]), int(self.dimensions[0])
        ordered = sorted(
            self.source.instances,
            key=lambda item: sum(a * b for a, b in zip(_position(item.dataset), normal)))
        arrays: list[np.ndarray[Any, Any]] = []
        for instance in ordered:
            full = pydicom.dcmread(io.BytesIO(instance.raw_bytes))  # same bytes as the digest
            declared = _pixel_format(full, self.source.series_uid)
            if declared != self.format:
                raise _decode_error("decode-error", self.source.series_uid,
                    "instance pixel format changed between validation and decode.")
            stored = np.asarray(full.pixel_array)
            if stored.shape != (rows, columns):
                raise _decode_error("decode-error", self.source.series_uid,
                    "pixel grid disagrees with the accepted geometry.")
            if declared.rescale is None:
                arrays.append(np.ascontiguousarray(stored.astype(numpy_dtype(declared.dtype), copy=False)))
            else:
                slope, intercept = declared.rescale
                arrays.append(np.ascontiguousarray(
                    (stored.astype(np.float64) * slope + intercept).astype(numpy_dtype(declared.dtype))))
        return DecodedVolume(
            scalar=np.ascontiguousarray(np.stack(arrays, axis=0)), format=self.format, dimensions=self.dimensions,
            geometry=self.geometry, study_instance_uid=self.source.study_instance_uid,
            series_instance_uid=self.source.series_uid, instance_count=self.source.instance_count,
            total_bytes=self.source.total_bytes, content_digest=self.source.content_digest,
            sop_instance_uids_hash=self.source.sop_instance_uids_hash)


def prepare_series(locator: SourceLocator, series_uid: str) -> PreparedSeries:
    """Validate geometry, declared format and §6 limits before any pixel allocation."""
    source = load_series_source(locator, series_uid)
    members = [geometry_instance_from_dataset(item.dataset, item.file_name) for item in source.instances]
    geometry_result = extract_series_geometry(members, series_uid, [])
    if geometry_result.get("status") != "computed":
        raise _decode_error("decode-error", series_uid,
            f"accepted worker geometry is '{geometry_result.get('status')}' "
            f"({geometry_result.get('reason')}).")
    geometry: Mapping[str, Any] = geometry_result["geometry"]
    format_ = _format_from_instances(source)
    length = [int(value) for value in geometry["dimensions"]]
    dimensions = (length[0], length[1], length[2])
    enforce_volume_limits(dimensions[0] * dimensions[1] * dimensions[2],
        payload_byte_length(dimensions, format_.dtype), series_uid)
    return PreparedSeries(source=source, geometry=geometry, format=format_, dimensions=dimensions)


def decode_series(locator: SourceLocator, series_uid: str) -> DecodedVolume:
    """Decode one series through the shared hydration service."""
    return prepare_series(locator, series_uid).decode()


def _metadata(operation: str, clock: Clock, parameters: dict[str, Any]) -> dict[str, Any]:
    """Build the ADR-002 worker provenance block."""
    import worker  # local import avoids a package import cycle at module load

    return {"workerVersion": worker.__version__, "operation": operation,
            "timestamp": iso8601_utc(clock()), "parameters": parameters}


def _expected(params: Mapping[str, Any], method: str) -> tuple[ExpectedFingerprint, str]:
    """Validate the required expected fingerprint + Frame of Reference."""
    try:
        expected = parse_expected_fingerprint(params.get("expectedFingerprint"), "params.expectedFingerprint")
    except FingerprintSchemaError as exc:
        raise _invalid_params(method, [str(exc)]) from exc
    expected_for = params.get("expectedFrameOfReferenceUID")
    if not isinstance(expected_for, str) or not expected_for:
        raise _invalid_params(method, ["params.expectedFrameOfReferenceUID must be a non-empty string."])
    return expected, expected_for


def volume_operation(params: Mapping[str, Any], *, clock: Clock, store: VolumeStore) -> dict[str, Any]:
    """Execute ``nuclear.dicom.volume``: correlate, decode, publish the descriptor."""
    locator = parse_locator(params, method=DICOM_VOLUME_METHOD)
    series_uid = _series_uid(params, DICOM_VOLUME_METHOD)
    expected, expected_for = _expected(params, DICOM_VOLUME_METHOD)
    prepared = prepare_series(locator, series_uid)
    observed = prepared.observed_fingerprint()
    require_matching_fingerprint(observed, expected, series_uid=series_uid)
    require_expected_frame_of_reference(
        observed.frame_of_reference_uid, expected_for, series_uid=series_uid)
    descriptor = store.publish(prepared.decode())
    return {"descriptor": descriptor, "workerMetadata": _metadata(DICOM_VOLUME_METHOD, clock, {
        "locatorKind": locator.kind, "seriesInstanceUID": series_uid, "dtype": prepared.format.dtype,
        "dimensions": [int(value) for value in prepared.dimensions],
        "byteLength": prepared.byte_length()})}


def volume_release_operation(params: Mapping[str, Any], *, clock: Clock, store: VolumeStore) -> dict[str, Any]:
    """Execute ``nuclear.volume.release``: idempotent, single-owner release."""
    handle = params.get("handle")
    if not isinstance(handle, str) or not handle:
        raise _invalid_params(VOLUME_RELEASE_METHOD, ["params.handle must be a non-empty string."])
    removed = store.release(handle)
    return {"handle": handle, "status": "released" if removed else "noop",
            "workerMetadata": _metadata(VOLUME_RELEASE_METHOD, clock, {"handle": handle})}
