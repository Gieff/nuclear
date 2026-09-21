/**
 * @nuclear/medical-engine — pure, Node-safe capture descriptor/provenance and
 * fail-closed scalar-domain guards for ordinary medical raster capture
 * (P3.4-C.1).
 *
 * This module is the Node-testable half of P3.4-C. It defines the serializable
 * shape that the P3.4-C.2 browser capture must return, builds the provenance
 * object purely from a compiled `ViewApplicationPlan` plus caller-declared
 * transport evidence, and refuses a PET layer whose committed scalars are not
 * the ratified Bq/mL transport domain (spec §6).
 *
 * It imports no `@cornerstonejs/core`, touches no DOM and reads no pixel data:
 * the real raster read-back, the mounted-viewport measurement and the §6 scalar
 * comparison belong to P3.4-C.2. No value is ever defaulted, inferred or
 * fabricated; a missing evidence entry is a typed refusal. This module performs
 * no floating-point library call (P2.5 integrity gate).
 */

import { VIEW_APPLICATION_ERROR_CODES, refuse } from './errors.js';
import type { ViewApplicationPlan, ViewLayerApplication } from './types.js';

/**
 * Ratified transport scalar domain for a PET layer (spec §6 / ADR-005): the
 * scalars Cornerstone receives are rescaled Bq/mL, never the clinical
 * `suv-bw / g/mL` display semantic.
 */
export const PET_TRANSPORT_SCALAR_DOMAIN = 'rescaled-bqml';

/** Relative tolerance for the P3.4-C.2 §6 scalar comparison. */
export const CAPTURE_SCALAR_RELATIVE_TOLERANCE = 1e-6;

/** Caller-declared transport evidence for one applied layer. */
export interface ViewCaptureLayerEvidence {
  readonly assetId: string;
  /** Physical unit of the scalar array Cornerstone receives (e.g. rescaled-hu, rescaled-bqml). */
  readonly scalarDataDomain: string;
  /** Committed transport-domain scalars; required for a PET layer (spec §6). */
  readonly scalarData?: ArrayLike<number>;
}

export interface ViewCaptureLayerProvenance {
  readonly assetId: string;
  readonly volumeId: string;
  readonly role: 'base' | 'overlay';
  readonly modality: 'ct' | 'pet' | 'generic';
  readonly paletteName: string;
  readonly scalarDataDomain: string;
  readonly voiRange: { readonly lower: number; readonly upper: number };
}

export interface ViewCaptureProvenance {
  readonly viewId: string;
  readonly blendMode: string;
  readonly appliedOrientation: {
    readonly viewPlaneNormal: readonly [number, number, number];
    readonly viewUp: readonly [number, number, number];
  };
  readonly layers: readonly ViewCaptureLayerProvenance[];
}

export interface ViewCaptureRasterRef {
  readonly width: number;
  readonly height: number;
  readonly format: 'rgba8';
  readonly byteLength: number;
  /** Pixels whose alpha channel is non-zero (non-empty proof). */
  readonly nonEmptyPixelCount: number;
  /** Base64-encoded RGBA bytes, row-major. */
  readonly rgbaBase64: string;
}

export interface ViewCaptureRendererFacts {
  readonly renderer: string;
  readonly softwareRasterizer: boolean;
}

/** Serializable descriptor returned by the P3.4-C.2 browser capture. */
export interface MedicalCaptureDescriptor {
  readonly viewId: string;
  /** Native pixel dimensions measured from the mounted viewport element. */
  readonly pixelSize: readonly [number, number];
  readonly raster: ViewCaptureRasterRef;
  readonly provenance: ViewCaptureProvenance;
  readonly renderer: ViewCaptureRendererFacts;
}

/**
 * Refuses a PET layer whose transport evidence is not the ratified Bq/mL
 * domain. A non-PET layer has no transport obligation and is a no-op. A PET
 * layer must declare `scalarDataDomain === 'rescaled-bqml'` and carry at least
 * one committed finite transport scalar; missing or non-finite scalars are
 * refused rather than fabricated.
 */
export function assertPetTransportEvidence(
  layer: ViewLayerApplication,
  evidence: ViewCaptureLayerEvidence,
): void {
  if (layer.modality !== 'pet') {
    return;
  }

  if (evidence.scalarDataDomain !== PET_TRANSPORT_SCALAR_DOMAIN) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
      `PET layer for asset '${layer.assetId}' declares scalarDataDomain '${evidence.scalarDataDomain}'; the ratified transport domain is '${PET_TRANSPORT_SCALAR_DOMAIN}' (spec §6), so the raster cannot be verified as quantitative Bq/mL`,
    );
  }

  const scalars = evidence.scalarData;
  if (scalars === undefined || scalars.length === 0) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
      `PET layer for asset '${layer.assetId}' has no committed transport-domain scalarData; missing scalars are never fabricated or inferred`,
    );
  }

  for (let index = 0; index < scalars.length; index += 1) {
    if (!Number.isFinite(scalars[index])) {
      refuse(
        VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
        `PET layer for asset '${layer.assetId}' has a non-finite transport scalar at index ${index}; refusing to certify a scalar domain over non-finite data`,
      );
    }
  }
}

/**
 * Pure provenance builder: validates that every plan layer has complete
 * declared evidence, runs the PET transport guard for every layer, and emits
 * the provenance verbatim from the compiled plan. No default palette, no
 * fallback and no inference is applied.
 */
export function buildCaptureProvenance(
  plan: ViewApplicationPlan,
  layers: readonly ViewCaptureLayerEvidence[],
  blendMode: string,
): ViewCaptureProvenance {
  const evidenceByAssetId = new Map<string, ViewCaptureLayerEvidence>();
  for (const evidence of layers) {
    evidenceByAssetId.set(evidence.assetId, evidence);
  }

  const provenanceLayers: ViewCaptureLayerProvenance[] = [];
  for (const layer of plan.layers) {
    const evidence = evidenceByAssetId.get(layer.assetId);
    if (evidence === undefined) {
      refuse(
        VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
        `layer '${layer.assetId}' has no capture evidence entry; the scalar domain is never inferred from a neighbouring layer`,
      );
    }

    if (evidence.scalarDataDomain.trim().length === 0) {
      refuse(
        VIEW_APPLICATION_ERROR_CODES.scalarDomainUnverified,
        `layer '${layer.assetId}' declares an empty scalarDataDomain; the physical unit of the received scalars must be declared explicitly`,
      );
    }

    assertPetTransportEvidence(layer, evidence);

    provenanceLayers.push({
      assetId: layer.assetId,
      volumeId: layer.volumeId,
      role: layer.role,
      modality: layer.modality,
      paletteName: layer.properties.colormap.name,
      scalarDataDomain: evidence.scalarDataDomain,
      voiRange: {
        lower: layer.properties.voiRange.lower,
        upper: layer.properties.voiRange.upper,
      },
    });
  }

  return {
    viewId: plan.viewId,
    blendMode,
    appliedOrientation: {
      viewPlaneNormal: plan.spatial.viewPlaneNormal,
      viewUp: plan.spatial.viewUp,
    },
    layers: provenanceLayers,
  };
}
