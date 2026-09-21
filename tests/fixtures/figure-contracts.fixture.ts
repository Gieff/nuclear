import type {
  AnnotationAnchor,
  ComposerPanel,
  ComposerViewInstance,
  FigureAnnotation,
  FigurePanelId,
  FigureSheet,
  FigureSheetId,
  MedicalViewBinding,
  PanelDecorationState,
  PanelFramingState,
  PanelLayoutState,
  PublicationRenderRequest,
  PreparedViewId,
  ComposerViewInstanceId,
  FigureAnnotationId,
  SurfaceId,
} from '../../packages/shared-types/src/index.js';
import { mockLocalOverride, mockPreparedView } from './view-contracts.fixture.ts';

const id = <T extends string>(value: string): T => value as T;

export const mockMedicalViewBinding: MedicalViewBinding = {
  preparedViewId: id<PreparedViewId>('prepared-ct'),
  availability: { state: 'online', lastCheckedAt: '2026-09-20T10:00:00Z' },
  surfaceId: id<SurfaceId>('surface-composer-0'),
  cachedPreviewReference: mockPreparedView.cachedPreviewReference,
};

export const mockComposerViewInstance: ComposerViewInstance = {
  id: id<ComposerViewInstanceId>('composer-instance'),
  preparedViewId: id<PreparedViewId>('prepared-ct'),
  medicalViewBinding: mockMedicalViewBinding,
  localOverrides: [mockLocalOverride],
};

export const mockFraming: PanelFramingState = {
  viewportCrop: [0, 0, 1, 1],
  contentSizeMm: [80, 80],
  contentOffsetMm: [0, 0],
  contentScale: 1,
  alignment: 'center',
  overflow: 'clip',
};

export const mockLayout: PanelLayoutState = {
  positionMm: [20, 20],
  sizeMm: [80, 80],
  rotationDeg: 0,
  zIndex: 0,
  alignment: 'free',
};

export const mockDecoration: PanelDecorationState = {
  border: { color: '#111111', widthMm: 0.25, style: 'solid' },
  label: { text: 'A', position: [2, 2], fontFamily: 'Jost', fontSizePt: 10, color: '#111111' },
};

export const mockPatientAnchor: AnnotationAnchor = {
  kind: 'patient', panelId: id<FigurePanelId>('panel-a'), composerViewInstanceId: id<ComposerViewInstanceId>('composer-instance'), positionLpsMm: [0, 0, 0], planeToleranceMm: 2, outOfPlaneBehavior: 'hide',
};

export const mockEditorialAnchor: AnnotationAnchor = {
  kind: 'panel-content', panelId: id<FigurePanelId>('panel-a'), composerViewInstanceId: id<ComposerViewInstanceId>('composer-instance'), positionMm: [10, 10],
};

export const mockSheetAnchor: AnnotationAnchor = {
  kind: 'sheet', positionMm: [100, 100],
};

export const mockAnnotations: readonly FigureAnnotation[] = [
  { id: id<FigureAnnotationId>('annotation-lesion'), kind: 'arrow', anchor: mockPatientAnchor, coordinateSpace: 'patient', endpoints: [[0, 0, 0], [5, 0, 0]], strokeColor: '#ff4b3e', strokeWidthMm: 0.5 },
  { id: id<FigureAnnotationId>('annotation-letter'), kind: 'panel-letter', anchor: mockEditorialAnchor, coordinateSpace: 'panel-content', position: [2, 2], text: 'A', box: { sizeMm: [8, 8], paddingMm: 1 }, typography: { fontFamily: 'Jost', fontSizePt: 10, color: '#111111', weight: 'bold' }, fillColor: '#ffffff' },
  { id: id<FigureAnnotationId>('annotation-caption'), kind: 'text', anchor: mockSheetAnchor, coordinateSpace: 'sheet', position: [100, 100], text: '18F-FDG PET/CT', box: { sizeMm: [40, 6], paddingMm: 0 }, typography: { fontFamily: 'Source Serif 4', fontSizePt: 9, color: '#111111', weight: 'normal' } },
  { id: id<FigureAnnotationId>('annotation-scale'), kind: 'scale-bar', anchor: mockSheetAnchor, coordinateSpace: 'sheet', position: [100, 106], lengthMm: 20, orientation: 'horizontal', label: '20 mm' },
  { id: id<FigureAnnotationId>('annotation-measurement'), kind: 'measurement', anchor: mockSheetAnchor, coordinateSpace: 'sheet', geometry: { endpoints: [[100, 108], [120, 108]] }, value: 20, unit: 'mm' },
  // `figure-validators.ts` requires a top-level annotation `coordinateSpace` for
  // every kind, but the frozen `FigureRoiAnnotation` contract only carries it
  // inside `geometry`. The extra runtime property is load-bearing for the
  // validator; the assertion bridges that contract/validator gap without
  // changing the fixture value (tracked as a contract finding, C8).
  { id: id<FigureAnnotationId>('annotation-roi'), kind: 'ellipse', anchor: mockPatientAnchor, coordinateSpace: 'patient', geometry: { coordinateSpace: 'patient', center: [0, 0, 0], radiiMm: [4, 3], rotationDeg: 0 } } as FigureAnnotation,
];

export const mockComposerPanel: ComposerPanel = {
  id: id<FigurePanelId>('panel-a'),
  viewInstance: mockComposerViewInstance,
  framing: mockFraming,
  layout: mockLayout,
  decoration: mockDecoration,
};

export const mockFigureSheet: FigureSheet = {
  id: id<FigureSheetId>('sheet-1'), sizeMm: [180, 120], panels: [mockComposerPanel], annotations: mockAnnotations,
};

export const mockPdfRenderRequest: PublicationRenderRequest = {
  sheetId: mockFigureSheet.id,
  sheetSizeMm: mockFigureSheet.sizeMm,
  figureSheet: mockFigureSheet,
  panelInputs: [{ panelId: mockComposerPanel.id, composerViewInstanceId: mockComposerViewInstance.id, preparedViewId: mockPreparedView.id, preparedView: mockPreparedView, availability: mockMedicalViewBinding.availability, renderSource: 'live-medical', cachedPreviewReference: mockMedicalViewBinding.cachedPreviewReference }],
  renderStateHash: 'sha256:medical-render-state',
  renderer: { rendererName: 'nuclear-medical-renderer', rendererVersion: '0.1.0' },
  target: {
    kind: 'temporary-high-resolution', pixelDimensions: [2126, 1417], dpi: 300, colorProfile: 'sRGB', alpha: 'opaque', liveCanvasPolicy: 'never-resize-live-canvas',
  },
  output: { format: 'pdf', composition: 'hybrid', medicalLayer: 'live-high-resolution-raster', editorialLayer: 'native-vector', medicalContentSource: 'live-medical', preserveTypography: true, preserveAnnotations: true },
  availabilityPolicy: 'require-online',
  renderMode: 'live-medical',
};
