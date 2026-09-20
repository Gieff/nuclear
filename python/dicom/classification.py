"""Deterministic standard-tag classification for one DICOM series.

This module owns the per-series decision tree used by
``nuclear.dicom.inspect``; it never loads pixels or uses free-text heuristics.

Decision tree
-------------
0. Required tags ``SOPInstanceUID``/``StudyInstanceUID``/``SeriesInstanceUID``/
   ``Modality`` must be present; absence -> ``missing-required-tag:<name>``.
1. Instances disagreeing on ``Modality`` or ``SOPClassUID`` ->
   ``reason = "inconsistent-series-metadata"``.
2. Secondary Capture SOP Class ``1.2.840.10008.5.1.4.1.1.7`` or ``ImageType``
   token ``SECONDARY`` -> ``secondary-capture``, unsupported.
3. ``CT``: ``LOCALIZER`` -> ``localizer``, unsupported; ``ORIGINAL`` +
   ``PRIMARY`` + ``AXIAL`` -> ``ct-primary``, supported; else
   ``non-primary-image-type``.
4. ``PT``: ``CorrectedImage`` ``ATTN`` -> ``pt-primary``, supported; else
   ``pt-uncorrected`` with ``reason = "attenuation-correction-missing"``.
5. Any other modality -> ``unsupported``, ``reason = "unsupported-modality"``.

Token checks are case-insensitive and union across the series. Emitted
``modality`` values follow the shared-types vocabulary; unknown becomes ``OT``.
"""

from __future__ import annotations

from typing import Any

from .metadata import (
    CLASSIFICATION_CT_PRIMARY,
    CLASSIFICATION_LOCALIZER,
    CLASSIFICATION_PT_PRIMARY,
    CLASSIFICATION_PT_UNCORRECTED,
    CLASSIFICATION_SECONDARY_CAPTURE,
    CLASSIFICATION_UNSUPPORTED,
    DIAGNOSTIC_INCONSISTENT,
    DIAGNOSTIC_MISSING_TAG,
    MODALITY_VOCABULARY,
    REQUIRED_IDENTITY_TAGS,
    SECONDARY_CAPTURE_IMAGE_STORAGE,
    Diagnostic,
    InstanceMetadata,
)


def normalize_modality(raw: str | None) -> str:
    """Map ``Modality`` (0008,0060) onto the shared-types vocabulary.

    Args:
        raw: Raw modality value, or ``None`` when absent.

    Returns:
        The trimmed upper-case value when recognised, otherwise ``"OT"``.
    """
    if raw is None:
        return "OT"
    candidate = raw.strip().upper()
    return candidate if candidate in MODALITY_VOCABULARY else "OT"


def _missing_tags(instance: InstanceMetadata) -> list[str]:
    values = {
        "SOPInstanceUID": instance.sop_instance_uid,
        "StudyInstanceUID": instance.study_instance_uid,
        "SeriesInstanceUID": instance.series_instance_uid,
        "Modality": instance.modality,
    }
    return [tag for tag in REQUIRED_IDENTITY_TAGS if not values[tag]]


def _series_number(members: list[InstanceMetadata]) -> int | None:
    numbers = {member.series_number for member in members if member.series_number is not None}
    return min(numbers) if numbers else None


def _classify_tokens(
    modality: str, sop_class_uid: str | None, image_type: set[str], corrected_image: set[str]
) -> tuple[str, bool, str | None]:
    if sop_class_uid == SECONDARY_CAPTURE_IMAGE_STORAGE or "SECONDARY" in image_type:
        return CLASSIFICATION_SECONDARY_CAPTURE, False, None
    if modality == "CT":
        if "LOCALIZER" in image_type:
            return CLASSIFICATION_LOCALIZER, False, None
        if {"ORIGINAL", "PRIMARY", "AXIAL"} <= image_type:
            return CLASSIFICATION_CT_PRIMARY, True, None
        return CLASSIFICATION_UNSUPPORTED, False, "non-primary-image-type"
    if modality == "PT":
        if "ATTN" in corrected_image:
            return CLASSIFICATION_PT_PRIMARY, True, None
        return CLASSIFICATION_PT_UNCORRECTED, False, "attenuation-correction-missing"
    return CLASSIFICATION_UNSUPPORTED, False, "unsupported-modality"


def _entry(
    series_uid: str,
    series_number: int | None,
    modality: str,
    classification: str,
    supported: bool,
    reason: str | None,
    instance_count: int,
) -> dict[str, Any]:
    return {
        "seriesInstanceUID": series_uid,
        "seriesNumber": series_number,
        "modality": modality,
        "classification": classification,
        "supported": supported,
        "instanceCount": instance_count,
        "reason": reason,
    }


def classify_group(members: list[InstanceMetadata]) -> tuple[dict[str, Any], list[Diagnostic]]:
    """Classify one series cluster under the standard-tag decision tree.

    Args:
        members: Metadata records sharing a study/series identity.

    Returns:
        The serializable series entry and the diagnostics it produced.
    """
    diagnostics: list[Diagnostic] = []
    missing: dict[str, list[str]] = {}
    for member in members:
        for tag in _missing_tags(member):
            missing.setdefault(tag, []).append(member.file)
    series_uid = members[0].series_instance_uid or ""
    series_number = _series_number(members)
    raw_modalities = {member.modality for member in members if member.modality}
    sop_classes = {member.sop_class_uid for member in members if member.sop_class_uid}
    first_missing = next((tag for tag in REQUIRED_IDENTITY_TAGS if tag in missing), None)
    if first_missing is not None:
        for tag in REQUIRED_IDENTITY_TAGS:
            for file_name in missing.get(tag, []):
                diagnostics.append(
                    Diagnostic(
                        DIAGNOSTIC_MISSING_TAG,
                        "error",
                        f"Instance is missing required tag {tag}; the series is unsupported.",
                        file_name,
                    )
                )
        entry = _entry(
            series_uid, series_number, "OT", CLASSIFICATION_UNSUPPORTED, False,
            f"missing-required-tag:{first_missing}", len(members),
        )
        return entry, diagnostics
    if len(raw_modalities) > 1 or len(sop_classes) > 1:
        diagnostics.append(
            Diagnostic(
                DIAGNOSTIC_INCONSISTENT,
                "error",
                "Instances in this series disagree on Modality or SOPClassUID.",
                None,
            )
        )
        entry = _entry(
            series_uid,
            series_number,
            "OT",
            CLASSIFICATION_UNSUPPORTED,
            False,
            "inconsistent-series-metadata",
            len(members),
        )
        return entry, diagnostics
    modality = normalize_modality(next(iter(raw_modalities), None))
    image_type = {token.upper() for member in members for token in member.image_type}
    corrected = {token.upper() for member in members for token in member.corrected_image}
    classification, supported, reason = _classify_tokens(
        modality, next(iter(sop_classes), None), image_type, corrected
    )
    return (
        _entry(series_uid, series_number, modality, classification, supported, reason, len(members)),
        diagnostics,
    )
