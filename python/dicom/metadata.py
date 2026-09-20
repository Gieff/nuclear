"""Metadata-only DICOM value extraction and shared classification vocabulary.

This module owns the immutable :class:`InstanceMetadata` record read from a
pydicom dataset, the structured :class:`Diagnostic`, the standard SOP Class
UIDs, the shared modality vocabulary, the required identity tags and the
classification/diagnostic labels shared by the other ``dicom`` modules.

No pixels are ever read here; callers pass datasets opened with
``stop_before_pixels=True``.
"""

from __future__ import annotations

from dataclasses import dataclass

from pydicom.dataset import Dataset

CT_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.2"
PET_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.128"
SECONDARY_CAPTURE_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.7"

MODALITY_VOCABULARY = frozenset({"CT", "PT", "MR", "NM", "CR", "DX", "SC", "OT"})
REQUIRED_IDENTITY_TAGS = ("SOPInstanceUID", "StudyInstanceUID", "SeriesInstanceUID", "Modality")

CLASSIFICATION_CT_PRIMARY = "ct-primary"
CLASSIFICATION_PT_PRIMARY = "pt-primary"
CLASSIFICATION_PT_UNCORRECTED = "pt-uncorrected"
CLASSIFICATION_LOCALIZER = "localizer"
CLASSIFICATION_SECONDARY_CAPTURE = "secondary-capture"
CLASSIFICATION_UNSUPPORTED = "unsupported"

DIAGNOSTIC_MISSING_TAG = "dicom.missing-required-tag"
DIAGNOSTIC_SKIPPED_FILE = "dicom.skipped-file"
DIAGNOSTIC_INCONSISTENT = "dicom.inconsistent-series-metadata"


@dataclass(frozen=True)
class InstanceMetadata:
    """Metadata-only identity and classification tags for one DICOM instance."""

    study_instance_uid: str | None
    series_instance_uid: str | None
    sop_instance_uid: str | None
    sop_class_uid: str | None
    modality: str | None
    image_type: tuple[str, ...]
    corrected_image: tuple[str, ...]
    series_number: int | None
    file: str


@dataclass(frozen=True)
class Diagnostic:
    """A structured, deterministic inspection diagnostic."""

    code: str
    severity: str
    message: str
    file: str | None

    def as_dict(self) -> dict[str, str | None]:
        """Return the serializable diagnostic mapping."""
        return {
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
            "file": self.file,
        }


def _text(dataset: Dataset, keyword: str) -> str | None:
    value = dataset.get(keyword)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _tokens(dataset: Dataset, keyword: str) -> tuple[str, ...]:
    value = dataset.get(keyword)
    if value is None:
        return ()
    items = [value] if isinstance(value, str) else list(value)
    return tuple(token for token in (str(item).strip() for item in items) if token)


def instance_from_dataset(dataset: Dataset, file_name: str) -> InstanceMetadata:
    """Extract the identity and classification tags from a read DICOM dataset.

    Args:
        dataset: A pydicom dataset read with ``stop_before_pixels=True``.
        file_name: Basename recorded for skip/tag diagnostics.

    Returns:
        The metadata-only instance record.
    """
    number = dataset.get("SeriesNumber")
    series_number: int | None
    try:
        series_number = int(number) if number is not None else None
    except (TypeError, ValueError):
        series_number = None
    return InstanceMetadata(
        study_instance_uid=_text(dataset, "StudyInstanceUID"),
        series_instance_uid=_text(dataset, "SeriesInstanceUID"),
        sop_instance_uid=_text(dataset, "SOPInstanceUID"),
        sop_class_uid=_text(dataset, "SOPClassUID"),
        modality=_text(dataset, "Modality"),
        image_type=_tokens(dataset, "ImageType"),
        corrected_image=_tokens(dataset, "CorrectedImage"),
        series_number=series_number,
        file=file_name,
    )
