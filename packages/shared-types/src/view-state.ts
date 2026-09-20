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

export interface CompositionState {
  readonly mode: CompositionMode;
  readonly layers: readonly DataBinding[];
  readonly blend?: 'alpha' | 'additive' | 'difference' | 'checkerboard';
  readonly layerOpacity?: Readonly<Record<string, number>>;
}

/** Explicit transforms between persisted clinical/render spaces. */
export interface CoordinateTransformSet {
  /** Patient LPS mm → view-plane homogeneous coordinates (mm). */
  readonly patientToViewPlane: Matrix4x4;
  /** View-plane mm → viewport render-pixel coordinates. */
  readonly viewPlaneToViewport: Matrix4x4;
  readonly viewportSizePx: readonly [number, number];
}

export interface MedicalViewState {
  readonly id: ViewId;
  readonly dataBinding: DataBinding;
  readonly spatial: SpatialState;
  readonly camera: CameraState;
  readonly presentation: PresentationState;
  readonly projection: ProjectionState;
  readonly composition: CompositionState;
  readonly coordinateTransforms: CoordinateTransformSet;
}
