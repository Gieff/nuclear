/**
 * @nuclear/figure-engine — publication raster validation (P5.5a).
 *
 * Validates the neutral raster returned by a `PublicationRendererPort`
 * fail-closed: a wrong panel, wrong dimensions (no upscaling), a wrong byte
 * length or a blank identity is a typed `FIGURE_PUBLICATION_RASTER_INVALID`
 * refusal. Internal module: not re-exported from the package barrel.
 *
 * Pure and Node-safe.
 */

import type { FigurePanelId } from '@nuclear/shared-types';

import { FIGURE_PUBLICATION_ERROR_CODES, FigurePublicationError } from './errors.js';
import type { PublicationPanelRaster } from './render-port.js';

function failRaster(message: string): never {
  throw new FigurePublicationError(FIGURE_PUBLICATION_ERROR_CODES.rasterInvalid, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    failRaster(`${path} must be a plain object`);
  }
  return value;
}

function asText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    failRaster(`${path} must be a non-blank string`);
  }
  return value;
}

/**
 * Validates and freezes a renderer result. `required` is the physically
 * computed aperture size in pixels; a result that differs is refused rather
 * than accepted, upscaled or downscaled.
 */
export function validatePublicationPanelRaster(
  value: unknown,
  panelId: string,
  required: readonly [number, number],
): PublicationPanelRaster {
  const raster = asRecord(value, `panel '${panelId}' renderer result`);
  if (raster.panelId !== panelId) {
    failRaster(
      `renderer returned a raster for panel '${String(raster.panelId)}' while '${panelId}' was requested`,
    );
  }
  const dimensions = raster.pixelDimensions;
  if (
    !Array.isArray(dimensions) ||
    dimensions.length !== 2 ||
    dimensions[0] !== required[0] ||
    dimensions[1] !== required[1]
  ) {
    failRaster(
      `renderer returned ${Array.isArray(dimensions) ? dimensions.join('x') : String(dimensions)} px for panel '${panelId}' but the physical target requires ${required[0]}x${required[1]} px; upscaling or a wrong target is refused`,
    );
  }
  const colorProfile = asText(raster.colorProfile, `panel '${panelId}' raster.colorProfile`);
  const rgbaBase64 = asText(raster.rgbaBase64, `panel '${panelId}' raster.rgbaBase64`);
  // `byteLength` is re-derived from the required dimensions rather than trusted:
  // a self-consistent-but-wrong metadata value is normalised to the physical
  // size, and a mismatch is refused below.
  const byteLength = required[0] * required[1] * 4;
  if (raster.byteLength !== byteLength) {
    failRaster(
      `panel '${panelId}' raster byteLength ${String(raster.byteLength)} does not equal ${byteLength} (${required[0]}x${required[1]} RGBA8)`,
    );
  }
  const renderer = asRecord(raster.renderer, `panel '${panelId}' raster.renderer`);
  const rendererName = asText(renderer.rendererName, `panel '${panelId}' raster.renderer.rendererName`);
  const rendererVersion = asText(
    renderer.rendererVersion,
    `panel '${panelId}' raster.renderer.rendererVersion`,
  );

  return Object.freeze({
    panelId: panelId as FigurePanelId,
    pixelDimensions: Object.freeze([required[0], required[1]]) as readonly [number, number],
    colorProfile,
    rgbaBase64,
    byteLength,
    renderer: Object.freeze({ rendererName, rendererVersion }),
  });
}
