/**
 * @nuclear/shared-types
 *
 * Foundational clinical data contracts, pure TypeScript interfaces,
 * enums, and opaque nominal identifiers for NuClear.
 *
 * Leaf package: Zero runtime code, zero external dependencies.
 */

// Identifiers
export type {
  Brand,
  StudyId,
  AssetId,
  ViewId,
  SurfaceId,
  RowId,
  CellId,
  TransformId,
  StudyInstanceUID,
  SeriesInstanceUID,
  SOPInstanceUID,
  FrameOfReferenceUID,
} from './identifiers.js';

// Physical Geometry
export type {
  Point3D,
  Vector3D,
  BoundingBox3D,
  DirectionCosines,
  Matrix4x4,
  AssetGeometry,
} from './geometry.js';

// Source Locators & Fingerprints
export type {
  SourceLocatorKind,
  LocalFolderLocator,
  LocalFileListLocator,
  ArchiveEntryLocator,
  DicomWebLocator,
  ManagedCacheLocator,
  SourceLocator,
  SourceFingerprint,
} from './source.js';

// Availability & Residency
export type {
  AssetAvailability,
  AssetAvailabilityStatus,
  AssetResidencyTier,
  AssetResidencyStatus,
  ResourcePriority,
  ResourceDemand,
} from './availability.js';

// Semantics & Values
export type {
  Modality,
  AssetKind,
  PatientSex,
  PatientReference,
  ValueSemanticsType,
  ValueSemantics,
} from './semantics.js';

// Study Reference
export type {
  StudySeriesReference,
  StudyReference,
} from './study.js';

// Imaging Asset & Quantitative Metadata
export type {
  PetAcquisitionMetadata,
  AssetMetadata,
  ImagingAsset,
} from './asset.js';

// Spatial Transforms & Registration
export type {
  TransformType,
  OutOfDomainBehavior,
  TransformMethod,
  TransformProvenance,
  TransformValidity,
  SpatialTransform,
} from './spatial-transform.js';

// Provenance
export type {
  ScientificWorkerMetadata,
  ViewProvenance,
} from './provenance.js';
