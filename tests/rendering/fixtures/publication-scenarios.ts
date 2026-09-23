/**
 * NuClear P5.5b — browser-side publication renderer port adapter and probe
 * (test infrastructure).
 *
 * Implements the figure-engine `PublicationRendererPort` over the real
 * medical-engine `captureTemporaryRenderTarget` (ADR-009) and drives the whole
 * `renderLivePublication` orchestration in the controlled WebGL 2 harness. This
 * is the composition-root adapter shape; it is test-only and never reachable
 * from product code.
 */

import { version as cornerstoneVersion } from '@cornerstonejs/core';

import type { MedicalViewState, PublicationRenderRequest } from '../../../packages/shared-types/src/index.ts';
import type { VolumeIngestionPlan } from '../../../packages/medical-engine/src/renderer/index.ts';
import { captureTemporaryRenderTarget } from '../../../packages/medical-engine/src/renderer/index.ts';
import { computeRenderTargetPixelDimensions } from '../../../packages/medical-engine/src/view-application/index.ts';
import {
  renderLivePublication,
  type PublicationPanelRaster,
  type PublicationPanelRenderRequest,
  type PublicationRendererPort,
} from '../../../packages/figure-engine/src/publication/index.ts';
import { CT_ASSET_ID, buildCtState, compileCt, ctEvidence, planFromInput } from './application-fixture.ts';
import { captureLiveSnapshot } from './target-snapshot.ts';
import {
  countTargetContainers,
  ctLayers,
  ensureLiveAdapter,
  ensureLiveApplied,
  targetHostOptions,
} from './target-scenario-support.ts';
import type { PublicationProbeAck, PublicationProbeInput } from './publication-probe-types.ts';

const PANEL_ID = 'panel-ct';
const INSTANCE_ID = 'instance-ct';
const PREPARED_ID = 'prepared-ct';
const SHEET_ID = 'sheet-ct';

function describePublicationError(error: unknown): PublicationProbeAck {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      ok: false,
      name: error.name,
      code: typeof code === 'string' ? code : 'UNKNOWN',
      message: error.message,
      stack: error.stack,
    };
  }
  return { ok: false, name: 'Error', code: 'UNKNOWN', message: String(error) };
}

/** Minimal single-panel live `PublicationRenderRequest` over the harness CT state. */
function buildRequest(
  state: MedicalViewState,
  widthMm: number,
  heightMm: number,
  dpi: number,
  availability: 'online' | 'missing',
): PublicationRenderRequest {
  const pixelDimensions = computeRenderTargetPixelDimensions([widthMm, heightMm], dpi);
  const availabilityStatus = { state: availability };
  const preparedView = {
    id: PREPARED_ID,
    sourceViewId: state.id,
    state,
    links: [],
    locks: [],
    provenance: {
      studyInstanceUID: 'harness-study',
      sourceAssetIds: [CT_ASSET_ID],
      sourceSeriesInstanceUIDs: ['harness-series'],
      sourceFingerprints: [],
      engineVersion: '0.1.0',
      createdAt: '2026-09-23T00:00:00Z',
    },
  };
  return {
    sheetId: SHEET_ID,
    sheetSizeMm: [widthMm, heightMm],
    figureSheet: {
      id: SHEET_ID,
      sizeMm: [widthMm, heightMm],
      panels: [
        {
          id: PANEL_ID,
          viewInstance: {
            id: INSTANCE_ID,
            preparedViewId: PREPARED_ID,
            medicalViewBinding: { preparedViewId: PREPARED_ID, availability: availabilityStatus },
          },
          framing: {
            viewportCrop: [0, 0, 1, 1],
            contentSizeMm: [widthMm, heightMm],
            contentOffsetMm: [0, 0],
            contentScale: 1,
            alignment: 'center',
            overflow: 'clip',
          },
          layout: {
            positionMm: [0, 0],
            sizeMm: [widthMm, heightMm],
            rotationDeg: 0,
            zIndex: 0,
            alignment: 'free',
          },
          decoration: {},
        },
      ],
      annotations: [],
    },
    panelInputs: [
      {
        panelId: PANEL_ID,
        composerViewInstanceId: INSTANCE_ID,
        preparedViewId: PREPARED_ID,
        preparedView,
        availability: availabilityStatus,
        renderSource: 'live-medical',
      },
    ],
    renderStateHash: 'sha256:harness-live',
    renderer: { rendererName: 'cornerstone3d', rendererVersion: cornerstoneVersion },
    target: {
      kind: 'temporary-high-resolution',
      pixelDimensions,
      dpi,
      colorProfile: 'srgb',
      alpha: 'opaque',
      liveCanvasPolicy: 'never-resize-live-canvas',
    },
    output: {
      format: 'pdf',
      composition: 'hybrid',
      medicalLayer: 'live-high-resolution-raster',
      editorialLayer: 'native-vector',
      medicalContentSource: 'live-medical',
      preserveTypography: true,
      preserveAnnotations: true,
    },
    renderMode: 'live-medical',
    availabilityPolicy: 'require-online',
  } as unknown as PublicationRenderRequest;
}

/** The composition-root adapter: a `PublicationRendererPort` over the real target. */
function createPublicationPort(ct: VolumeIngestionPlan): PublicationRendererPort {
  const plan = compileCt(ct);
  const evidence = ctEvidence(ct);
  const layers = ctLayers(ct);

  return {
    async renderPanel(request: PublicationPanelRenderRequest): Promise<PublicationPanelRaster> {
      const result = await captureTemporaryRenderTarget(
        {
          spec: request.target,
          sizeMm: request.sizeMm,
          state: request.medicalViewState,
          plan,
          evidence,
          layers,
        },
        targetHostOptions(),
      );
      return {
        panelId: request.panelId,
        pixelDimensions: result.pixelDimensions,
        colorProfile: request.target.colorProfile,
        rgbaBase64: result.descriptor.raster.rgbaBase64,
        byteLength: result.descriptor.raster.byteLength,
        renderer: {
          rendererName: result.descriptor.renderer.renderer,
          rendererVersion: cornerstoneVersion,
        },
      };
    },
  };
}

/**
 * Runs the full `renderLivePublication` orchestration with the real port
 * adapter and returns the serializable panels plus live before/after snapshots.
 */
export async function renderPublicationPanel(
  input: PublicationProbeInput,
): Promise<PublicationProbeAck> {
  try {
    const ct = planFromInput(input.ct);
    await ensureLiveApplied(ct);
    const adapter = ensureLiveAdapter();
    const state = buildCtState(ct);

    const request = buildRequest(
      state,
      input.widthMm,
      input.heightMm,
      input.dpi,
      input.availability ?? 'online',
    );

    const before = captureLiveSnapshot(adapter, [ct.volumeId]);
    const result = await renderLivePublication(request, createPublicationPort(ct));
    const after = captureLiveSnapshot(adapter, [ct.volumeId]);

    return {
      ok: true,
      renderMode: result.renderMode,
      renderStateHash: result.renderStateHash,
      panels: result.panels.map((raster) => ({
        panelId: raster.panelId,
        pixelDimensions: [...raster.pixelDimensions],
        byteLength: raster.byteLength,
        colorProfile: raster.colorProfile,
      })),
      targetContainersAfter: countTargetContainers(),
      before,
      after,
    };
  } catch (error) {
    return describePublicationError(error);
  }
}
