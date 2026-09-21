/**
 * NuClear view contracts. These are immutable, serializable descriptions of
 * medical state; they do not own a renderer, DOM element, or GPU resource.
 */

import type {
  AssetId,
  FrameOfReferenceUID,
  TransformId,
  ViewId,
} from './identifiers.js';
import type { DirectionCosines, Matrix4x4, Point3D, Vector3D } from './geometry.js';

export type BindingRole = 'base' | 'overlay' | 'reference';

export interface DataBinding {
  readonly assetId: AssetId;
  readonly role: BindingRole;
  readonly transformId?: TransformId;
}

export interface SpatialState {
  readonly frameOfReferenceUID: FrameOfReferenceUID;
  readonly patientPosition?: string;
  readonly orientation: DirectionCosines;
  readonly viewPlaneNormal: Vector3D;
  readonly viewUp: Vector3D;
  readonly referenceLocation: Point3D;
  readonly sliceOffsetMm: number;
}

export type FitMode = 'manual' | 'fit-width' | 'fit-height' | 'fit-extent';

export interface CameraState {
  readonly zoom: number;
  /** Pan measured in view-plane millimetres, never screen pixels. */
  readonly panMm: readonly [number, number];
  readonly rotationDeg: number;
  /** Focal point measured in view-plane millimetres. */
  readonly focalPointMm: readonly [number, number];
  readonly fitMode: FitMode;
}

export interface PresentationState {
  readonly voi?: readonly [number, number];
  readonly colormapId?: string;
  readonly invert: boolean;
  readonly opacity: number;
  readonly interpolation: 'nearest' | 'linear';
  readonly modalityPresentation?: 'ct' | 'pet' | 'mr' | 'generic';
  readonly suvRange?: readonly [number, number];
}

export type ProjectionMode = 'slice' | 'MIP' | 'MinIP' | 'Average';

export type PrimitiveValue = string | number | boolean;

export interface ProjectionState {
  readonly mode: ProjectionMode;
  readonly slabThicknessMm?: number;
  readonly parameters?: Readonly<Record<string, PrimitiveValue>>;
}

export type CompositionMode = 'single' | 'fusion' | 'multi-layer';

/** PET fusion transfer parameters (radiometry spec §2–§4). */
export interface PetFusionTransfer {
  readonly transferMode: 'highlighted' | 'alpha';
  readonly gamma: number;
  /** Interactive blend slider s ∈ [0,100]; overall opacity = (s/100)^0.42. */
  readonly blendSlider: number;
}

/** One composition layer with its own authoritative presentation. */
export interface CompositionLayer {
  readonly binding: DataBinding;
  readonly presentation: PresentationState;
  /** Required on a fusion overlay; absent on the underlay. */
  readonly fusion?: PetFusionTransfer;
}

export type FusionBlendMode = 'alpha';

export interface SingleCompositionState {
  readonly mode: 'single';
  readonly layers: readonly [DataBinding];
}

export interface FusionCompositionState {
  readonly mode: 'fusion';
  readonly blend: FusionBlendMode;
  readonly layers: readonly CompositionLayer[];
}

export interface MultiLayerCompositionState {
  readonly mode: 'multi-layer';
  readonly layers: readonly CompositionLayer[];
  readonly blend?: 'alpha' | 'additive' | 'difference' | 'checkerboard';
}

export type CompositionState =
  | SingleCompositionState
  | FusionCompositionState
  | MultiLayerCompositionState;

/** Explicit transforms between persisted clinical/render spaces. */
export interface CoordinateTransformSet {
  /** Patient LPS mm → view-plane homogeneous coordinates (mm). */
  readonly patientToViewPlane: Matrix4x4;
  /** View-plane mm → viewport render-pixel coordinates. */
  readonly viewPlaneToViewport: Matrix4x4;
  readonly viewportSizePx: readonly [number, number];
}

interface MedicalViewStateBase {
  readonly id: ViewId;
  readonly dataBinding: DataBinding;
  readonly spatial: SpatialState;
  readonly camera: CameraState;
  readonly projection: ProjectionState;
  readonly coordinateTransforms: CoordinateTransformSet;
}

/** Single-layer view: one binding and one authoritative presentation. */
export interface SingleMedicalViewState extends MedicalViewStateBase {
  readonly presentation: PresentationState;
  readonly composition: SingleCompositionState;
}

/** Composed view: per-layer bindings AND presentations; NO view-level presentation. */
export interface ComposedMedicalViewState extends MedicalViewStateBase {
  readonly composition: FusionCompositionState | MultiLayerCompositionState;
}

export type MedicalViewState = SingleMedicalViewState | ComposedMedicalViewState;
