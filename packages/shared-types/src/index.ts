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
  PreparedViewId,
  ComposerViewInstanceId,
  FigureSheetId,
  FigurePanelId,
  FigureAnnotationId,
  PreviewId,
  ViewGroupId,
  ViewSlotId,
  ViewportId,
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
  PetQuantitationResult,
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

// View state and workspace
export type {
  BindingRole,
  DataBinding,
  SpatialState,
  FitMode,
  CameraState,
  PresentationState,
  ProjectionMode,
  PrimitiveValue,
  ProjectionState,
  CompositionMode,
  PetFusionTransfer,
  PetFusionOverlayPresentation,
  CompositionLayer,
  FusionOverlayLayer,
  FusionBlendMode,
  SingleCompositionState,
  FusionCompositionState,
  MultiLayerCompositionState,
  CompositionState,
  CoordinateTransformSet,
  SingleMedicalViewState,
  ComposedMedicalViewState,
  MedicalViewState,
} from './view-state.js';
export type {
  ViewSlotRole,
  ViewSlotStatus,
  ViewSlot,
  ViewGroup,
  ViewportSurfaceLifecycle,
  ViewportSurface,
} from './view-workspace.js';
export type {
  LinkableState,
  IntraStudyLink,
  GeometryVerificationSnapshot,
  InterStudyLinkMode,
  InterStudyLink,
  RegisteredSpatialTransformReference,
  ViewLink,
  LockableState,
  StateLock,
  ViewStateOverride,
  LocalViewOverride,
} from './view-links.js';
export type { CachedPreviewReference, PreparedView } from './prepared-view.js';

// Figure Composer and publication contracts
export type {
  PanelContentPointMm,
  PanelContentSizeMm,
  SheetPointMm,
  SheetSizeMm,
  NormalizedViewportCrop,
  PanelFramingState,
  PanelLayoutState,
  PanelDecorationState,
  MedicalViewBinding,
  ComposerViewInstance,
  PatientAnnotationAnchor,
  PanelContentAnnotationAnchor,
  SheetAnnotationAnchor,
  AnnotationAnchor,
  AnnotationCoordinateSpace,
  AnnotationPoint,
  FigureAnnotationBase,
  FigureLineAnnotation,
  FigureRoiAnnotation,
  FigureTextAnnotation,
  FigureScaleBarAnnotation,
  FigureMeasurementAnnotation,
  FigureAnnotation,
  ComposerPanel,
  FigureSheet,
  TemporaryRenderTargetSpec,
  CachedPreviewRenderTargetSpec,
  PublicationRenderTargetSpec,
  PublicationOutputSpec,
  PublicationPanelInput,
  PublicationRenderRequest,
} from './figure.js';
