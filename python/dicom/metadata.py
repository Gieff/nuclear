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


def text_from_dataset(dataset: Dataset, keyword: str) -> str | None:
    """Return a stripped string tag value, or ``None`` when absent/empty."""
    value = dataset.get(keyword)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def integer_from_dataset(dataset: Dataset, keyword: str) -> int | None:
    """Return an integer tag value, or ``None`` when absent/unparseable."""
    value = dataset.get(keyword)
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def numbers_from_dataset(dataset: Dataset, keyword: str) -> tuple[float, ...] | None:
    """Return a multi-valued numeric tag as floats, or ``None`` when invalid."""
    value = dataset.get(keyword)
    if value is None:
        return None
    items = (
        list(value)
        if hasattr(value, "__iter__") and not isinstance(value, (str, bytes))
        else [value]
    )
    numbers: list[float] = []
    for item in items:
        try:
            numbers.append(float(item))
        except (TypeError, ValueError):
            return None
    return tuple(numbers)


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
    return InstanceMetadata(
        study_instance_uid=text_from_dataset(dataset, "StudyInstanceUID"),
        series_instance_uid=text_from_dataset(dataset, "SeriesInstanceUID"),
        sop_instance_uid=text_from_dataset(dataset, "SOPInstanceUID"),
        sop_class_uid=text_from_dataset(dataset, "SOPClassUID"),
        modality=text_from_dataset(dataset, "Modality"),
        series_number=integer_from_dataset(dataset, "SeriesNumber"),
        image_type=_tokens(dataset, "ImageType"),
        corrected_image=_tokens(dataset, "CorrectedImage"),
        file=file_name,
    )
