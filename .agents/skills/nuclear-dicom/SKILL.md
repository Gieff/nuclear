---
name: nuclear-dicom
description: Specialized runbook for DICOM study scanning, multimodal series classification, geometric compatibility validation (FrameOfReferenceUID, ImageOrientationPatient, PixelSpacing), and quantitative SUVbw calculation via the Python worker. Use whenever modifying or verifying DICOM loading, metadata parsing, or quantitative PET scaling in NuClear.
---

# NuClear DICOM Skill

## 1. When to Activate
Activate this skill when:
- Implementing or modifying DICOM study scanning and metadata parsing.
- Classifying CT and PET series (filtering scouts/localizers, checking attenuation correction).
- Verifying spatial alignment and geometric compatibility between multimodal series.
- Computing or verifying PET SUVbw quantitation factors.
- Working on the Python scientific worker IPC interface (`ScientificWorkerBridge`).

## 2. Preconditions
- Python virtual environment available at `python/worker/.venv` with `pydicom`, `SimpleITK`, and `numpy` installed.
- Curated anonymized DICOM datasets located in `tests/fixtures/`; local raw cases belong under ignored `tests/cases/` and are never committed test evidence.

## 3. Procedures & Technical Contracts

### A. Series Classification
- **Primary CT**: Modality `CT`, ImageType contains `ORIGINAL\PRIMARY\AXIAL`, sorted by physical `ImagePositionPatient[2]`.
- **Primary PET**: Modality `PT`, attenuation-corrected (verify `CorrectedImage` contains `ATTN`).
- **Secondary/Derived**: Filter out scout views, localizers, secondary reformats, and dose reports.

### B. Geometric Compatibility Verification
> **Critical Rule**: Matching `FrameOfReferenceUID` (0020,0052) is a necessary geometric compatibility signal, but **not by itself sufficient** evidence that two image volumes share identical sampling geometry.

To verify geometric compatibility:
1. Check `FrameOfReferenceUID`: Must match between CT and PET for direct co-referencing.
2. Check `ImageOrientationPatient` (direction cosines): Must be co-planar within validated tolerance.
3. Check `PixelSpacing` and slice thickness: PET and CT typically have different grid resolutions; the rendering engine reslices into physical patient coordinates rather than assuming 1:1 voxel alignment.
4. Check volume spatial extents: Compute physical bounding boxes from `ImagePositionPatient` of the first and last slices.

### C. Physical Quantitative SUV Determination
> **Critical Rule**: Never assume raw stored pixel values are SUV or direct activity concentration. Determine the physical quantitative representation from the DICOM metadata and applicable Real World Value Mapping.

1. **Pixel Scaling**: Apply `RescaleSlope` (0028,1053) and `RescaleIntercept` (0028,1052) to convert raw stored integers to physical units.
2. **Units Verification**: Inspect tag `Units` (0054,1001) (e.g. `BQML`, `CNTS`, `GML`).
3. **Decay Correction & Radionuclide Info** (DICOM PS3.3 C.8.9.1.1.5, C.8.9.2):
   - `DecayCorrection` (0054,1102) `START` decays to the acquisition start time;
     `ADMIN` decays to the radiopharmaceutical administration time. They are
     **different reference events**. NuClear v1 SUVbw supports `START` only;
     `ADMIN` is explicitly rejected until a separate strategy is formalized.
   - These attributes live **inside a single item** of
     `RadiopharmaceuticalInformationSequence` (0054,0016), never at the dataset
     root: `RadionuclideHalfLife` (0018,1075, s), `RadionuclideTotalDose`
     (0018,1074, Bq at administration), and `RadiopharmaceuticalStartDateTime`
     (0018,1078, DT). The deprecated time-only `RadiopharmaceuticalStartTime`
     (0018,1072) is not used.
   - Acquisition start instant: `AcquisitionDateTime` (0008,002A), otherwise
     `AcquisitionDate` (0008,0022) + `AcquisitionTime` (0008,0032).
     `Series Date/Time` (0008,0021/0031) are **not** acquisition start; DICOM
     states their real-world meaning is implementation dependent.
   - Elapsed time
     $\Delta t = \text{acquisition start} - \text{RadiopharmaceuticalStartDateTime}$.
   - Both timestamps must use the same timezone convention (offset-aware or
     offset-less); a mix is ambiguous and must fail closed.
   - Patient weight: `PatientWeight` (0010,1030) in kilograms (convert to grams).
4. **Current Reference SUVbw Formula**:
   $$\text{Decayed Dose (Bq)} = \text{Total Dose} \times e^{-\frac{\ln(2) \cdot \Delta t}{T_{1/2}}}$$
   $$\text{SUV}_{\text{bw}} = \frac{\text{Activity Concentration (Bq/mL)}}{\text{Decayed Dose (Bq)} / \text{Patient Weight (g)}}$$
   - Scaling factor: $\text{suvFactor} = \frac{1.0}{\text{Decayed Dose (Bq)} / \text{Patient Weight (g)}}$.

### D. Python Scientific Worker IPC Boundary
- **Architecture**: JSON-RPC 2.0 over standard I/O (newline-delimited JSON).
- Controlled through `@nuclear/medical-engine`'s `ScientificWorkerBridge`.
- Enforces fail-closed behavior on geometric discrepancies or uncalibrated PET series.
