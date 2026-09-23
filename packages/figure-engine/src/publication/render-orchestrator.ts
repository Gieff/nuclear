/**
 * @nuclear/figure-engine — live publication render orchestration (P5.5a).
 *
 * Turns a live `PublicationRenderRequest` into one high-resolution medical
 * raster per panel by calling a caller-supplied `PublicationRendererPort`
 * (ADR-014 D1/D3, ADR-009). `figure-engine` derives the per-panel temporary
 * target from the panel's physical content aperture and the request DPI, then
 * validates the returned raster fail-closed: a wrong panel, wrong/undersized
 * dimensions (no upscaling), a wrong byte length or a blank renderer identity is
 * refused. The port is the only rendering seam; this module owns no renderer
 * and never resizes a live canvas.
 *
 * Pure and Node-safe (the port may be asynchronous; tests use a fake port).
 */

import type {
  ComposerViewInstanceId,
  FigurePanelId,
  FigureSheetId,
  MedicalViewState,
  PanelFramingState,
  PreparedViewId,
  PublicationRenderRequest,
  TemporaryRenderTargetSpec,
} from '@nuclear/shared-types';

import {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  type FigurePublicationErrorCode,
} from './errors.js';
import { computePanelContentPixels } from './panel-raster.js';
import { validatePublicationPanelRaster } from './render-raster.js';
import type {
  PublicationPanelRaster,
  PublicationPanelRenderRequest,
  PublicationRendererPort,
} from './render-port.js';

export interface PublicationRenderResult {
  readonly sheetId: FigureSheetId;
  readonly renderMode: 'live-medical';
  readonly renderStateHash: string;
  /** One raster per panel, in the request's panel order. */
  readonly panels: readonly PublicationPanelRaster[];
}

function fail(code: FigurePublicationErrorCode, message: string, cause?: unknown): never {
  throw new FigurePublicationError(code, message, cause);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(FIGURE_PUBLICATION_ERROR_CODES.renderFailed, `${path} must be a plain object`);
  }
  return value;
}

function asText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(FIGURE_PUBLICATION_ERROR_CODES.renderFailed, `${path} must be a non-blank string`);
  }
  return value;
}

function asPositiveFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail(FIGURE_PUBLICATION_ERROR_CODES.renderFailed, `${path} must be a finite positive number`);
  }
  return value;
}

async function callRenderPort(
  port: PublicationRendererPort,
  request: PublicationPanelRenderRequest,
  panelId: string,
): Promise<unknown> {
  try {
    return await port.renderPanel(request);
  } catch (error) {
    if (error instanceof FigurePublicationError) {
      throw error;
    }
    fail(
      FIGURE_PUBLICATION_ERROR_CODES.renderFailed,
      `renderer port failed for panel '${panelId}'`,
      error,
    );
  }
}

/**
 * Renders every panel of a live publication request through `port`. Fail-closed:
 * a non-live request, a non-temporary target, a non-online source, a
 * panel/instance mismatch, an invalid framing, a port failure or a malformed
 * raster is refused with a typed error.
 */
export async function renderLivePublication(
  request: PublicationRenderRequest,
  port: PublicationRendererPort,
): Promise<PublicationRenderResult> {
  const requestRecord = asRecord(request, 'publication request');
  if (requestRecord.renderMode !== 'live-medical') {
    fail(
      FIGURE_PUBLICATION_ERROR_CODES.renderUnavailable,
      `renderMode '${String(requestRecord.renderMode)}' is not 'live-medical'; the live orchestrator does not render an offline cached preview`,
    );
  }
  const portRecord = asRecord(port, 'renderer port');
  if (typeof portRecord.renderPanel !== 'function') {
    fail(FIGURE_PUBLICATION_ERROR_CODES.renderFailed, 'renderer port must expose a renderPanel() function');
  }

  const target = asRecord(requestRecord.target, 'publication request target');
  if (target.kind !== 'temporary-high-resolution') {
    fail(
      FIGURE_PUBLICATION_ERROR_CODES.renderUnavailable,
      `target kind '${String(target.kind)}' is not 'temporary-high-resolution'; a live request needs a temporary high-resolution target`,
    );
  }
  const dpi = asPositiveFinite(target.dpi, 'target.dpi');
  const colorProfile = asText(target.colorProfile, 'target.colorProfile');
  const alpha = target.alpha === 'opaque' || target.alpha === 'preserve' ? target.alpha : undefined;
  if (alpha === undefined) {
    fail(FIGURE_PUBLICATION_ERROR_CODES.renderFailed, `target.alpha '${String(target.alpha)}' must be 'opaque' or 'preserve'`);
  }
  const renderStateHash = asText(requestRecord.renderStateHash, 'renderStateHash');

  const sheet = asRecord(requestRecord.figureSheet, 'figureSheet');
  const sheetId = asText(sheet.id, 'figureSheet.id') as FigureSheetId;
  const sheetPanels = sheet.panels;
  if (!Array.isArray(sheetPanels)) {
    fail(FIGURE_PUBLICATION_ERROR_CODES.renderFailed, 'figureSheet.panels must be an array');
  }
  const panelIndex = new Map<string, Record<string, unknown>>();
  for (const [index, panel] of sheetPanels.entries()) {
    const record = asRecord(panel, `figureSheet.panels[${index}]`);
    panelIndex.set(String(record.id), record);
  }

  const inputs = requestRecord.panelInputs;
  if (!Array.isArray(inputs) || inputs.length === 0) {
    fail(FIGURE_PUBLICATION_ERROR_CODES.renderFailed, 'panelInputs must be a non-empty array');
  }

  const panels: PublicationPanelRaster[] = [];
  for (const [index, inputValue] of inputs.entries()) {
    const input = asRecord(inputValue, `panelInputs[${index}]`);
    const panelId = asText(input.panelId, `panelInputs[${index}].panelId`);
    const composerViewInstanceId = asText(
      input.composerViewInstanceId,
      `panelInputs[${index}].composerViewInstanceId`,
    );
    const preparedViewId = asText(input.preparedViewId, `panelInputs[${index}].preparedViewId`);

    const availability = isRecord(input.availability) ? input.availability.state : undefined;
    if (availability !== 'online') {
      fail(
        FIGURE_PUBLICATION_ERROR_CODES.renderUnavailable,
        `panel '${panelId}' availability '${String(availability)}' fails closed for live publication`,
      );
    }
    if (input.renderSource !== 'live-medical') {
      fail(
        FIGURE_PUBLICATION_ERROR_CODES.renderUnavailable,
        `panel '${panelId}' renderSource '${String(input.renderSource)}' is not 'live-medical'`,
      );
    }

    const preparedView = asRecord(input.preparedView, `panel '${panelId}' preparedView`);
    if (preparedView.id !== preparedViewId) {
      fail(
        FIGURE_PUBLICATION_ERROR_CODES.renderFailed,
        `panel '${panelId}' carries preparedView '${String(preparedView.id)}' but declared '${preparedViewId}'`,
      );
    }
    const medicalViewState = asRecord(preparedView.state, `panel '${panelId}' preparedView.state`);

    const sheetPanel = panelIndex.get(panelId);
    if (sheetPanel === undefined) {
      fail(FIGURE_PUBLICATION_ERROR_CODES.renderFailed, `panel '${panelId}' is not present in the figure sheet`);
    }
    const viewInstance = asRecord(sheetPanel.viewInstance, `panel '${panelId}' viewInstance`);
    if (viewInstance.id !== composerViewInstanceId || viewInstance.preparedViewId !== preparedViewId) {
      fail(
        FIGURE_PUBLICATION_ERROR_CODES.renderFailed,
        `panel '${panelId}' sheet binding does not match the panel input`,
      );
    }

    const panelFraming = asRecord(
      sheetPanel.framing,
      `panel '${panelId}' framing`,
    ) as unknown as PanelFramingState;
    const pixelDimensions = computePanelContentPixels(panelFraming, dpi);
    const sizeMm: readonly [number, number] = Object.freeze([
      panelFraming.contentSizeMm[0],
      panelFraming.contentSizeMm[1],
    ]);
    const panelTarget: TemporaryRenderTargetSpec = Object.freeze({
      kind: 'temporary-high-resolution',
      pixelDimensions,
      dpi,
      colorProfile,
      alpha,
      liveCanvasPolicy: 'never-resize-live-canvas',
    });

    const rawRaster = await callRenderPort(
      port,
      {
        panelId: panelId as FigurePanelId,
        composerViewInstanceId: composerViewInstanceId as ComposerViewInstanceId,
        preparedViewId: preparedViewId as PreparedViewId,
        medicalViewState: medicalViewState as unknown as MedicalViewState,
        target: panelTarget,
        sizeMm,
        renderStateHash,
      },
      panelId,
    );
    panels.push(validatePublicationPanelRaster(rawRaster, panelId, pixelDimensions));
  }

  return Object.freeze({
    sheetId,
    renderMode: 'live-medical' as const,
    renderStateHash,
    panels: Object.freeze(panels),
  });
}
