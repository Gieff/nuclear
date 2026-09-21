"""Deterministic pixel-bearing CT and PT volume fixtures for P3.2 (test-only).

Scope
-----
Generates the committed P3.2 rendering fixtures under
``tests/rendering/fixtures/volumes/``. Everything here is test-only: the
payload and the descriptor are neither a runtime ``.ncp`` representation nor a
clinical authority (ADR-004).

Artifacts written per fixture directory
---------------------------------------
- ``instances/*.dcm``: three minimal ExplicitVRLittleEndian DICOM slices,
  4x4 in-plane, regular 2.0 mm slice spacing, 0.5 mm pixel spacing, fixed
  UIDs and fixed signed 16-bit stored pixel arrays. CT declares
  ``RescaleSlope``/``RescaleIntercept`` (HU). PT declares an attenuation-
  corrected tag set (``CorrectedImage`` ATTN, ``Units`` BQML,
  ``DecayCorrection`` START).
- ``pixels.json``: the declared payload. ``values`` is the base64 of the
  little-endian typed array in the declared domain (CT int16 rescaled HU,
  PT float32 rescaled Bq/mL). Element order is DICOM acquisition order:
  slice-major then row-major (x fastest inside a slice), which is also
  Cornerstone's scalar-data layout for ``dimensions`` = [columns, rows, slices].
  Signedness describes the declared payload dtype; source pixels are signed 16-bit.
- ``fixture.json``: the self-describing asset descriptor.
- ``expected-geometry.json``: the real ``nuclear.dicom.geometry`` result over
  the committed ``instances/`` directory. It is captured, not reshaped, with a
  frozen clock so the ``workerMetadata`` provenance is reproducible.

Regenerate in place (from the repository root)::

    python/worker/.venv/bin/python \\
        python/tests/synthetic_pixel_volume.py tests/rendering/fixtures/volumes
"""

from __future__ import annotations

import argparse
import base64
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

import numpy as np
from numpy.typing import NDArray
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import UID, ExplicitVRLittleEndian

from dicom.metadata import CT_IMAGE_STORAGE, PET_IMAGE_STORAGE
from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import DICOM_GEOMETRY_METHOD

FROZEN_NOW = datetime(2026, 9, 21, 0, 0, 0, tzinfo=timezone.utc)
REQUEST_ID = "req-p32-generate"

ROWS = 4
COLUMNS = 4
SLICES = 3
PIXEL_SPACING_MM = 0.5
SLICE_SPACING_MM = 2.0
ORIENTATION = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0)
ORIGIN = (0.0, 0.0, 0.0)

PROVENANCE_NOTE = (
    "NuClear P3.2 test-only fixture; not a clinical authority and not a "
    "runtime .ncp representation."
)

PayloadArray = NDArray[np.int16] | NDArray[np.float32]


@dataclass(frozen=True)
class VolumeFixture:
    """Declared identity and pixel format for one committed volume fixture."""

    directory: str
    asset_id: str
    modality: str
    sop_class_uid: str
    study_uid: str
    series_uid: str
    sop_root: str
    frame_uid: str
    image_type: tuple[str, ...]
    corrected_image: tuple[str, ...] | None
    units: str | None
    decay_correction: str | None
    stored_offset: int
    rescale_slope: float
    rescale_intercept: float
    payload_dtype: str
    signedness: str
    scalar_domain: str


CT_FIXTURE = VolumeFixture(
    directory="ct-axial",
    asset_id="fixture.volume.ct-axial",
    modality="CT",
    sop_class_uid=CT_IMAGE_STORAGE,
    study_uid="1.2.826.0.1.3680043.10.5001.1",
    series_uid="1.2.826.0.1.3680043.10.5001.2",
    sop_root="1.2.826.0.1.3680043.10.5001.3",
    frame_uid="1.2.826.0.1.3680043.10.5001.4",
    image_type=("ORIGINAL", "PRIMARY", "AXIAL"),
    corrected_image=None,
    units=None,
    decay_correction=None,
    stored_offset=1000,
    rescale_slope=1.0,
    rescale_intercept=-1024.0,
    payload_dtype="int16",
    signedness="signed",
    scalar_domain="rescaled-hu",
)

PT_FIXTURE = VolumeFixture(
    directory="pt-axial",
    asset_id="fixture.volume.pt-axial",
    modality="PT",
    sop_class_uid=PET_IMAGE_STORAGE,
    study_uid="1.2.826.0.1.3680043.10.5002.1",
    series_uid="1.2.826.0.1.3680043.10.5002.2",
    sop_root="1.2.826.0.1.3680043.10.5002.3",
    frame_uid="1.2.826.0.1.3680043.10.5002.4",
    image_type=("ORIGINAL", "PRIMARY"),
    corrected_image=("DECY", "ATTN", "SCAT"),
    units="BQML",
    decay_correction="START",
    stored_offset=100,
    rescale_slope=1000.0,
    rescale_intercept=0.0,
    payload_dtype="float32",
    signedness="not-applicable",
    scalar_domain="rescaled-bqml",
)

FIXTURES = (CT_FIXTURE, PT_FIXTURE)


def _stored_volume(offset: int) -> NDArray[np.int16]:
    """Return the 48-voxel signed 16-bit stored volume for one fixture."""
    flat = np.arange(ROWS * COLUMNS * SLICES, dtype=np.int64) + offset
    return cast("NDArray[np.int16]", flat.astype(np.dtype("<i2")))


def _declared_payload(fixture: VolumeFixture, stored: NDArray[np.int16]) -> PayloadArray:
    """Apply the declared rescale and cast to the declared payload dtype."""
    rescaled = stored.astype(np.float64) * fixture.rescale_slope + fixture.rescale_intercept
    if fixture.payload_dtype == "int16":
        return cast("NDArray[np.int16]", rescaled.astype(np.dtype("<i2")))
    return cast("NDArray[np.float32]", rescaled.astype(np.dtype("<f4")))


def _encode(values: PayloadArray) -> str:
    """Base64-encode the little-endian bytes of a typed payload array."""
    return base64.b64encode(values.tobytes()).decode("ascii")


def _write_instance(path: Path, fixture: VolumeFixture, index: int, pixels: NDArray[np.int16]) -> None:
    """Write one deterministic pixel-bearing DICOM slice instance."""
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = UID(fixture.sop_class_uid)
    meta.MediaStorageSOPInstanceUID = UID(f"{fixture.sop_root}.{index + 1}")
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    dataset = FileDataset(str(path), {}, file_meta=meta, preamble=b"\0" * 128)
    dataset.SOPClassUID = fixture.sop_class_uid
    dataset.SOPInstanceUID = f"{fixture.sop_root}.{index + 1}"
    dataset.StudyInstanceUID = fixture.study_uid
    dataset.SeriesInstanceUID = fixture.series_uid
    dataset.Modality = fixture.modality
    dataset.ImageType = list(fixture.image_type)
    if fixture.corrected_image is not None:
        dataset.CorrectedImage = list(fixture.corrected_image)
    dataset.SeriesNumber = 1
    dataset.FrameOfReferenceUID = fixture.frame_uid
    dataset.ImagePositionPatient = [ORIGIN[0], ORIGIN[1], ORIGIN[2] + index * SLICE_SPACING_MM]
    dataset.ImageOrientationPatient = list(ORIENTATION)
    dataset.PixelSpacing = [PIXEL_SPACING_MM, PIXEL_SPACING_MM]
    dataset.Rows = ROWS
    dataset.Columns = COLUMNS
    dataset.SamplesPerPixel = 1
    dataset.PhotometricInterpretation = "MONOCHROME2"
    dataset.BitsAllocated = 16
    dataset.BitsStored = 16
    dataset.HighBit = 15
    dataset.PixelRepresentation = 1
    dataset.RescaleSlope = fixture.rescale_slope
    dataset.RescaleIntercept = fixture.rescale_intercept
    if fixture.units is not None:
        dataset.Units = fixture.units
    if fixture.decay_correction is not None:
        dataset.DecayCorrection = fixture.decay_correction
    dataset.PixelData = pixels.tobytes()
    dataset.save_as(str(path), enforce_file_format=True)


def _write_instances(instances_dir: Path, fixture: VolumeFixture) -> NDArray[np.int16]:
    """Write the three committed slices and return the full stored volume."""
    instances_dir.mkdir(parents=True, exist_ok=True)
    volume = _stored_volume(fixture.stored_offset)
    for index in range(SLICES):
        start = index * ROWS * COLUMNS
        pixels = volume[start : start + ROWS * COLUMNS]
        _write_instance(instances_dir / f"{fixture.directory}-{index + 1}.dcm", fixture, index, pixels)
    return volume


def geometry_result(instances_dir: Path, series_uid: str) -> dict[str, Any]:
    """Run the real ``nuclear.dicom.geometry`` operation and return its result."""
    dispatcher = build_dispatcher(now=lambda: FROZEN_NOW)
    request = {
        "jsonrpc": "2.0",
        "id": REQUEST_ID,
        "protocolVersion": "1.0",
        "method": DICOM_GEOMETRY_METHOD,
        "params": {
            "locator": {"kind": "local-folder", "path": str(instances_dir)},
            "seriesInstanceUID": series_uid,
        },
    }
    response = process_record(json.dumps(request), 0, dispatcher)
    result = response.get("result")
    if not isinstance(result, dict):
        raise RuntimeError(f"nuclear.dicom.geometry failed while generating evidence: {response}")
    return cast(dict[str, Any], result)


def _pixels_document(fixture: VolumeFixture, declared: PayloadArray) -> dict[str, Any]:
    """Build the self-describing ``pixels.json`` document."""
    return {
        "encoding": "base64",
        "byteOrder": "little",
        "dtype": fixture.payload_dtype,
        "signedness": fixture.signedness,
        "samplesPerPixel": 1,
        "bitsAllocated": 16,
        "bitsStored": 16,
        "highBit": 15,
        "photometricInterpretation": "MONOCHROME2",
        "scalarDataDomain": fixture.scalar_domain,
        "rescale": {"slope": fixture.rescale_slope, "intercept": fixture.rescale_intercept},
        "dimensions": [COLUMNS, ROWS, SLICES],
        "values": _encode(declared),
    }


def _fixture_document(fixture: VolumeFixture) -> dict[str, Any]:
    """Build the self-describing ``fixture.json`` descriptor."""
    return {
        "assetId": fixture.asset_id,
        "studyInstanceUID": fixture.study_uid,
        "seriesInstanceUID": fixture.series_uid,
        "frameOfReferenceUID": fixture.frame_uid,
        "modality": fixture.modality,
        "kind": "volume",
        "classification": {"supported": True, "reason": None},
        "availability": "online",
        "instanceCount": SLICES,
        "pixelsPath": "pixels.json",
        "expectedGeometryPath": "expected-geometry.json",
        "provenanceNote": PROVENANCE_NOTE,
    }


def _write_json(path: Path, document: Mapping[str, Any]) -> None:
    """Write a deterministic pretty-printed JSON document with a trailing newline."""
    path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")


def write_fixture(output_root: Path, fixture: VolumeFixture) -> None:
    """Write all four artifacts for one fixture into ``output_root``."""
    directory = output_root / fixture.directory
    instances_dir = directory / "instances"
    volume = _write_instances(instances_dir, fixture)
    _write_json(directory / "pixels.json", _pixels_document(fixture, _declared_payload(fixture, volume)))
    _write_json(directory / "fixture.json", _fixture_document(fixture))
    _write_json(directory / "expected-geometry.json", geometry_result(instances_dir, fixture.series_uid))


def write_fixtures(output_root: Path) -> None:
    """Write every committed P3.2 volume fixture beneath ``output_root``."""
    for fixture in FIXTURES:
        write_fixture(output_root, fixture)


def main(argv: Sequence[str] | None = None) -> int:
    """Regenerate the committed fixtures into the given output directory."""
    parser = argparse.ArgumentParser(description="Write the P3.2 pixel-bearing volume fixtures.")
    parser.add_argument("output", type=Path, help="Fixture root, e.g. tests/rendering/fixtures/volumes")
    arguments = parser.parse_args(argv)
    write_fixtures(arguments.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
