"""Deterministic study/series aggregation for ``nuclear.dicom.inspect``.

Groups metadata-only instances into studies and series, applies the
:mod:`dicom.classification` decision tree per series, and returns the
deterministic ``studies``/``diagnostics``/``skippedFileCount`` payload.

An instance missing ``StudyInstanceUID`` is grouped under
``studyInstanceUID: ""`` and its series fails closed as ``unsupported`` with
``reason = "missing-required-tag:StudyInstanceUID"``; no study UID is invented.
"""

from __future__ import annotations

from typing import Any

from .classification import classify_group
from .metadata import Diagnostic, InstanceMetadata


def build_inspection_result(
    instances: list[InstanceMetadata], skipped_file_count: int, diagnostics: list[Diagnostic]
) -> dict[str, Any]:
    """Group instances into studies/series and apply the classification tree.

    Args:
        instances: Metadata-only records that parsed as DICOM.
        skipped_file_count: Number of files skipped as non-DICOM/unparseable.
        diagnostics: Diagnostics produced while reading the source.

    Returns:
        The ``studies``/``diagnostics``/``skippedFileCount`` payload, with
        studies sorted by UID, series by ``(seriesNumber or 0, uid)`` and
        diagnostics by ``(code, file)``.
    """
    ordered = sorted(
        instances,
        key=lambda item: (item.study_instance_uid or "", item.series_instance_uid or "", item.file),
    )
    groups: dict[tuple[str, str], list[InstanceMetadata]] = {}
    for instance in ordered:
        key = (instance.study_instance_uid or "", instance.series_instance_uid or "")
        groups.setdefault(key, []).append(instance)
    studies: dict[str, list[dict[str, Any]]] = {}
    modalities: dict[str, set[str]] = {}
    collected = list(diagnostics)
    for (study_uid, _series_uid), members in groups.items():
        entry, group_diagnostics = classify_group(members)
        studies.setdefault(study_uid, []).append(entry)
        modalities.setdefault(study_uid, set()).add(str(entry["modality"]))
        collected.extend(group_diagnostics)
    output_studies: list[dict[str, Any]] = []
    for study_uid in sorted(studies):
        series_entries = sorted(
            studies[study_uid],
            key=lambda entry: (entry["seriesNumber"] or 0, entry["seriesInstanceUID"]),
        )
        output_studies.append(
            {
                "studyInstanceUID": study_uid,
                "modalities": sorted(modalities[study_uid]),
                "series": series_entries,
            }
        )
    collected.sort(key=lambda diagnostic: (diagnostic.code, diagnostic.file or ""))
    return {
        "studies": output_studies,
        "diagnostics": [diagnostic.as_dict() for diagnostic in collected],
        "skippedFileCount": skipped_file_count,
    }
