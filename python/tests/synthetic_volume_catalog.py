"""Declared identity, pixel format and PET acquisition tags for volume fixtures.

Test-only catalog shared by :mod:`synthetic_pixel_volume` (the writer/evidence
generator) and its regression suite. It declares no pixels and performs no
DICOM or filesystem access. The PET acquisition values are synthetic fixture
declarations, not clinical claims (ADR-004).

``PT_COREG_FIXTURE`` intentionally reuses the CT ``study_uid``/``frame_uid`` and
the shared module geometry constants, so it is a genuinely co-referenced
inter-study PET counterpart to ``ct-axial``. ``pt-axial`` keeps its distinct
Frame of Reference and remains the permanent negative pair for fusion.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from dicom.metadata import CT_IMAGE_STORAGE, PET_IMAGE_STORAGE


@dataclass(frozen=True)
class VolumeFixture:
    """Declared identity, pixel format and PET acquisition tags for one fixture."""

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
    patient_weight_kg: float | None = None
    acquisition_datetime: str | None = None
    radionuclide_half_life_seconds: float | None = None
    radionuclide_total_dose_bq: float | None = None
    radiopharmaceutical_start_datetime: str | None = None


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
    patient_weight_kg=70.0,
    acquisition_datetime="20260921083000",
    radionuclide_half_life_seconds=6586.2,
    radionuclide_total_dose_bq=370000000.0,
    radiopharmaceutical_start_datetime="20260921080000",
)

PT_COREG_FIXTURE = replace(
    PT_FIXTURE,
    directory="pt-axial-coreg",
    asset_id="fixture.volume.pt-axial-coreg",
    study_uid=CT_FIXTURE.study_uid,
    series_uid="1.2.826.0.1.3680043.10.5001.5",
    sop_root="1.2.826.0.1.3680043.10.5001.6",
    frame_uid=CT_FIXTURE.frame_uid,
    stored_offset=200,
)

FIXTURES = (CT_FIXTURE, PT_FIXTURE, PT_COREG_FIXTURE)
