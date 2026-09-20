/** Pure Figure Composer contracts. Coordinates are never screen pixels. */

import type { AssetAvailabilityStatus } from './availability.js';
import type { Point3D } from './geometry.js';
import type {
  ComposerViewInstanceId,
  FigureAnnotationId,
  FigurePanelId,
  FigureSheetId,
  PreparedViewId,
  SurfaceId,
} from './identifiers.js';
import type { LocalViewOverride } from './view-links.js';
import type { CachedPreviewReference, PreparedView } from './prepared-view.js';

/** Physical editorial coordinates in the panel content space (mm). */
export type PanelContentPointMm = readonly [number, number];
export type PanelContentSizeMm = readonly [number, number];

/** Physical editorial coordinates on the complete figure sheet (mm). */
export type SheetPointMm = readonly [number, number];
export type SheetSizeMm = readonly [number, number];

export type NormalizedViewportCrop = readonly [number, number, number, number];

export interface PanelFramingState {
  /** Source viewport crop in normalized viewport coordinates [left, top, right, bottom]. */
  readonly viewportCrop: NormalizedViewportCrop;
  /** Size of the visible content opening in physical panel coordinates. */
  readonly contentSizeMm: PanelContentSizeMm;
  /** Editorial offset inside the panel content opening, in mm. */
  readonly contentOffsetMm: PanelContentPointMm;
  readonly contentScale: number;
  readonly alignment: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  readonly overflow: 'clip' | 'visible';
}

export interface PanelLayoutState {
  /** Top-left position on the figure sheet, in physical mm. */
  readonly positionMm: SheetPointMm;
  readonly sizeMm: SheetSizeMm;
  readonly rotationDeg: number;
  readonly zIndex: number;
  readonly alignment: 'free' | 'grid' | 'centered';
  readonly constraints?: {
    readonly minSizeMm?: SheetSizeMm;
    readonly maxSizeMm?: SheetSizeMm;
    readonly aspectRatio?: number;
  };
}

export interface PanelDecorationState {
  readonly border?: {
    readonly color: string;
    readonly widthMm: number;
    readonly style: 'solid' | 'dashed' | 'dotted' | 'none';
  };
  readonly background?: string;
  readonly label?: {
    readonly text: string;
    readonly position: PanelContentPointMm;
    readonly fontFamily: string;
    readonly fontSizePt: number;
    readonly color: string;
  };
  readonly caption?: {
    readonly text: string;
    readonly position: PanelContentPointMm;
    readonly fontFamily: string;
    readonly fontSizePt: number;
    readonly color: string;
  };
}

export interface MedicalViewBinding {
  readonly preparedViewId: PreparedViewId;
  readonly availability: AssetAvailabilityStatus;
  /** A persistent surface identity; it is not a WebGL context or DOM node. */
  readonly surfaceId?: SurfaceId;
  readonly cachedPreviewReference?: CachedPreviewReference;
}

export interface ComposerViewInstance {
  readonly id: ComposerViewInstanceId;
  readonly preparedViewId: PreparedViewId;
  readonly medicalViewBinding: MedicalViewBinding;
  /** Local overrides target this exact instance and never mutate PreparedView. */
  readonly localOverrides: readonly LocalViewOverride[];
}

export interface PatientAnnotationAnchor {
  readonly kind: 'patient';
  readonly panelId: FigurePanelId;
  readonly composerViewInstanceId: ComposerViewInstanceId;
  readonly positionLpsMm: Point3D;
  readonly planeToleranceMm: number;
  readonly outOfPlaneBehavior: 'hide' | 'fade';
}

export interface PanelContentAnnotationAnchor {
  readonly kind: 'panel-content';
  readonly panelId: FigurePanelId;
  readonly composerViewInstanceId: ComposerViewInstanceId;
  readonly positionMm: PanelContentPointMm;
}

export interface SheetAnnotationAnchor {
  readonly kind: 'sheet';
  readonly positionMm: SheetPointMm;
}

/** Screen coordinates are intentionally absent from this persisted union. */
export type AnnotationAnchor =
  | PatientAnnotationAnchor
  | PanelContentAnnotationAnchor
  | SheetAnnotationAnchor;

export type AnnotationCoordinateSpace = 'patient' | 'panel-content' | 'sheet';
export type AnnotationPoint = Point3D | PanelContentPointMm | SheetPointMm;

export interface FigureAnnotationBase {
  readonly id: FigureAnnotationId;
  readonly anchor: AnnotationAnchor;
  readonly strokeColor?: string;
  readonly fillColor?: string;
  readonly strokeWidthMm?: number;
}

export interface FigureLineAnnotation extends FigureAnnotationBase {
  readonly kind: 'line' | 'arrow';
  readonly coordinateSpace: AnnotationCoordinateSpace;
  readonly endpoints: readonly [AnnotationPoint, AnnotationPoint];
}

export type FigureRoiAnnotation = FigureAnnotationBase & (
  | { readonly kind: 'circle'; readonly geometry: { readonly coordinateSpace: AnnotationCoordinateSpace; readonly center: AnnotationPoint; readonly radiusMm: number } }
  | { readonly kind: 'ellipse'; readonly geometry: { readonly coordinateSpace: AnnotationCoordinateSpace; readonly center: AnnotationPoint; readonly radiiMm: readonly [number, number]; readonly rotationDeg: number } }
  | { readonly kind: 'rectangle'; readonly geometry: { readonly coordinateSpace: AnnotationCoordinateSpace; readonly origin: AnnotationPoint; readonly sizeMm: readonly [number, number]; readonly rotationDeg: number } }
);

export interface FigureTextAnnotation extends FigureAnnotationBase {
  readonly kind: 'text' | 'panel-letter';
  readonly coordinateSpace: AnnotationCoordinateSpace;
  readonly position: AnnotationPoint;
  readonly text: string;
  readonly box: { readonly sizeMm: readonly [number, number]; readonly paddingMm: number };
  readonly typography: { readonly fontFamily: string; readonly fontSizePt: number; readonly color: string; readonly weight: 'normal' | 'bold' };
}

export interface FigureScaleBarAnnotation extends FigureAnnotationBase {
  readonly kind: 'scale-bar';
  readonly coordinateSpace: AnnotationCoordinateSpace;
  readonly position: AnnotationPoint;
  readonly lengthMm: number;
  readonly orientation: 'horizontal' | 'vertical';
  readonly label?: string;
}

export interface FigureMeasurementAnnotation extends FigureAnnotationBase {
  readonly kind: 'measurement';
  readonly coordinateSpace: AnnotationCoordinateSpace;
  readonly geometry: { readonly endpoints: readonly [AnnotationPoint, AnnotationPoint] };
  readonly value: number;
  readonly unit: 'mm' | 'cm';
}

/** Structured, renderable annotations; no screen-pixel geometry is persisted. */
export type FigureAnnotation = FigureLineAnnotation | FigureRoiAnnotation | FigureTextAnnotation | FigureScaleBarAnnotation | FigureMeasurementAnnotation;

export interface ComposerPanel {
  readonly id: FigurePanelId;
  readonly viewInstance: ComposerViewInstance;
  readonly framing: PanelFramingState;
  readonly layout: PanelLayoutState;
  readonly decoration: PanelDecorationState;
}

export interface FigureSheet {
  readonly id: FigureSheetId;
  readonly sizeMm: SheetSizeMm;
  readonly panels: readonly ComposerPanel[];
  readonly annotations: readonly FigureAnnotation[];
}

export interface TemporaryRenderTargetSpec {
  readonly kind: 'temporary-high-resolution';
  readonly pixelDimensions: readonly [number, number];
  readonly dpi: number;
  readonly colorProfile: string;
  readonly alpha: 'opaque' | 'preserve';
  /** Explicitly forbids resizing a live interactive canvas. */
  readonly liveCanvasPolicy: 'never-resize-live-canvas';
}

/** Offline preview target: consumes cached pixels and never resamples them. */
export interface CachedPreviewRenderTargetSpec {
  readonly kind: 'cached-preview';
  readonly colorProfile: string;
  readonly resampling: 'forbidden';
  readonly liveCanvasPolicy: 'never-resize-live-canvas';
}

export type PublicationRenderTargetSpec = TemporaryRenderTargetSpec | CachedPreviewRenderTargetSpec;

export type PublicationOutputSpec =
  | {
      readonly format: 'tiff' | 'png';
      readonly composition: 'raster';
      readonly medicalLayer: 'live-high-resolution-raster';
      readonly editorialLayer: 'raster';
      readonly medicalContentSource: 'live-medical';
    }
  | {
      readonly format: 'pdf';
      readonly composition: 'hybrid';
      readonly medicalLayer: 'live-high-resolution-raster';
      readonly editorialLayer: 'native-vector';
      readonly medicalContentSource: 'live-medical';
      readonly preserveTypography: true;
      readonly preserveAnnotations: true;
    }
  | {
      readonly format: 'tiff' | 'png';
      readonly composition: 'raster';
      readonly medicalLayer: 'cached-preview-raster';
      readonly editorialLayer: 'raster';
      readonly medicalContentSource: 'cached-preview';
      readonly resampling: 'forbidden';
    }
  | {
      readonly format: 'pdf';
      readonly composition: 'hybrid';
      readonly medicalLayer: 'cached-preview-raster';
      readonly editorialLayer: 'native-vector';
      readonly medicalContentSource: 'cached-preview';
      readonly resampling: 'forbidden';
      readonly preserveTypography: true;
      readonly preserveAnnotations: true;
    };

export interface PublicationPanelInput {
  readonly panelId: FigurePanelId;
  readonly composerViewInstanceId: ComposerViewInstanceId;
  readonly preparedViewId: PreparedViewId;
  readonly preparedView: PreparedView;
  readonly availability: AssetAvailabilityStatus;
  readonly renderSource: 'live-medical' | 'cached-preview';
  readonly cachedPreviewReference?: CachedPreviewReference;
}

export interface PublicationRenderRequest {
  readonly sheetId: FigureSheetId;
  readonly sheetSizeMm: SheetSizeMm;
  readonly figureSheet: FigureSheet;
  readonly panelInputs: readonly PublicationPanelInput[];
  readonly renderStateHash: string;
  readonly renderer: {
    readonly rendererName: string;
    readonly rendererVersion: string;
  };
  readonly target: PublicationRenderTargetSpec;
  readonly output: PublicationOutputSpec;
  readonly renderMode: 'live-medical' | 'offline-cached-preview';
  /** Missing, mismatched and unverified medical sources fail closed. */
  readonly availabilityPolicy: 'require-online' | 'allow-offline-preview';
}
