/**
 * NuClear — Synthetic Contract Fixtures for Contract Verification
 *
 * Provides synthetic clinically accurate test fixtures representing a 18F-FDG PET/CT study:
 * - Diagnostic CT axial volume (512x512, 2.5mm slice thickness)
 * - Calibrated PET whole-body volume (128x128, decay-corrected to START)
 * - Spatial registration transforms (identity intra-study & rigid inter-study)
 * - View provenance descriptor
 * 
 * NOTE: All UIDs and numbers are synthetic test vectors designed for contract verification.
 */

import type {
  AssetGeometry,
  AssetId,
  FrameOfReferenceUID,
  ImagingAsset,
  PatientReference,
  SeriesInstanceUID,
  SpatialTransform,
  StudyId,
  StudyInstanceUID,
  StudyReference,
  TransformId,
  ViewProvenance,
} from '../../packages/shared-types/src/index.js';

export const MOCK_STUDY_UID = '1.2.840.10008.1.1.20260920.101' as StudyInstanceUID;
export const MOCK_CT_SERIES_UID = '1.2.840.10008.1.2.20260920.201' as SeriesInstanceUID;
export const MOCK_PET_SERIES_UID = '1.2.840.10008.1.2.20260920.301' as SeriesInstanceUID;
export const MOCK_FOR_UID = '1.2.840.10008.1.3.20260920.401' as FrameOfReferenceUID;
export const MOCK_FOLLOWUP_FOR_UID = '1.2.840.10008.1.3.20261020.402' as FrameOfReferenceUID;

export const mockPatient: PatientReference = {
  patientSex: 'M',
  patientWeightKg: 70.0,
};

export const mockStudyReference: StudyReference = {
  id: 'study-onco-042' as StudyId,
  studyInstanceUID: MOCK_STUDY_UID,
  patient: mockPatient,
  modalities: ['CT', 'PT'],
  series: [
    {
      seriesInstanceUID: MOCK_CT_SERIES_UID,
      seriesNumber: 2,
      modality: 'CT',
      numberOfInstances: 200,
    },
    {
      seriesInstanceUID: MOCK_PET_SERIES_UID,
      seriesNumber: 3,
      modality: 'PT',
      numberOfInstances: 200,
    },
  ],
  sourceLocator: {
    kind: 'local-folder',
    path: '/data/studies/anon-onco-042',
  },
};

export const mockCtGeometry: AssetGeometry = {
  frameOfReferenceUID: MOCK_FOR_UID,
  dimensions: [512, 512, 200],
  spacing: [0.9765625, 0.9765625, 2.5],
  origin: [-249.51171875, -249.51171875, -500.0],
  direction: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
  bounds: {
    min: [-250.0, -250.0, -501.25],
    max: [250.0, 250.0, -1.25],
  },
};

/** Oblique grid fixture: row/column axes are orthogonal but not LPS-aligned. */
export const mockObliqueGeometry: AssetGeometry = {
  frameOfReferenceUID: MOCK_FOR_UID,
  dimensions: [2, 3, 1],
  spacing: [2.0, 3.0, 4.0],
  origin: [10.0, 20.0, 30.0],
  direction: [
    Math.SQRT1_2, Math.SQRT1_2, 0.0,
    0.0, 0.0, 1.0,
  ],
  bounds: {
    min: [7.878679656440357, 17.878679656440358, 28.5],
    max: [13.535533905932738, 23.535533905932738, 37.5],
  },
};

export const mockCtAsset: ImagingAsset = {
  id: 'asset-ct-001' as AssetId,
  studyInstanceUID: MOCK_STUDY_UID,
  seriesInstanceUID: MOCK_CT_SERIES_UID,
  sourceLocator: {
    kind: 'local-folder',
    path: '/data/studies/anon-onco-042/CT',
  },
  sourceFingerprint: {
    studyInstanceUID: MOCK_STUDY_UID,
    seriesInstanceUID: MOCK_CT_SERIES_UID,
    instanceCount: 200,
    contentDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sopInstanceUIDsHash: 'sha256:112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00',
    totalBytes: 105906176,
    geometricDigest: 'sha256:aabbcc1122334455',
  },
  modality: 'CT',
  kind: 'volume',
  geometry: mockCtGeometry,
  frameOfReferenceUID: MOCK_FOR_UID,
  metadata: {
    seriesDescription: 'CT Thorax-Abdomen 2.5mm',
    seriesNumber: 2,
    instanceCount: 200,
    sliceThicknessMm: 2.5,
    rescaleSlope: 1.0,
    rescaleIntercept: -1024.0,
    kvp: 120.0,
    tubeCurrentMa: 150.0,
  },
  valueSemantics: {
    type: 'hounsfield',
    unit: 'HU',
    defaultRange: [-160, 240],
    physicalRange: [-1024, 3071],
  },
};

export const mockPetGeometry: AssetGeometry = {
  frameOfReferenceUID: MOCK_FOR_UID,
  dimensions: [128, 128, 200],
  spacing: [4.0, 4.0, 2.5],
  origin: [-254.0, -254.0, -500.0],
  direction: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
  bounds: {
    min: [-256.0, -256.0, -501.25],
    max: [256.0, 256.0, -1.25],
  },
};

export const mockPetAsset: ImagingAsset = {
  id: 'asset-pet-001' as AssetId,
  studyInstanceUID: MOCK_STUDY_UID,
  seriesInstanceUID: MOCK_PET_SERIES_UID,
  sourceLocator: {
    kind: 'local-folder',
    path: '/data/studies/anon-onco-042/PET',
  },
  sourceFingerprint: {
    studyInstanceUID: MOCK_STUDY_UID,
    seriesInstanceUID: MOCK_PET_SERIES_UID,
    instanceCount: 200,
    contentDigest: 'sha256:ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    sopInstanceUIDsHash: 'sha256:99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa',
    totalBytes: 6553600,
    geometricDigest: 'sha256:ccbbaa5544332211',
  },
  modality: 'PT',
  kind: 'volume',
  geometry: mockPetGeometry,
  frameOfReferenceUID: MOCK_FOR_UID,
  metadata: {
    seriesDescription: 'PET Whole Body 3D AC',
    seriesNumber: 3,
    instanceCount: 200,
    sliceThicknessMm: 2.5,
    rescaleSlope: 1.0,
    rescaleIntercept: 0.0,
    pet: {
      units: 'BQML',
      decayCorrection: 'START',
      radionuclideHalfLifeSeconds: 6586.2,
      radionuclideTotalDoseBq: 370000000,
      radiopharmaceuticalStartTime: '090000',
      seriesTime: '100000',
    },
    petQuantitation: {
      method: 'suv-bw',
      status: 'computed',
      suvFactor: 0.0002764,
      workerMetadata: {
        workerVersion: '0.1.0',
        operation: 'suv-scaling',
        timestamp: '2026-09-20T10:00:00Z',
      },
    },
  },
  valueSemantics: {
    type: 'suv-bw',
    unit: 'g/mL',
    defaultRange: [0.0, 8.0],
    physicalRange: [0.0, 100.0],
  },
};

export const mockIdentityTransform: SpatialTransform = {
  id: 'transform-identity-ct-pet' as TransformId,
  sourceFrameOfReferenceUID: MOCK_FOR_UID,
  targetFrameOfReferenceUID: MOCK_FOR_UID,
  transformType: 'identity',
  matrix4x4: [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
  ],
  units: 'mm',
  provenance: {
    method: 'identity',
    description: 'Direct intra-study co-reference sharing same FrameOfReferenceUID',
    workerVersion: '0.1.0',
    timestamp: '2026-09-20T09:35:00Z',
  },
  validity: {
    isValid: true,
    errorMarginMm: 0.0,
    outOfDomainBehavior: 'clamp',
  },
};

export const mockRigidFollowupTransform: SpatialTransform = {
  id: 'transform-rigid-followup' as TransformId,
  sourceFrameOfReferenceUID: MOCK_FOLLOWUP_FOR_UID,
  targetFrameOfReferenceUID: MOCK_FOR_UID,
  transformType: 'rigid',
  matrix4x4: [
    0.9998, -0.0175, 0.0, 12.4,
    0.0175, 0.9998, 0.0, -8.2,
    0.0, 0.0, 1.0, 5.0,
    0.0, 0.0, 0.0, 1.0,
  ],
  units: 'mm',
  provenance: {
    method: 'rigid-coregistration',
    description: 'SimpleITK Euler3D rigid registration baseline to follow-up',
    workerVersion: '0.1.0',
    timestamp: '2026-09-20T10:15:00Z',
  },
  validity: {
    isValid: true,
    errorMarginMm: 1.2,
    outOfDomainBehavior: 'warn',
  },
};

export const mockViewProvenance: ViewProvenance = {
  studyInstanceUID: MOCK_STUDY_UID,
  sourceAssetIds: [mockCtAsset.id, mockPetAsset.id],
  sourceSeriesInstanceUIDs: [MOCK_CT_SERIES_UID, MOCK_PET_SERIES_UID],
  sourceFingerprints: [mockCtAsset.sourceFingerprint, mockPetAsset.sourceFingerprint],
  appliedTransforms: [mockIdentityTransform.id],
  appliedPresetIds: ['ct-soft-tissue', 'pet-rainbow-canonical'],
  engineVersion: '0.1.0',
  createdAt: '2026-09-20T10:30:00Z',
  renderStateHash: 'sha256:deadbeef1234567890abcdef1234567890abcdef',
};
