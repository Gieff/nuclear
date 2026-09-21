/**
 * @nuclear/medical-engine — serializable view-application plan types
 * (P3.4-B.2.1).
 *
 * Object field names match Cornerstone `ViewportProperties` (`voiRange`,
 * `colormap`, `invert`), so P3.4-B.2.2 can hand those to `setProperties`
 * unchanged. `interpolationType` stays the portable string `'nearest'|'linear'`
 * and is mapped to Cornerstone's numeric `InterpolationType` by
 * `toCornerstoneInterpolationType`. This module imports no Cornerstone.
 */

import type {
  AssetId,
  MedicalViewState,
  ProjectionMode,
} from '@nuclear/shared-types';
import type { QuantitativePetBinding } from '../radiometry/index.js';

export interface ViewColormapApplication {
  readonly name: string;
  readonly opacity: number;
  readonly opacityMapping?: readonly {
    readonly value: number;
    readonly opacity: number;
  }[];
}

export interface ViewLayerApplication {
  readonly assetId: string;
  readonly volumeId: string;
  readonly role: 'base' | 'overlay';
  readonly properties: {
    readonly voiRange: { readonly lower: number; readonly upper: number };
    readonly colormap: ViewColormapApplication;
    readonly invert: boolean;
    readonly interpolationType: 'nearest' | 'linear';
  };
}

export type ViewProjectionBlendMode =
  | 'COMPOSITE'
  | 'MAXIMUM_INTENSITY_BLEND'
  | 'MINIMUM_INTENSITY_BLEND'
  | 'AVERAGE_INTENSITY_BLEND';

export interface ViewProjectionApplication {
  readonly mode: ProjectionMode;
  readonly blendMode: ViewProjectionBlendMode;
  readonly slabThicknessMm: number | undefined;
}

/**
 * Spatial state carried verbatim from `MedicalViewState.spatial`. The vectors
 * are copied by reference, never normalized and never combined: vector legality
 * is the contract validator's boundary (ADR-006), and P3.4-B.2.2 decides how to
 * position the slice. `sliceOffsetMm` is carried, not mapped.
 */
export interface ViewSpatialApplication {
  readonly viewPlaneNormal: readonly [number, number, number];
  readonly viewUp: readonly [number, number, number];
  readonly referenceLocation: readonly [number, number, number];
  readonly sliceOffsetMm: number;
}

/**
 * Coordinate transforms carried verbatim from
 * `MedicalViewState.coordinateTransforms`. The compiler never re-derives or
 * composes them; P3.4-B.2.2 validates them against the real viewport.
 */
export interface ViewTransformsApplication {
  /** Patient LPS mm → view-plane homogeneous coordinates (16 values). */
  readonly patientToViewPlane: readonly number[];
  /** View-plane mm → viewport render-pixel coordinates (16 values). */
  readonly viewPlaneToViewport: readonly number[];
  readonly viewportSizePx: readonly [number, number];
}

export interface ViewApplicationPlan {
  readonly viewId: string;
  readonly layers: readonly ViewLayerApplication[];
  readonly projection: ViewProjectionApplication;
  readonly spatial: ViewSpatialApplication;
  readonly transforms: ViewTransformsApplication;
}

export interface ViewApplicationInput {
  readonly state: MedicalViewState;
  /** assetId -> validated Cornerstone volumeId. */
  readonly volumeIds: ReadonlyMap<string, string>;
  /**
   * ADR-005 binding per PET asset; every PET layer must find its own entry
   * keyed by its `assetId`. Required: a missing map is a caller error, and a
   * layer with no entry is refused rather than falling back to another asset.
   */
  readonly petBindings: ReadonlyMap<AssetId, QuantitativePetBinding>;
}

/**
 * Cornerstone `InterpolationType` numeric values
 * (`@cornerstonejs/core` `enums/InterpolationType`: NEAREST = 0, LINEAR = 1,
 * FAST_LINEAR = 2). The plan keeps the portable string so it stays serializable
 * and renderer-agnostic; P3.4-B.2.2 maps it here before `setProperties`.
 */
export const CORNERSTONE_INTERPOLATION_TYPES = { nearest: 0, linear: 1 } as const;

export type CornerstoneInterpolationType =
  (typeof CORNERSTONE_INTERPOLATION_TYPES)[keyof typeof CORNERSTONE_INTERPOLATION_TYPES];

/** Maps a plan `interpolationType` to Cornerstone's numeric `InterpolationType` value. */
export function toCornerstoneInterpolationType(
  value: 'nearest' | 'linear',
): CornerstoneInterpolationType {
  return CORNERSTONE_INTERPOLATION_TYPES[value];
}
