/**
 * NuClear P3.4-C.2 — browser-side fail-closed capture negative builders.
 *
 * Each scenario constructs the exact invalid input P3.4-C.2 must refuse, then
 * calls the real `captureMedicalRaster`. Everything is plain and serializable
 * because custom `Error` fields do not survive `page.evaluate`. Test-only;
 * never product UI.
 */

import {
  applyViewApplication,
  captureMedicalRaster,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import type {
  CaptureMedicalRasterInput,
  VolumeIngestionPlan,
} from '../../../packages/medical-engine/src/renderer/index.ts';
import type {
  ViewApplicationPlan,
  ViewCaptureLayerEvidence,
} from '../../../packages/medical-engine/src/view-application/index.ts';
import type {
  CaptureAck,
  CaptureInputs,
  CaptureNegativeScenario,
  CaptureProbeContext,
} from './capture-probe-types.ts';
import {
  COREG_PET_ASSET_ID,
  CT_ASSET_ID,
  CT_COLORMAP_ID,
  NEUTRAL_CAMERA,
  PET_ASSET_ID,
  buildCtState,
  compileCt,
  ctEvidence,
  planFromInput,
} from './application-fixture.ts';
import {
  buildFusionState,
  compileCoregFusion,
  compileFusion,
  coregFusionEvidence,
  fusionEvidence,
  nonLocalFusionPlan,
  petBindingFromSuvFactor,
  petToCtTransform,
} from './application-fusion-fixture.ts';
import { decodeBase64, readTypedArray } from './volume-fixture.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';

/** Decodes the committed PET payload to its transport scalar values. */
function petScalars(input: VolumeProbeInput): ArrayLike<number> {
  return readTypedArray(decodeBase64(input.pixels.values), input.pixels.dtype);
}

/** Single-CT capture input (valid plan, neutral state). */
function ctInput(ct: VolumeIngestionPlan): CaptureMedicalRasterInput {
  return {
    state: buildCtState(ct),
    plan: compileCt(ct),
    evidence: ctEvidence(ct),
    layers: [{ assetId: CT_ASSET_ID, scalarDataDomain: ct.scalarDataDomain }],
  };
}

/** The two fusion provenance layers for the different-Frame-of-Reference PET fixture. */
function fusionLayers(pet: VolumeIngestionPlan, input: VolumeProbeInput): ViewCaptureLayerEvidence[] {
  return [
    { assetId: CT_ASSET_ID, scalarDataDomain: 'rescaled-hu' },
    { assetId: PET_ASSET_ID, scalarDataDomain: pet.scalarDataDomain, scalarData: petScalars(input) },
  ];
}

/** Co-referenced CT+PET capture input with a caller-supplied PET domain/scalars. */
function coregInput(
  pet: VolumeIngestionPlan,
  ct: VolumeIngestionPlan,
  scalars: ArrayLike<number>,
  petDomain: string,
): CaptureMedicalRasterInput {
  const suvFactor = 1;
  return {
    state: buildFusionState(pet, ct, {
      petAssetId: COREG_PET_ASSET_ID,
      petBinding: petBindingFromSuvFactor(suvFactor),
    }),
    plan: compileCoregFusion(pet, ct, suvFactor),
    evidence: coregFusionEvidence(ct, pet),
    layers: [
      { assetId: CT_ASSET_ID, scalarDataDomain: ct.scalarDataDomain },
      { assetId: COREG_PET_ASSET_ID, scalarDataDomain: petDomain, scalarData: scalars },
    ],
  };
}

async function tryCapture(
  context: CaptureProbeContext,
  input: CaptureMedicalRasterInput,
): Promise<CaptureAck> {
  try {
    const descriptor = await captureMedicalRaster(context.ensureAdapter(), input);
    return {
      ok: true,
      descriptor,
      actorCount: context.actorCount(),
      elementSizePx: context.elementSize(),
    };
  } catch (error) {
    const ack = context.describeError(error);
    ack.actorCount = context.actorCount();
    return ack;
  }
}

/** Runs one fail-closed capture scenario against the real renderer. */
export async function runCaptureNegative(
  context: CaptureProbeContext,
  inputs: CaptureInputs,
  scenario: CaptureNegativeScenario,
): Promise<CaptureAck> {
  try {
    const renderer = context.ensureAdapter();
    const ct = planFromInput(inputs.ct);
    const pet = planFromInput(inputs.pet);

    if (scenario === 'evidence-not-cached') {
      // Evidence claims the CT volume is resident, but it is deliberately never
      // materialized in Cornerstone's cache: only the real cache check refuses.
      return tryCapture(context, ctInput(ct));
    }

    if (scenario === 'unsupported-scheme' || scenario === 'guard-order') {
      // The non-local scheme guard runs before any cache lookup, so no volume
      // needs to be materialized; `guard-order` also carries a non-neutral slice
      // to prove the scheme refusal wins.
      const plan: ViewApplicationPlan =
        scenario === 'guard-order'
          ? {
              ...nonLocalFusionPlan(pet, ct),
              spatial: { ...nonLocalFusionPlan(pet, ct).spatial, sliceOffsetMm: 5 },
            }
          : nonLocalFusionPlan(pet, ct);
      return tryCapture(context, {
        state: buildFusionState(pet, ct),
        plan,
        evidence: fusionEvidence(pet, ct),
        layers: fusionLayers(pet, inputs.pet),
      });
    }

    if (scenario === 'zero-size-viewport') {
      // Materialize a volume, then collapse the live viewport element to zero
      // pixels so the mounted-size readback must refuse.
      renderer.loadVolume(ct);
      const viewport = renderer.getViewport() as unknown as { element: HTMLDivElement };
      viewport.element.style.width = '0px';
      viewport.element.style.height = '0px';
      return tryCapture(context, ctInput(ct));
    }

    renderer.loadVolume(ct);
    renderer.loadVolume(pet);

    if (scenario === 'missing-resident') {
      return tryCapture(context, { ...ctInput(ct), evidence: { volumes: new Map() } });
    }
    if (scenario === 'not-applied') {
      // Volumes loaded, guards pass, but the compiled state was never applied.
      return tryCapture(context, ctInput(ct));
    }
    if (scenario === 'non-neutral-camera') {
      const valid = ctInput(ct);
      await applyViewApplication(renderer, { plan: valid.plan, evidence: valid.evidence });
      return tryCapture(context, {
        ...valid,
        state: { ...valid.state, camera: { ...NEUTRAL_CAMERA, zoom: 2 } },
      });
    }
    if (scenario === 'unresolved-palette') {
      return tryCapture(context, { ...ctInput(ct), plan: compileCt(ct, 'not-a-palette') });
    }
    if (scenario === 'viewport-size-mismatch') {
      return tryCapture(context, {
        ...ctInput(ct),
        plan: compileCt(ct, CT_COLORMAP_ID, undefined, [500, 500]),
      });
    }
    if (scenario === 'slice-position') {
      const plan = compileCt(ct);
      return tryCapture(context, {
        ...ctInput(ct),
        plan: { ...plan, spatial: { ...plan.spatial, sliceOffsetMm: 5 } },
      });
    }

    if (scenario === 'for-mismatch') {
      return tryCapture(context, {
        state: buildFusionState(pet, ct),
        plan: compileFusion(pet, ct),
        evidence: fusionEvidence(pet, ct, { includeTransform: false }),
        layers: fusionLayers(pet, inputs.pet),
      });
    }
    if (scenario === 'invalid-transform') {
      const transforms = new Map([
        [
          PET_ASSET_ID,
          {
            ...petToCtTransform(pet, ct),
            validity: { isValid: false, errorMarginMm: 99, outOfDomainBehavior: 'warn' },
          },
        ],
      ]);
      return tryCapture(context, {
        state: buildFusionState(pet, ct),
        plan: compileFusion(pet, ct),
        evidence: { volumes: fusionEvidence(pet, ct).volumes, spatialTransforms: transforms },
        layers: fusionLayers(pet, inputs.pet),
      });
    }
    if (scenario === 'different-for-transform') {
      return tryCapture(context, {
        state: buildFusionState(pet, ct),
        plan: compileFusion(pet, ct),
        evidence: fusionEvidence(pet, ct),
        layers: fusionLayers(pet, inputs.pet),
      });
    }

    if (scenario === 'pet-scalar-mismatch' || scenario === 'pet-domain-mismatch') {
      const committed = readTypedArray(decodeBase64(inputs.pet.pixels.values), inputs.pet.pixels.dtype);
      const scalars = scenario === 'pet-scalar-mismatch' ? Float32Array.from(committed) : committed;
      if (scenario === 'pet-scalar-mismatch') {
        scalars[0] = scalars[0] + 1;
      }
      const input = coregInput(
        pet,
        ct,
        scalars,
        scenario === 'pet-domain-mismatch' ? 'rescaled-hu' : pet.scalarDataDomain,
      );
      await applyViewApplication(renderer, { plan: input.plan, evidence: input.evidence });
      return tryCapture(context, input);
    }

    return {
      ok: false,
      code: 'UNKNOWN_SCENARIO',
      message: `unknown scenario '${String(scenario)}'`,
    };
  } catch (error) {
    const ack = context.describeError(error);
    ack.actorCount = context.actorCount();
    return ack;
  }
}
