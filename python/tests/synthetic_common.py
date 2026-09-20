"""Low-level deterministic metadata-only DICOM writer for the fixture suites.

No pixel data is ever generated. UIDs are supplied by the caller so each suite
keeps fixed, valid dot-decimal values (<= 64 characters). These fixtures are
synthetic test data only; they are never clinical evidence.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any

from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import UID, ExplicitVRLittleEndian


def write_metadata_dataset(
    directory: Path,
    file_name: str,
    *,
    study_uid: str,
    series_uid: str,
    sop_uid: str,
    sop_class_uid: str,
    modality: str | None = None,
    image_type: Sequence[str] | None = None,
    corrected_image: Sequence[str] | None = None,
    series_number: int | None = None,
    frame_of_reference_uid: str | None = None,
    image_position_patient: Sequence[float] | None = None,
    image_orientation_patient: Sequence[float] | None = None,
    pixel_spacing: Sequence[float] | None = None,
    rows: int | None = None,
    columns: int | None = None,
    units: str | None = None,
    decay_correction: str | None = None,
    radionuclide_half_life: float | None = None,
    radionuclide_total_dose: float | None = None,
    radiopharmaceutical_start_time: str | None = None,
    series_time: str | None = None,
    patient_weight: float | None = None,
    acquisition_datetime: str | None = None,
    acquisition_date: str | None = None,
    acquisition_time: str | None = None,
    radiopharmaceutical_information: Sequence[Sequence[tuple[str, Any]]] | None = None,
) -> Path:
    """Write one minimal metadata-only DICOM instance and return its path."""
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = UID(sop_class_uid)
    meta.MediaStorageSOPInstanceUID = UID(sop_uid)
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    path = directory / file_name
    dataset = FileDataset(str(path), {}, file_meta=meta, preamble=b"\0" * 128)
    dataset.SOPClassUID = sop_class_uid
    dataset.SOPInstanceUID = sop_uid
    dataset.StudyInstanceUID = study_uid
    dataset.SeriesInstanceUID = series_uid
    if modality is not None:
        dataset.Modality = modality
    if image_type is not None:
        dataset.ImageType = list(image_type)
    if corrected_image is not None:
        dataset.CorrectedImage = list(corrected_image)
    if series_number is not None:
        dataset.SeriesNumber = series_number
    if frame_of_reference_uid is not None:
        dataset.FrameOfReferenceUID = frame_of_reference_uid
    if image_position_patient is not None:
        dataset.ImagePositionPatient = [float(value) for value in image_position_patient]
    if image_orientation_patient is not None:
        dataset.ImageOrientationPatient = [float(value) for value in image_orientation_patient]
    if pixel_spacing is not None:
        dataset.PixelSpacing = [float(value) for value in pixel_spacing]
    if rows is not None:
        dataset.Rows = rows
    if columns is not None:
        dataset.Columns = columns
    if units is not None:
        dataset.Units = units
    if decay_correction is not None:
        dataset.DecayCorrection = decay_correction
    if radionuclide_half_life is not None:
        dataset.RadionuclideHalfLife = float(radionuclide_half_life)
    if radionuclide_total_dose is not None:
        dataset.RadionuclideTotalDose = float(radionuclide_total_dose)
    if radiopharmaceutical_start_time is not None:
        dataset.RadiopharmaceuticalStartTime = radiopharmaceutical_start_time
    if series_time is not None:
        dataset.SeriesTime = series_time
    if patient_weight is not None:
        dataset.PatientWeight = float(patient_weight)
    if acquisition_datetime is not None:
        dataset.AcquisitionDateTime = acquisition_datetime
    if acquisition_date is not None:
        dataset.AcquisitionDate = acquisition_date
    if acquisition_time is not None:
        dataset.AcquisitionTime = acquisition_time
    if radiopharmaceutical_information is not None:
        items: list[Dataset] = []
        for item_tags in radiopharmaceutical_information:
            item = Dataset()
            for keyword, item_value in item_tags:
                setattr(item, keyword, item_value)
            items.append(item)
        dataset.RadiopharmaceuticalInformationSequence = items
    dataset.save_as(str(path), enforce_file_format=True)
    return path
