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

import type { MedicalViewState, ProjectionMode } from '@nuclear/shared-types';
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

export interface ViewApplicationPlan {
  readonly viewId: string;
  readonly layers: readonly ViewLayerApplication[];
  readonly projection: ViewProjectionApplication;
}

export interface ViewApplicationInput {
  readonly state: MedicalViewState;
  /** assetId -> validated Cornerstone volumeId. */
  readonly volumeIds: ReadonlyMap<string, string>;
  /** ADR-005 binding; required for every PET layer, never inferred. */
  readonly petBinding?: QuantitativePetBinding;
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
