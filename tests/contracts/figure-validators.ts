import type {
  AnnotationAnchor,
  AnnotationCoordinateSpace,
  ComposerPanel,
  ComposerViewInstance,
  FigureAnnotation,
  FigureSheet,
  MedicalViewBinding,
  PanelDecorationState,
  PanelFramingState,
  PanelLayoutState,
  PublicationRenderRequest,
  PublicationOutputSpec,
  CachedPreviewRenderTargetSpec,
  TemporaryRenderTargetSpec,
} from '../../packages/shared-types/src/index.js';
import { isSourceFingerprint } from './validators.ts';
import { isLocalViewOverride, isPreparedView } from './view-validators.ts';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const pair = (value: unknown): value is readonly number[] => Array.isArray(value) && value.length === 2 && value.every(finite);
const triple = (value: unknown): value is readonly number[] => Array.isArray(value) && value.length === 3 && value.every(finite);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const positivePair = (value: unknown): value is readonly number[] => pair(value) && value[0] > 0 && value[1] > 0;
const crop = (value: unknown): value is readonly number[] => Array.isArray(value) && value.length === 4 && value.every(finite) && value[0] >= 0 && value[1] >= 0 && value[2] <= 1 && value[3] <= 1 && value[0] < value[2] && value[1] < value[3];
const position = (value: unknown): value is readonly number[] => pair(value);
const availability = (value: unknown): boolean => record(value) && ['online', 'loading', 'offline-cached', 'missing', 'mismatch'].includes(String(value.state));

const cachedPreview = (value: unknown): boolean => {
  if (!record(value) || !nonEmpty(value.previewId) || !nonEmpty(value.renderStateHash) || !positivePair(value.pixelDimensions) || !nonEmpty(value.colorProfile) || !nonEmpty(value.generatedAt) || !Array.isArray(value.sourceFingerprintSet) || !value.sourceFingerprintSet.every(isSourceFingerprint)) return false;
  return record(value.rendererMetadata) && nonEmpty(value.rendererMetadata.rendererName) && nonEmpty(value.rendererMetadata.rendererVersion);
};

export const isPanelFramingState = (value: unknown): value is PanelFramingState => record(value) && crop(value.viewportCrop) && positivePair(value.contentSizeMm) && position(value.contentOffsetMm) && finite(value.contentScale) && value.contentScale > 0 && ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(String(value.alignment)) && ['clip', 'visible'].includes(String(value.overflow));

export const isPanelLayoutState = (value: unknown): value is PanelLayoutState => {
  if (!record(value) || !position(value.positionMm) || !positivePair(value.sizeMm) || !finite(value.rotationDeg) || !Number.isInteger(value.zIndex) || !['free', 'grid', 'centered'].includes(String(value.alignment))) return false;
  if (value.constraints === undefined) return true;
  if (!record(value.constraints)) return false;
  return (value.constraints.minSizeMm === undefined || positivePair(value.constraints.minSizeMm)) && (value.constraints.maxSizeMm === undefined || positivePair(value.constraints.maxSizeMm)) && (value.constraints.aspectRatio === undefined || (finite(value.constraints.aspectRatio) && value.constraints.aspectRatio > 0));
};

const decorationText = (value: unknown): boolean => record(value) && nonEmpty(value.text) && position(value.position) && nonEmpty(value.fontFamily) && finite(value.fontSizePt) && value.fontSizePt > 0 && nonEmpty(value.color);
export const isPanelDecorationState = (value: unknown): value is PanelDecorationState => {
  if (!record(value)) return false;
  if (value.border !== undefined && (!record(value.border) || !nonEmpty(value.border.color) || !finite(value.border.widthMm) || value.border.widthMm < 0 || !['solid', 'dashed', 'dotted', 'none'].includes(String(value.border.style)))) return false;
  if (value.background !== undefined && !nonEmpty(value.background)) return false;
  return (value.label === undefined || decorationText(value.label)) && (value.caption === undefined || decorationText(value.caption));
};

export const isMedicalViewBinding = (value: unknown): value is MedicalViewBinding => {
  if (!record(value) || !nonEmpty(value.preparedViewId) || !availability(value.availability)) return false;
  return (value.surfaceId === undefined || nonEmpty(value.surfaceId)) && (value.cachedPreviewReference === undefined || cachedPreview(value.cachedPreviewReference));
};

export const isComposerViewInstance = (value: unknown): value is ComposerViewInstance => {
  if (!record(value) || !nonEmpty(value.id) || !nonEmpty(value.preparedViewId) || !isMedicalViewBinding(value.medicalViewBinding) || value.medicalViewBinding.preparedViewId !== value.preparedViewId || !Array.isArray(value.localOverrides)) return false;
  return value.localOverrides.every((override) => isLocalViewOverride(override) && override.targetComposerViewInstanceId === value.id);
};

export const isAnnotationAnchor = (value: unknown): value is AnnotationAnchor => {
  if (!record(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'patient') return nonEmpty(value.panelId) && nonEmpty(value.composerViewInstanceId) && triple(value.positionLpsMm) && finite(value.planeToleranceMm) && value.planeToleranceMm >= 0 && ['hide', 'fade'].includes(String(value.outOfPlaneBehavior));
  if (value.kind === 'panel-content') return nonEmpty(value.panelId) && nonEmpty(value.composerViewInstanceId) && position(value.positionMm);
  if (value.kind === 'sheet') return position(value.positionMm);
  return false;
};

const coordinateSpace = (value: unknown): value is AnnotationCoordinateSpace => ['patient', 'panel-content', 'sheet'].includes(String(value));
const annotationPoint = (value: unknown, space: AnnotationCoordinateSpace): boolean => space === 'patient' ? triple(value) : pair(value);
const anchorSpace = (anchor: AnnotationAnchor): AnnotationCoordinateSpace => anchor.kind === 'patient' ? 'patient' : anchor.kind === 'panel-content' ? 'panel-content' : 'sheet';
const annotationBase = (value: Record<string, unknown>): boolean => nonEmpty(value.id) && isAnnotationAnchor(value.anchor) && (value.strokeColor === undefined || nonEmpty(value.strokeColor)) && (value.fillColor === undefined || nonEmpty(value.fillColor)) && (value.strokeWidthMm === undefined || (finite(value.strokeWidthMm) && value.strokeWidthMm >= 0));

export const isFigureAnnotation = (value: unknown): value is FigureAnnotation => {
  if (!record(value) || !annotationBase(value) || !coordinateSpace(value.coordinateSpace) || value.coordinateSpace !== anchorSpace(value.anchor)) return false;
  const space = value.coordinateSpace;
  if (value.kind === 'line' || value.kind === 'arrow') return Array.isArray(value.endpoints) && value.endpoints.length === 2 && value.endpoints.every((point) => annotationPoint(point, space));
  if (value.kind === 'circle') return record(value.geometry) && value.geometry.coordinateSpace === space && annotationPoint(value.geometry.center, space) && finite(value.geometry.radiusMm) && value.geometry.radiusMm > 0;
  if (value.kind === 'ellipse') return record(value.geometry) && value.geometry.coordinateSpace === space && annotationPoint(value.geometry.center, space) && positivePair(value.geometry.radiiMm) && finite(value.geometry.rotationDeg);
  if (value.kind === 'rectangle') return record(value.geometry) && value.geometry.coordinateSpace === space && annotationPoint(value.geometry.origin, space) && positivePair(value.geometry.sizeMm) && finite(value.geometry.rotationDeg);
  if (value.kind === 'text' || value.kind === 'panel-letter') return annotationPoint(value.position, space) && nonEmpty(value.text) && record(value.box) && positivePair(value.box.sizeMm) && finite(value.box.paddingMm) && value.box.paddingMm >= 0 && record(value.typography) && nonEmpty(value.typography.fontFamily) && finite(value.typography.fontSizePt) && value.typography.fontSizePt > 0 && nonEmpty(value.typography.color) && ['normal', 'bold'].includes(String(value.typography.weight));
  if (value.kind === 'scale-bar') return annotationPoint(value.position, space) && finite(value.lengthMm) && value.lengthMm > 0 && ['horizontal', 'vertical'].includes(String(value.orientation)) && (value.label === undefined || typeof value.label === 'string');
  if (value.kind === 'measurement') return record(value.geometry) && Array.isArray(value.geometry.endpoints) && value.geometry.endpoints.length === 2 && value.geometry.endpoints.every((point) => annotationPoint(point, space)) && finite(value.value) && value.value >= 0 && (value.unit === 'mm' || value.unit === 'cm');
  return false;
};

export const isComposerPanel = (value: unknown): value is ComposerPanel => record(value) && nonEmpty(value.id) && isComposerViewInstance(value.viewInstance) && isPanelFramingState(value.framing) && isPanelLayoutState(value.layout) && isPanelDecorationState(value.decoration);

const fingerprintKey = (value: Record<string, unknown>): string => JSON.stringify([
  value.studyInstanceUID,
  value.seriesInstanceUID,
  value.instanceCount,
  value.contentDigest,
  Object.prototype.hasOwnProperty.call(value, 'sopInstanceUIDsHash'), value.sopInstanceUIDsHash,
  Object.prototype.hasOwnProperty.call(value, 'totalBytes'), value.totalBytes,
  Object.prototype.hasOwnProperty.call(value, 'geometricDigest'), value.geometricDigest,
]);

/** Equality of fingerprint multisets: order-independent, duplicate-sensitive, and complete. */
const sameFingerprints = (left: readonly Record<string, unknown>[], right: readonly Record<string, unknown>[]): boolean => {
  if (left.length !== right.length) return false;
  const counts = (items: readonly Record<string, unknown>[]): Map<string, number> => {
    const result = new Map<string, number>();
    for (const item of items) {
      const key = fingerprintKey(item);
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  };
  const leftCounts = counts(left);
  const rightCounts = counts(right);
  if (leftCounts.size !== rightCounts.size) return false;
  return [...leftCounts].every(([key, count]) => rightCounts.get(key) === count);
};

const samePreview = (left: Record<string, unknown>, right: Record<string, unknown>): boolean => left.previewId === right.previewId && left.renderStateHash === right.renderStateHash && left.colorProfile === right.colorProfile && JSON.stringify(left.pixelDimensions) === JSON.stringify(right.pixelDimensions) && Array.isArray(left.sourceFingerprintSet) && Array.isArray(right.sourceFingerprintSet) && sameFingerprints(left.sourceFingerprintSet as readonly Record<string, unknown>[], right.sourceFingerprintSet as readonly Record<string, unknown>[]) && JSON.stringify(left.rendererMetadata) === JSON.stringify(right.rendererMetadata);

const sameAvailability = (left: Record<string, unknown>, right: Record<string, unknown>): boolean => {
  if (left.state !== right.state) return false;
  for (const field of ['message', 'lastCheckedAt']) {
    if (Object.prototype.hasOwnProperty.call(left, field) !== Object.prototype.hasOwnProperty.call(right, field) || left[field] !== right[field]) return false;
  }
  for (const field of ['expectedFingerprint', 'observedFingerprint']) {
    const leftValue = left[field];
    const rightValue = right[field];
    if (Object.prototype.hasOwnProperty.call(left, field) !== Object.prototype.hasOwnProperty.call(right, field)) return false;
    if (leftValue === undefined || rightValue === undefined) continue;
    if (!record(leftValue) || !record(rightValue) || !sameFingerprints([leftValue], [rightValue])) return false;
  }
  return true;
};

export const isFigureSheet = (value: unknown): value is FigureSheet => {
  if (!record(value) || !nonEmpty(value.id) || !positivePair(value.sizeMm) || !Array.isArray(value.panels) || value.panels.length === 0 || !value.panels.every(isComposerPanel) || new Set(value.panels.map((panel) => record(panel) ? panel.id : '')).size !== value.panels.length || new Set(value.panels.map((panel) => record(panel) && record(panel.viewInstance) ? panel.viewInstance.id : '')).size !== value.panels.length || !Array.isArray(value.annotations) || !value.annotations.every(isFigureAnnotation) || new Set(value.annotations.map((annotation) => record(annotation) ? annotation.id : '')).size !== value.annotations.length) return false;
  const panels = new Map(value.panels.map((panel) => [panel.id, panel.viewInstance.id]));
  return value.annotations.every((annotation) => annotation.anchor.kind === 'sheet' || (panels.get(annotation.anchor.panelId) === annotation.anchor.composerViewInstanceId));
};

export const isTemporaryRenderTargetSpec = (value: unknown): value is TemporaryRenderTargetSpec => record(value) && value.kind === 'temporary-high-resolution' && positivePair(value.pixelDimensions) && finite(value.dpi) && value.dpi > 0 && nonEmpty(value.colorProfile) && ['opaque', 'preserve'].includes(String(value.alpha)) && value.liveCanvasPolicy === 'never-resize-live-canvas';
export const isPublicationOutputSpec = (value: unknown): value is PublicationOutputSpec => {
  if (!record(value)) return false;
  if (value.medicalContentSource === 'live-medical') {
    if (value.format === 'pdf') return value.composition === 'hybrid' && value.medicalLayer === 'live-high-resolution-raster' && value.editorialLayer === 'native-vector' && value.preserveTypography === true && value.preserveAnnotations === true;
    return (value.format === 'tiff' || value.format === 'png') && value.composition === 'raster' && value.medicalLayer === 'live-high-resolution-raster' && value.editorialLayer === 'raster';
  }
  if (value.medicalContentSource !== 'cached-preview' || value.resampling !== 'forbidden') return false;
  if (value.format === 'pdf') return value.composition === 'hybrid' && value.medicalLayer === 'cached-preview-raster' && value.editorialLayer === 'native-vector' && value.preserveTypography === true && value.preserveAnnotations === true;
  return (value.format === 'tiff' || value.format === 'png') && value.composition === 'raster' && value.medicalLayer === 'cached-preview-raster' && value.editorialLayer === 'raster';
};

export const isCachedPreviewRenderTargetSpec = (value: unknown): value is CachedPreviewRenderTargetSpec => record(value) && value.kind === 'cached-preview' && nonEmpty(value.colorProfile) && value.resampling === 'forbidden' && value.liveCanvasPolicy === 'never-resize-live-canvas';

const expectedPixels = (mm: number, dpi: number): number => Math.round(mm / 25.4 * dpi);
const inputMatchesPanel = (input: Record<string, unknown>, sheetPanel: ComposerPanel): boolean => input.panelId === sheetPanel.id && input.composerViewInstanceId === sheetPanel.viewInstance.id && input.preparedViewId === sheetPanel.viewInstance.preparedViewId;

export const isPublicationRenderRequest = (value: unknown): value is PublicationRenderRequest => {
  if (!record(value) || !nonEmpty(value.sheetId) || !positivePair(value.sheetSizeMm) || !isFigureSheet(value.figureSheet) || value.sheetId !== value.figureSheet.id || JSON.stringify(value.sheetSizeMm) !== JSON.stringify(value.figureSheet.sizeMm) || !Array.isArray(value.panelInputs) || value.panelInputs.length !== value.figureSheet.panels.length || new Set(value.panelInputs.map((input) => record(input) ? input.panelId : '')).size !== value.panelInputs.length || !nonEmpty(value.renderStateHash) || !record(value.renderer) || !nonEmpty(value.renderer.rendererName) || !nonEmpty(value.renderer.rendererVersion) || !isPublicationOutputSpec(value.output) || !['require-online', 'allow-offline-preview'].includes(String(value.availabilityPolicy)) || !['live-medical', 'offline-cached-preview'].includes(String(value.renderMode))) return false;
  if (value.renderMode === 'live-medical' && value.output.medicalContentSource !== 'live-medical') return false;
  if (value.renderMode === 'offline-cached-preview' && value.output.medicalContentSource !== 'cached-preview') return false;
  if (value.renderMode === 'live-medical') {
    if (!isTemporaryRenderTargetSpec(value.target) || value.output.medicalContentSource !== 'live-medical') return false;
    if (value.target.pixelDimensions[0] !== expectedPixels(value.sheetSizeMm[0], value.target.dpi) || value.target.pixelDimensions[1] !== expectedPixels(value.sheetSizeMm[1], value.target.dpi)) return false;
  } else if (!isCachedPreviewRenderTargetSpec(value.target) || value.output.medicalContentSource !== 'cached-preview') return false;
  const panels = value.figureSheet.panels;
  return value.panelInputs.every((input) => {
    if (!record(input) || !nonEmpty(input.panelId) || !nonEmpty(input.composerViewInstanceId) || !nonEmpty(input.preparedViewId) || !isPreparedView(input.preparedView) || input.preparedView.id !== input.preparedViewId || !availability(input.availability) || !['live-medical', 'cached-preview'].includes(String(input.renderSource))) return false;
    const panel = panels.find((candidate) => candidate.id === input.panelId);
    if (!panel || !inputMatchesPanel(input, panel)) return false;
    const binding = panel.viewInstance.medicalViewBinding;
    if (!sameAvailability(input.availability, binding.availability)) return false;
    const bindingPreview = binding.cachedPreviewReference;
    const inputPreview = input.cachedPreviewReference;
    if ((bindingPreview === undefined) !== (inputPreview === undefined)) return false;
    if (bindingPreview !== undefined && (!record(inputPreview) || !cachedPreview(inputPreview) || !samePreview(inputPreview, bindingPreview))) return false;
    if (input.availability.state === 'online') return value.renderMode === 'live-medical' && input.renderSource === 'live-medical';
    if (input.availability.state !== 'offline-cached' || value.availabilityPolicy !== 'allow-offline-preview' || value.renderMode !== 'offline-cached-preview' || input.renderSource !== 'cached-preview' || !record(input.cachedPreviewReference) || !cachedPreview(input.cachedPreviewReference) || !record(input.preparedView.cachedPreviewReference) || !samePreview(input.cachedPreviewReference, input.preparedView.cachedPreviewReference)) return false;
    return input.cachedPreviewReference.renderStateHash === value.renderStateHash && sameFingerprints(input.cachedPreviewReference.sourceFingerprintSet as readonly Record<string, unknown>[], input.preparedView.provenance.sourceFingerprints as readonly Record<string, unknown>[]);
  });
};
