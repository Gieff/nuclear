/**
 * NuClear P3.4-C.2 — shared browser-probe types for the capture harness.
 *
 * Type-only plus the global probe declarations; no runtime code. Split out of
 * `capture-entry.ts` / `capture-negative.ts` so every fixture file stays within
 * the 300-line gate.
 */

import type { AppliedViewState } from '../../../packages/medical-engine/src/renderer/index.ts';
import type {
  MedicalCaptureDescriptor,
  ViewApplicationPlan,
} from '../../../packages/medical-engine/src/view-application/index.ts';
import type { CornerstoneRendererAdapter } from '../../../packages/medical-engine/src/renderer/index.ts';
import type { probeWebGL2 } from './adapter-host.ts';
import type { VolumeProbeInput } from './volume-fixture.ts';

/** Test-only PET transport-scalar diagnostic read directly from Cornerstone. */
export interface PetTransportDiagnostic {
  domain: string;
  length: number;
  min: number;
  max: number;
  sample: (number | undefined)[];
}

export interface CaptureAck {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  stack?: string;
  actorCount?: number;
  elementSizePx?: number[];
  descriptor?: MedicalCaptureDescriptor;
  petTransport?: PetTransportDiagnostic;
  ctTransport?: PetTransportDiagnostic;
}

export interface CameraSnapshot {
  viewPlaneNormal: number[];
  viewUp: number[];
  position: number[];
  focalPoint: number[];
  parallelScale?: number;
}

export interface CaptureMutationAck {
  code?: string;
  message?: string;
  actorCountBefore: number;
  actorCountAfter: number;
  cameraBefore: CameraSnapshot;
  cameraAfter: CameraSnapshot;
}

/** One capture run: its raster descriptor, the viewport read-back and the plan. */
export interface CaptureRun {
  descriptor: MedicalCaptureDescriptor;
  applied: AppliedViewState;
  plan: ViewApplicationPlan;
}

/** Ack for the serialize → re-apply → capture-again round-trip. */
export interface CaptureRoundTripAck {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  /** Length of the JSON string the state+plan were serialized through. */
  serializedLength?: number;
  first?: CaptureRun;
  second?: CaptureRun;
}

/** Ack for the two-independent-views isolation evidence. */
export interface CaptureIsolationAck {
  ok: boolean;
  name?: string;
  code?: string;
  message?: string;
  a?: CaptureRun;
  b?: CaptureRun;
  actorCounts?: number[];
}

export type CaptureNegativeScenario =
  | 'not-applied'
  | 'non-neutral-camera'
  | 'slice-position'
  | 'for-mismatch'
  | 'invalid-transform'
  | 'different-for-transform'
  | 'evidence-not-cached'
  | 'missing-resident'
  | 'unresolved-palette'
  | 'viewport-size-mismatch'
  | 'zero-size-viewport'
  | 'unsupported-scheme'
  | 'pet-scalar-mismatch'
  | 'pet-domain-mismatch'
  | 'guard-order';

/** Adapter accessors shared by the entry and the negative scenario builder. */
export interface CaptureProbeContext {
  ensureAdapter(): CornerstoneRendererAdapter;
  actorCount(): number;
  elementSize(): number[];
  describeError(error: unknown): CaptureAck;
  snapshotCamera(): CameraSnapshot;
}

export interface CaptureInputs {
  ct: VolumeProbeInput;
  pet: VolumeProbeInput;
}

export interface NuclearCaptureProbe {
  captureCt(input: VolumeProbeInput): Promise<CaptureAck>;
  captureCoregFusion(inputs: {
    ct: VolumeProbeInput;
    pet: VolumeProbeInput;
    suvFactor: number;
  }): Promise<CaptureAck>;
  captureNegative(inputs: CaptureInputs, scenario: CaptureNegativeScenario): Promise<CaptureAck>;
  captureMutation(inputs: CaptureInputs): Promise<CaptureMutationAck>;
  captureRoundTrip(input: VolumeProbeInput): Promise<CaptureRoundTripAck>;
  captureIsolation(inputs: {
    ct: VolumeProbeInput;
    pet: VolumeProbeInput;
    suvFactor: number;
  }): Promise<CaptureIsolationAck>;
  teardown(): CaptureAck;
  teardownAll(): CaptureAck;
}

export interface NuclearRendererProbe {
  webgl2(): ReturnType<typeof probeWebGL2>;
}

declare global {
  var __nuclearCaptureProbe: NuclearCaptureProbe | undefined;
}
