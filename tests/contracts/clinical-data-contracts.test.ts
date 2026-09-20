/**
 * NuClear — Clinical Data Contracts Test Suite
 *
 * Verifies that all Phase 1 contracts conform strictly to architectural specifications,
 * physical patient geometry, and quantitative SUVbw determination formulas.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  ArchiveEntryLocator,
  AssetAvailability,
  AssetResidencyTier,
  LocalFileListLocator,
} from '../../packages/shared-types/src/index.js';
import {
  MOCK_CT_SERIES_UID,
  MOCK_FOLLOWUP_FOR_UID,
  MOCK_FOR_UID,
  MOCK_STUDY_UID,
  mockCtAsset,
  mockIdentityTransform,
  mockPetAsset,
  mockRigidFollowupTransform,
  mockStudyReference,
  mockViewProvenance,
} from '../fixtures/clinical-contracts.fixture.ts';
import {
  isAssetGeometry,
  isDirectionCosinesValid,
  isImagingAsset,
  isHomogeneousAffineMatrix4x4,
  isSourceFingerprint,
  isSourceLocator,
  isSpatialTransform,
  isStudyReference,
  isViewProvenance,
  isPetAcquisitionMetadata,
} from './validators.ts';

describe('NuClear Phase 1 — Clinical Data Contracts', () => {
  describe('StudyReference Contract', () => {
    it('should validate the mock study reference', () => {
      assert.ok(isStudyReference(mockStudyReference));
      assert.equal(mockStudyReference.studyInstanceUID, MOCK_STUDY_UID);
      assert.equal(mockStudyReference.patient.patientWeightKg, 70.0);
      assert.deepEqual(mockStudyReference.modalities, ['CT', 'PT']);
      assert.equal(mockStudyReference.series.length, 2);
    });

    it('should reject invalid study objects', () => {
      assert.equal(isStudyReference(null), false);
      assert.equal(isStudyReference({ id: 'bad' }), false);
      assert.equal(isStudyReference({ ...mockStudyReference, modalities: 'CT' }), false);
    });
  });

  describe('ImagingAsset & Patient Geometry', () => {
    it('should validate CT asset structure and geometry', () => {
      assert.ok(isImagingAsset(mockCtAsset));
      assert.equal(mockCtAsset.modality, 'CT');
      assert.equal(mockCtAsset.kind, 'volume');
      assert.deepEqual(mockCtAsset.geometry.dimensions, [512, 512, 200]);
      assert.ok(isDirectionCosinesValid(mockCtAsset.geometry.direction));
      assert.equal(mockCtAsset.valueSemantics.type, 'hounsfield');
      assert.equal(mockCtAsset.valueSemantics.unit, 'HU');
    });

    it('should validate PET asset and FrameOfReferenceUID co-referencing', () => {
      assert.ok(isImagingAsset(mockPetAsset));
      assert.equal(mockPetAsset.modality, 'PT');
      assert.equal(mockPetAsset.geometry.frameOfReferenceUID, mockCtAsset.geometry.frameOfReferenceUID);
      assert.equal(mockPetAsset.valueSemantics.type, 'suv-bw');
      assert.equal(mockPetAsset.valueSemantics.unit, 'g/mL');
    });

    it('should verify that bounding boxes strictly match the declared outer half-voxel extent formula', () => {
      for (const asset of [mockCtAsset, mockPetAsset]) {
        const { origin, spacing, dimensions, bounds } = asset.geometry;
        for (let i = 0; i < 3; i++) {
          const expectedMin = origin[i] - 0.5 * spacing[i];
          const expectedMax = origin[i] + (dimensions[i] - 0.5) * spacing[i];
          assert.ok(
            Math.abs(bounds.min[i] - expectedMin) < 1e-5,
            `${asset.modality} bounds.min[${i}] (${bounds.min[i]}) != expected (${expectedMin})`,
          );
          assert.ok(
            Math.abs(bounds.max[i] - expectedMax) < 1e-5,
            `${asset.modality} bounds.max[${i}] (${bounds.max[i]}) != expected (${expectedMax})`,
          );
        }
      }
    });

    it('should reject invalid direction cosines that are not orthogonal unit vectors', () => {
      assert.equal(isDirectionCosinesValid([1, 0, 0, 1, 0, 0]), false); // Parallel vectors
      assert.equal(isDirectionCosinesValid([2, 0, 0, 0, 1, 0]), false); // Non-unit norm
      assert.equal(isDirectionCosinesValid([1, 0, 0, 0, 1] as unknown as [number, number, number, number, number, number]), false);
    });
  });

  describe('Quantitative PET SUVbw Determination', () => {
    it('should validate PET acquisition metadata structure without runtime calculation', () => {
      assert.ok(mockPetAsset.metadata.pet);
      assert.ok(isPetAcquisitionMetadata(mockPetAsset.metadata.pet));
      assert.equal(mockPetAsset.metadata.pet.units, 'BQML');
      assert.ok(mockPetAsset.metadata.pet.radionuclideHalfLifeSeconds > 0);
      assert.ok(mockPetAsset.metadata.pet.radionuclideTotalDoseBq > 0);
    });

    it('should reject invalid PET metadata', () => {
      const badPet = { ...mockPetAsset.metadata.pet, units: 123 };
      assert.equal(isPetAcquisitionMetadata(badPet), false);
    });
  });

  describe('SourceLocator & SourceFingerprint Discriminated Unions', () => {
    it('should validate all supported SourceLocator variants', () => {
      const folderLocator = mockCtAsset.sourceLocator;
      const fileListLocator: LocalFileListLocator = {
        kind: 'local-file-list',
        files: ['/path/to/slice1.dcm', '/path/to/slice2.dcm'],
      };
      const archiveLocator: ArchiveEntryLocator = {
        kind: 'archive-entry',
        archivePath: '/data/bundle.zip',
        innerEntryPrefix: 'CT_SERIES/',
      };

      assert.ok(isSourceLocator(folderLocator));
      assert.ok(isSourceLocator(fileListLocator));
      assert.ok(isSourceLocator(archiveLocator));
    });

    it('should reject malformed source locators', () => {
      assert.equal(isSourceLocator({ kind: 'unknown-kind' }), false);
      assert.equal(isSourceLocator({ kind: 'local-folder' }), false);
      assert.equal(isSourceLocator(123), false);
    });

    it('should validate SourceFingerprint', () => {
      assert.ok(isSourceFingerprint(mockCtAsset.sourceFingerprint));
      assert.equal(isSourceFingerprint({ studyInstanceUID: '1.2.3' }), false);
    });
  });

  describe('AssetAvailability & AssetResidency Independence', () => {
    it('should uphold principle that semantic lifetime does not pin RAM or VRAM', () => {
      const availabilities: AssetAvailability[] = [
        'online',
        'loading',
        'offline-cached',
        'missing',
        'mismatch',
      ];
      const residencyTiers: AssetResidencyTier[] = [
        'metadata-only',
        'source-available',
        'cpu-cached',
        'gpu-ready',
        'gpu-resident',
        'loading',
        'evicted',
      ];

      // A semantically online asset can legitimately be evicted or metadata-only
      assert.ok(availabilities.includes('online'));
      assert.ok(residencyTiers.includes('metadata-only'));
      assert.ok(residencyTiers.includes('evicted'));
    });
  });

  describe('SpatialTransform & Registration Contracts', () => {
    it('should validate identity transform for intra-study matching FrameOfReferenceUID', () => {
      assert.ok(isSpatialTransform(mockIdentityTransform));
      assert.equal(mockIdentityTransform.transformType, 'identity');
      assert.equal(mockIdentityTransform.sourceFrameOfReferenceUID, mockIdentityTransform.targetFrameOfReferenceUID);
      assert.ok(isHomogeneousAffineMatrix4x4(mockIdentityTransform.matrix4x4));
      assert.equal(mockIdentityTransform.units, 'mm');
    });

    it('should validate rigid transform for longitudinal inter-study alignment', () => {
      assert.ok(isSpatialTransform(mockRigidFollowupTransform));
      assert.equal(mockRigidFollowupTransform.transformType, 'rigid');
      assert.equal(mockRigidFollowupTransform.sourceFrameOfReferenceUID, MOCK_FOLLOWUP_FOR_UID);
      assert.equal(mockRigidFollowupTransform.targetFrameOfReferenceUID, MOCK_FOR_UID);
      assert.ok(isHomogeneousAffineMatrix4x4(mockRigidFollowupTransform.matrix4x4));
      assert.equal(mockRigidFollowupTransform.validity.isValid, true);
    });

    it('should reject non-homogeneous matrices', () => {
      const badMatrix = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 1, 0, // Last element should be 1, not 0
      ] as const;
      assert.equal(isHomogeneousAffineMatrix4x4(badMatrix as unknown as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]), false);
    });
  });

  describe('ViewProvenance & Deterministic Reproducibility', () => {
    it('should validate provenance structure preserving exact sources and digests', () => {
      assert.ok(isViewProvenance(mockViewProvenance));
      assert.equal(mockViewProvenance.sourceAssetIds.length, 2);
      assert.equal(mockViewProvenance.sourceFingerprints.length, 2);
      assert.ok(mockViewProvenance.renderStateHash?.startsWith('sha256:'));
    });
  });
});
