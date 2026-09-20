"""Deterministic synthetic DICOM instances for the P2.2 fixture suite.

Every dataset is metadata-only: no pixel data is generated or written. UIDs are
fixed, valid dot-decimal values (<= 64 characters) so that an inspection run is
reproducible byte-for-byte. These fixtures are synthetic test data only; they
are never clinical evidence and never carry patient identifiers.

The standard SOP Class UIDs are taken from :mod:`dicom.metadata` so the
generator and the classifier cannot drift.
"""

from __future__ import annotations

from pathlib import Path

from synthetic_common import write_metadata_dataset as _write

from dicom.metadata import (
    CT_IMAGE_STORAGE,
    PET_IMAGE_STORAGE,
    SECONDARY_CAPTURE_IMAGE_STORAGE,
)

MR_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.4"

# Fixed deterministic UID roots (valid dot-decimal, <= 64 chars).
_CT_STUDY = "1.2.826.0.1.3680043.10.2001.1"
_CT_SERIES = "1.2.826.0.1.3680043.10.2001.2"
_CT_SOP = "1.2.826.0.1.3680043.10.2001.3"
_PT_STUDY = "1.2.826.0.1.3680043.10.2002.1"
_PT_SERIES = "1.2.826.0.1.3680043.10.2002.2"
_PT_SOP = "1.2.826.0.1.3680043.10.2002.3"
_LOCALIZER_STUDY = "1.2.826.0.1.3680043.10.2003.1"
_LOCALIZER_SERIES = "1.2.826.0.1.3680043.10.2003.2"
_LOCALIZER_SOP = "1.2.826.0.1.3680043.10.2003.3"
_SC_STUDY = "1.2.826.0.1.3680043.10.2004.1"
_SC_SERIES = "1.2.826.0.1.3680043.10.2004.2"
_SC_SOP = "1.2.826.0.1.3680043.10.2004.3"
_MR_STUDY = "1.2.826.0.1.3680043.10.2005.1"
_MR_SERIES = "1.2.826.0.1.3680043.10.2005.2"
_MR_SOP = "1.2.826.0.1.3680043.10.2005.3"
_MISSING_STUDY = "1.2.826.0.1.3680043.10.2006.1"
_MISSING_SERIES = "1.2.826.0.1.3680043.10.2006.2"
_MISSING_SOP = "1.2.826.0.1.3680043.10.2006.3"
_NON_AXIAL_STUDY = "1.2.826.0.1.3680043.10.2007.1"
_NON_AXIAL_SERIES = "1.2.826.0.1.3680043.10.2007.2"
_NON_AXIAL_SOP = "1.2.826.0.1.3680043.10.2007.3"
_MIXED_STUDY = "1.2.826.0.1.3680043.10.2010.1"
_MIXED_CT_SERIES = "1.2.826.0.1.3680043.10.2010.2"
_MIXED_CT_SOP = "1.2.826.0.1.3680043.10.2010.20"
_MIXED_LOCALIZER_SERIES = "1.2.826.0.1.3680043.10.2010.3"
_MIXED_LOCALIZER_SOP = "1.2.826.0.1.3680043.10.2010.30"
_MIXED_SC_SERIES = "1.2.826.0.1.3680043.10.2010.4"
_MIXED_SC_SOP = "1.2.826.0.1.3680043.10.2010.40"

NON_DICOM_FILE_NAME = "notes.txt"


def write_ct_primary(directory: Path) -> None:
    """Write three primary axial CT slices (3 instances, one series)."""
    for index in range(3):
        _write(
            directory,
            f"ct-primary-{index + 1}.dcm",
            study_uid=_CT_STUDY,
            series_uid=_CT_SERIES,
            sop_uid=f"{_CT_SOP}.{index + 1}",
            sop_class_uid=CT_IMAGE_STORAGE,
            modality="CT",
            image_type=("ORIGINAL", "PRIMARY", "AXIAL"),
            series_number=1,
        )


def write_ct_non_axial(directory: Path) -> None:
    """Write one non-axial CT instance (`ORIGINAL`, `PRIMARY`, `CORONAL`)."""
    _write(
        directory,
        "ct-non-axial-1.dcm",
        study_uid=_NON_AXIAL_STUDY,
        series_uid=_NON_AXIAL_SERIES,
        sop_uid=_NON_AXIAL_SOP,
        sop_class_uid=CT_IMAGE_STORAGE,
        modality="CT",
        image_type=("ORIGINAL", "PRIMARY", "CORONAL"),
        series_number=1,
    )


def write_pt_attenuation_corrected(directory: Path) -> None:
    """Write one attenuation-corrected PET instance."""
    _write(
        directory,
        "pt-attenuation-corrected-1.dcm",
        study_uid=_PT_STUDY,
        series_uid=_PT_SERIES,
        sop_uid=_PT_SOP,
        sop_class_uid=PET_IMAGE_STORAGE,
        modality="PT",
        image_type=("ORIGINAL", "PRIMARY"),
        corrected_image=("DECY", "ATTN", "SCAT"),
        series_number=1,
    )


def write_ct_localizer(directory: Path) -> None:
    """Write one CT scout/localizer instance."""
    _write(
        directory,
        "ct-localizer-1.dcm",
        study_uid=_LOCALIZER_STUDY,
        series_uid=_LOCALIZER_SERIES,
        sop_uid=_LOCALIZER_SOP,
        sop_class_uid=CT_IMAGE_STORAGE,
        modality="CT",
        image_type=("ORIGINAL", "PRIMARY", "LOCALIZER"),
        series_number=1,
    )


def write_secondary_capture(directory: Path) -> None:
    """Write one Secondary Capture instance."""
    _write(
        directory,
        "secondary-capture-1.dcm",
        study_uid=_SC_STUDY,
        series_uid=_SC_SERIES,
        sop_uid=_SC_SOP,
        sop_class_uid=SECONDARY_CAPTURE_IMAGE_STORAGE,
        modality="OT",
        image_type=("DERIVED", "SECONDARY"),
        series_number=1,
    )


def write_unsupported_modality(directory: Path) -> None:
    """Write one MR instance, i.e. a modality outside the CT/PT classifier."""
    _write(
        directory,
        "unsupported-modality-1.dcm",
        study_uid=_MR_STUDY,
        series_uid=_MR_SERIES,
        sop_uid=_MR_SOP,
        sop_class_uid=MR_IMAGE_STORAGE,
        modality="MR",
        image_type=("ORIGINAL", "PRIMARY", "AXIAL"),
        series_number=1,
    )


def write_missing_required_tag(directory: Path) -> None:
    """Write one CT instance with the required ``Modality`` tag absent."""
    _write(
        directory,
        "missing-required-tag-1.dcm",
        study_uid=_MISSING_STUDY,
        series_uid=_MISSING_SERIES,
        sop_uid=_MISSING_SOP,
        sop_class_uid=CT_IMAGE_STORAGE,
        image_type=("ORIGINAL", "PRIMARY", "AXIAL"),
        series_number=1,
    )


def write_non_dicom(directory: Path) -> None:
    """Write a plain-text file that must be skipped with a warning."""
    (directory / NON_DICOM_FILE_NAME).write_text("not a dicom file\n", encoding="utf-8")


def write_mixed_folder(directory: Path) -> None:
    """Write CT primary + localizer + secondary capture + a non-DICOM file."""
    for index in range(2):
        _write(
            directory,
            f"ct-primary-{index + 1}.dcm",
            study_uid=_MIXED_STUDY,
            series_uid=_MIXED_CT_SERIES,
            sop_uid=f"{_MIXED_CT_SOP}.{index + 1}",
            sop_class_uid=CT_IMAGE_STORAGE,
            modality="CT",
            image_type=("ORIGINAL", "PRIMARY", "AXIAL"),
            series_number=2,
        )
    _write(
        directory,
        "ct-localizer-1.dcm",
        study_uid=_MIXED_STUDY,
        series_uid=_MIXED_LOCALIZER_SERIES,
        sop_uid=_MIXED_LOCALIZER_SOP,
        sop_class_uid=CT_IMAGE_STORAGE,
        modality="CT",
        image_type=("ORIGINAL", "PRIMARY", "LOCALIZER"),
        series_number=3,
    )
    _write(
        directory,
        "secondary-capture-1.dcm",
        study_uid=_MIXED_STUDY,
        series_uid=_MIXED_SC_SERIES,
        sop_uid=_MIXED_SC_SOP,
        sop_class_uid=SECONDARY_CAPTURE_IMAGE_STORAGE,
        modality="OT",
        image_type=("DERIVED", "SECONDARY"),
        series_number=4,
    )
    write_non_dicom(directory)
