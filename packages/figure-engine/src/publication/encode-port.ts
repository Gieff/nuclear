/**
 * @nuclear/figure-engine — publication encoder port contract (P5.6, ADR-015
 * Track 1).
 *
 * `figure-engine` composes the figure and defines the encoder contract; the
 * concrete PNG/TIFF writer is a caller-supplied adapter (ADR-014 D5/ADR-015
 * OD-6d) so this package stays free of `node:zlib`, DOM and third-party
 * encoders. Pure and Node-safe.
 */

import type { PixelDimensions } from './units.js';

/** The flattened sheet raster handed to a format encoder. */
export interface PublicationRasterRequest {
  readonly pixelDimensions: PixelDimensions;
  /** Row-major RGBA8 bytes; length must equal `width * height * 4`. */
  readonly rgba: Uint8Array;
  /** Declared colour profile; v1 requires sRGB (ADR-015 OD-6c). */
  readonly colorProfile: string;
}

export interface EncoderIdentity {
  readonly encoderName: string;
  readonly encoderVersion: string;
}

/** Encoded bytes plus the provenance needed for reproducibility. */
export interface EncodedArtifact {
  readonly format: 'png' | 'tiff';
  readonly pixelDimensions: PixelDimensions;
  readonly colorProfile: string;
  readonly bytes: Uint8Array;
  readonly encoder: EncoderIdentity;
}

/** Caller-supplied format encoder; implemented outside `figure-engine`. */
export interface EncoderPort {
  encodePng(request: PublicationRasterRequest): Promise<EncodedArtifact>;
  encodeTiff(request: PublicationRasterRequest): Promise<EncodedArtifact>;
}
