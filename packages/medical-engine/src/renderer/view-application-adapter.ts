/**
 * @nuclear/medical-engine — browser-only application of a compiled
 * `ViewApplicationPlan` to a real Cornerstone volume viewport (P3.4-B.2.2.2).
 *
 * This is the only module allowed to mutate a viewport for state application.
 * It is exported solely from `renderer/index.ts` (never `src/index.ts`) because
 * it imports `@cornerstonejs/core`.
 *
 * Every refusal runs fail-closed before `setVolumes`/`setProperties`: the
 * `nuclear-volume` scheme allowlist is checked first, then DICOM palettes
 * (ADR-007, `dicom-palette-registration.ts`) are registered, and
 * geometry/Frame-of-Reference
 * (`validateLayerGeometry`), viewport size (`validateViewportSize`), colormap
 * resolvability, and slice positioning are checked. A non-neutral slice
 * reference is refused with a typed error rather than silently ignored or
 * guessed. Nothing is inferred and no error is swallowed.
 */

import { Enums, cache, registerImageLoader, utilities } from '@cornerstonejs/core';
import type { VolumeViewport } from '@cornerstonejs/core';

import {
  VIEW_APPLICATION_ERROR_CODES,
  ViewApplicationError,
  toCornerstoneInterpolationType,
  validateLayerGeometry,
  validateViewportSize,
} from '../view-application/index.js';
import type {
  ViewApplicationPlan,
  ViewGeometryEvidence,
  ViewLayerApplication,
} from '../view-application/index.js';
import type { CornerstoneRendererAdapter } from './adapter.js';
import { registerDicomPalettes } from './dicom-palette-registration.js';

/** Input for one browser-side application of a compiled plan. */
export interface ApplyViewApplicationInput {
  readonly plan: ViewApplicationPlan;
  /** assetId -> resident volume geometry / persisted transforms. */
  readonly evidence: ViewGeometryEvidence;
  readonly actualViewportSizePx: readonly [number, number];
  /** Optional explicit slice request; only the neutral reference is accepted. */
  readonly slicePosition?: {
    readonly referenceLocation: readonly [number, number, number];
    readonly sliceOffsetMm: number;
  };
}

/** Serializable read-back of one applied layer's actual Cornerstone properties. */
export interface AppliedLayerState {
  readonly assetId: string;
  readonly volumeId: string;
  readonly properties: {
    readonly voiRange: { readonly lower: number; readonly upper: number };
    readonly colormap: {
      readonly name: string;
      readonly opacity: number;
      readonly opacityMapping:
        | readonly { readonly value: number; readonly opacity: number }[]
        | undefined;
    };
    readonly invert: boolean;
    readonly interpolationType: number;
  };
}

/** Serializable evidence of what was actually applied to the viewport. */
export interface AppliedViewState {
  readonly viewId: string;
  readonly volumeIds: readonly string[];
  readonly blendMode: string;
  readonly slabThicknessMm: number | undefined;
  readonly requestedOrientation: {
    readonly viewPlaneNormal: readonly [number, number, number];
    readonly viewUp: readonly [number, number, number];
  };
  readonly camera: {
    readonly viewPlaneNormal: readonly number[];
    readonly viewUp: readonly number[];
  };
  readonly layers: readonly AppliedLayerState[];
}

/** True only for the neutral reference location and zero slice offset. */
function isNeutralSlice(referenceLocation: readonly number[], sliceOffsetMm: number): boolean {
  return (
    referenceLocation[0] === 0 &&
    referenceLocation[1] === 0 &&
    referenceLocation[2] === 0 &&
    sliceOffsetMm === 0
  );
}

/** Throws a typed read-back refusal; keeps every missing field fail-closed. */
function readbackMissing(subject: string, label: string): never {
  throw new ViewApplicationError(
    VIEW_APPLICATION_ERROR_CODES.viewportReadbackFailed,
    `viewport read-back for '${subject}' is missing ${label} after apply`,
  );
}

/** Verifies every declared colormap resolves in Cornerstone before any mutation. */
function assertColormapsResolvable(plan: ViewApplicationPlan): void {
  for (const layer of plan.layers) {
    const name = layer.properties.colormap.name;
    if (utilities.colormap.resolveColormap(name) === undefined) {
      throw new ViewApplicationError(
        VIEW_APPLICATION_ERROR_CODES.colormapUnknown,
        `colormap '${name}' for asset '${layer.assetId}' is not resolvable by Cornerstone after DICOM palette registration; refusing before any volume is set`,
      );
    }
  }
}

/** Refuses any faithful-but-unimplemented slice positioning request. */
function assertSlicePositionSupported(input: ApplyViewApplicationInput): void {
  const { plan, slicePosition } = input;
  if (!isNeutralSlice(plan.spatial.referenceLocation, plan.spatial.sliceOffsetMm)) {
    throw new ViewApplicationError(
      VIEW_APPLICATION_ERROR_CODES.slicePositionUnsupported,
      `view '${plan.viewId}' carries slice referenceLocation [${plan.spatial.referenceLocation.join(', ')}] at offset ${plan.spatial.sliceOffsetMm} mm: faithful slice positioning is not implemented, refusing rather than guessing`,
    );
  }
  if (
    slicePosition !== undefined &&
    !isNeutralSlice(slicePosition.referenceLocation, slicePosition.sliceOffsetMm)
  ) {
    throw new ViewApplicationError(
      VIEW_APPLICATION_ERROR_CODES.slicePositionUnsupported,
      `view '${plan.viewId}' requests an explicit slice position: faithful slice positioning is not implemented, refusing rather than guessing`,
    );
  }
}

/** Reads the actual applied properties of one layer back out of the viewport. */
function readBackLayer(viewport: VolumeViewport, layer: ViewLayerApplication): AppliedLayerState {
  const volumeId = layer.volumeId;
  const properties = viewport.getProperties(volumeId);
  if (properties === undefined || properties === null) {
    throw new ViewApplicationError(
      VIEW_APPLICATION_ERROR_CODES.viewportReadbackFailed,
      `viewport returned no properties for volume '${volumeId}' after apply`,
    );
  }
  const colormap = properties.colormap;
  const voiRange = properties.voiRange ?? readbackMissing(volumeId, 'voiRange');
  return {
    assetId: layer.assetId,
    volumeId,
    properties: {
      voiRange: { lower: voiRange.lower, upper: voiRange.upper },
      colormap: {
        name: colormap?.name ?? readbackMissing(volumeId, 'colormap.name'),
        opacity:
          typeof colormap?.opacity === 'number'
            ? colormap.opacity
            : readbackMissing(volumeId, 'colormap.opacity'),
        opacityMapping: colormap?.opacityMapping,
      },
      invert:
        typeof properties.invert === 'boolean'
          ? properties.invert
          : readbackMissing(volumeId, 'invert'),
      interpolationType:
        typeof properties.interpolationType === 'number'
          ? properties.interpolationType
          : readbackMissing(volumeId, 'interpolationType'),
    },
  };
}

/**
 * The only volume-id scheme NuClear's local-volume bridge can serve.
 * `createLocalVolume` materializes every slice into Cornerstone's image cache
 * as `<volumeId>_slice_<i>` under this scheme.
 */
const LOCAL_VOLUME_SCHEME = 'nuclear-volume';

/** Refuses non-local volume ids before any viewport mutation or loader registration. */
function assertLocalVolumeScheme(plan: ViewApplicationPlan): void {
  for (const layer of plan.layers) {
    if (!layer.volumeId.startsWith(`${LOCAL_VOLUME_SCHEME}:`)) {
      throw new ViewApplicationError(
        VIEW_APPLICATION_ERROR_CODES.volumeSchemeUnsupported,
        `volume '${layer.volumeId}' for asset '${layer.assetId}' is not a '${LOCAL_VOLUME_SCHEME}:' local volume; registering an image loader for any other scheme is not allowed`,
      );
    }
  }
}

/**
 * Serves NuClear's local-volume slice images to Cornerstone.
 *
 * The default-VOI path in `createVolumeActor` calls
 * `loadAndCacheImage(..., { ignoreCache: true })`, which bypasses Cornerstone's
 * image cache and demands a registered image loader. This loader returns the
 * already-cached slice for the allowlisted `nuclear-volume` scheme; it invents
 * nothing and never fabricates pixel data (a missing cached slice fails
 * loudly). It is registered once per scheme so repeated applies do not churn
 * Cornerstone's loader registry.
 */
const bridgeSchemesRegistered = new Set<string>();

function ensureLocalVolumeImageLoader(): void {
  if (bridgeSchemesRegistered.has(LOCAL_VOLUME_SCHEME)) {
    return;
  }
  registerImageLoader(LOCAL_VOLUME_SCHEME, (imageId: string) => {
    const image = cache.getImage(imageId);
    if (image === undefined) {
      throw new Error(
        `no cached local slice '${imageId}'; the volume was not materialized before rendering`,
      );
    }
    return { promise: Promise.resolve(image) };
  });
  bridgeSchemesRegistered.add(LOCAL_VOLUME_SCHEME);
}

/**
 * Applies a compiled plan to the adapter's volume viewport and returns the
 * serializable read-back. Fail-closed: the local-volume scheme, geometry,
 * viewport size, colormap resolvability and slice neutrality are all checked
 * before any mutation.
 */
export async function applyViewApplication(
  adapter: CornerstoneRendererAdapter,
  input: ApplyViewApplicationInput,
): Promise<AppliedViewState> {
  const { plan, evidence, actualViewportSizePx } = input;

  assertLocalVolumeScheme(plan);
  registerDicomPalettes();
  validateLayerGeometry(plan, evidence);
  validateViewportSize(plan.transforms, actualViewportSizePx);
  assertColormapsResolvable(plan);
  assertSlicePositionSupported(input);

  const viewport = adapter.getViewport() as VolumeViewport;
  const volumeIds = plan.layers.map((layer) => layer.volumeId);

  ensureLocalVolumeImageLoader();
  await viewport.setVolumes(volumeIds.map((volumeId) => ({ volumeId })));

  for (const layer of plan.layers) {
    const { properties } = layer;
    viewport.setProperties(
      {
        voiRange: { lower: properties.voiRange.lower, upper: properties.voiRange.upper },
        colormap: {
          name: properties.colormap.name,
          opacity: properties.colormap.opacity,
          ...(properties.colormap.opacityMapping === undefined
            ? {}
            : { opacityMapping: [...properties.colormap.opacityMapping] }),
        },
        invert: properties.invert,
        interpolationType: toCornerstoneInterpolationType(properties.interpolationType),
      },
      layer.volumeId,
    );
  }

  viewport.setBlendMode(Enums.BlendModes[plan.projection.blendMode]);
  if (plan.projection.slabThicknessMm !== undefined) {
    viewport.setSlabThickness(plan.projection.slabThicknessMm);
  }

  const viewPlaneNormal = [...plan.spatial.viewPlaneNormal] as [number, number, number];
  const viewUp = [...plan.spatial.viewUp] as [number, number, number];
  viewport.setOrientation({ viewPlaneNormal, viewUp });

  const camera = viewport.getCamera();
  return {
    viewId: plan.viewId,
    volumeIds,
    blendMode: Enums.BlendModes[viewport.getBlendMode()],
    slabThicknessMm:
      plan.projection.slabThicknessMm === undefined
        ? undefined
        : viewport.getSlabThickness(),
    requestedOrientation: { viewPlaneNormal, viewUp },
    camera: {
      viewPlaneNormal: [...(camera.viewPlaneNormal ?? readbackMissing(plan.viewId, 'camera.viewPlaneNormal'))],
      viewUp: [...(camera.viewUp ?? readbackMissing(plan.viewId, 'camera.viewUp'))],
    },
    layers: plan.layers.map((layer) => readBackLayer(viewport, layer)),
  };
}
