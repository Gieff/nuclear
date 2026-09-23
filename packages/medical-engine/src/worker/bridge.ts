/**
 * @nuclear/medical-engine — `ScientificWorkerBridge` query facade.
 *
 * Extends the lifecycle supervisor with the typed scientific queries, the
 * correlated low-level transport call and the public availability/stderr
 * subscriptions. No computation happens here: results are mapped verbatim.
 */

import type { SourceLocator } from '@nuclear/shared-types';
import {
  WorkerContractError,
  WorkerTimeoutError,
  WorkerUnavailableError,
} from './errors.js';
import { mapGeometryResult, mapInspectionResult } from './mapping.js';
import { mapCompatibilityResult } from './mapping-compatibility.js';
import { mapQuantitationResult } from './mapping-quantitation.js';
import {
  mapRegistrationResult,
  registrationRequestParams,
} from './mapping-registration.js';
import { asRecord } from './narrowing.js';
import {
  DICOM_COMPATIBILITY_METHOD,
  DICOM_GEOMETRY_METHOD,
  DICOM_INSPECT_METHOD,
  DICOM_VOLUME_METHOD,
  DEFAULT_PROTOCOL_VERSION,
  QUANTITATION_SUVBW_METHOD,
  REGISTRATION_METHOD,
  VOLUME_RELEASE_METHOD,
  errorMessage,
} from './protocol.js';
import type {
  WorkerRegistrationRequest,
  WorkerRegistrationResult,
} from './registration-types.js';
import { WorkerSupervisor } from './supervisor.js';
import {
  assertDescriptorTtlMatchesCapability,
  assertVolumeWithinLimits,
  parseVolumeDescriptor,
  volumeRequestParams,
} from './volume-descriptor.js';
import { WorkerVolumeTransportError } from './volume-errors.js';
import {
  decodeVolumeScalarData,
  readVerifiedVolumePayload,
} from './volume-payload.js';
import type {
  WorkerHydratedVolume,
  WorkerVolumeHydrationRequest,
  WorkerVolumeTransportCapability,
} from './volume-types.js';
import type {
  ScientificWorkerBridgeOptions,
  WorkerAvailability,
  WorkerCompatibilityResult,
  WorkerGeometryResult,
  WorkerInspectionResult,
  WorkerPetQuantitationResult,
  WorkerRequestOptions,
  WorkerSeriesSide,
} from './types.js';

type AvailabilityListener = (availability: WorkerAvailability) => void;

export class ScientificWorkerBridge extends WorkerSupervisor {
  readonly #listeners = new Set<AvailabilityListener>();
  readonly #optionListener: AvailabilityListener | undefined;
  readonly #stderr: ((chunk: string) => void) | undefined;
  readonly #volumeClock: () => number;

  constructor(options: ScientificWorkerBridgeOptions = {}) {
    super(options);
    this.#optionListener = options.onAvailabilityChange;
    this.#stderr = options.onStderr;
    this.#volumeClock = options.volumeClock ?? Date.now;
  }

  onAvailabilityChange(listener: AvailabilityListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  protected override onAvailability(next: WorkerAvailability): void {
    const notify = (listener: AvailabilityListener): void => {
      try {
        listener(next);
      } catch (error) {
        this.onStderr(`Availability listener threw: ${errorMessage(error)}\n`);
      }
    };
    if (this.#optionListener !== undefined) notify(this.#optionListener);
    for (const listener of [...this.#listeners]) notify(listener);
  }

  protected override onStderr(chunk: string): void {
    if (this.#stderr === undefined) return;
    try {
      this.#stderr(chunk);
    } catch {
      // A diagnostics consumer must never corrupt supervisor state.
    }
  }

  /** Low-level correlated transport call used by the typed queries and tests. */
  async request<TResult>(
    method: string,
    params: Readonly<Record<string, unknown>>,
    options: WorkerRequestOptions = {},
  ): Promise<TResult> {
    const transport = this.transport;
    if (this.availability !== 'ready' || transport === null) {
      throw new WorkerUnavailableError(
        `Bridge is not ready (availability='${this.availability}'); ` +
          `'${method}' was not queued.`,
      );
    }
    const envelope = await transport.request(
      method,
      params,
      options.timeoutMs ?? this.requestTimeoutMs,
    );
    if (envelope.protocolVersion !== DEFAULT_PROTOCOL_VERSION) {
      throw new WorkerContractError(
        `Response to '${method}' declared protocolVersion ` +
          `'${envelope.protocolVersion}', expected '${DEFAULT_PROTOCOL_VERSION}'.`,
      );
    }
    return envelope.result as TResult;
  }

  async inspect(locator: SourceLocator): Promise<WorkerInspectionResult> {
    return mapInspectionResult(await this.request<unknown>(DICOM_INSPECT_METHOD, { locator }));
  }

  async geometry(
    locator: SourceLocator,
    seriesInstanceUID: string,
  ): Promise<WorkerGeometryResult> {
    return mapGeometryResult(
      await this.request<unknown>(DICOM_GEOMETRY_METHOD, { locator, seriesInstanceUID }),
    );
  }

  async compatibility(
    left: WorkerSeriesSide,
    right: WorkerSeriesSide,
  ): Promise<WorkerCompatibilityResult> {
    return mapCompatibilityResult(
      await this.request<unknown>(DICOM_COMPATIBILITY_METHOD, {
        left: { locator: left.locator, seriesInstanceUID: left.seriesInstanceUID },
        right: { locator: right.locator, seriesInstanceUID: right.seriesInstanceUID },
      }),
    );
  }

  async quantitation(
    locator: SourceLocator,
    seriesInstanceUID: string,
  ): Promise<WorkerPetQuantitationResult> {
    return mapQuantitationResult(
      await this.request<unknown>(QUANTITATION_SUVBW_METHOD, { locator, seriesInstanceUID }),
    );
  }

  async registration(
    request: WorkerRegistrationRequest,
  ): Promise<WorkerRegistrationResult> {
    return mapRegistrationResult(
      await this.request<unknown>(REGISTRATION_METHOD, registrationRequestParams(request)),
    );
  }

  /**
   * Hydrate one ADR-013 volume: issue `nuclear.dicom.volume`, validate the
   * descriptor strictly against the caller's fingerprint/geometry context,
   * require its declared TTL to equal the advertised `handleTtlSeconds`, resolve
   * the worker-generated file under the advertised root, verify its exact
   * length/hash with a publication-anchored TTL check on both sides of the read,
   * decode the little-endian scalar array, and release the handle in `finally`
   * whenever a descriptor was received. Any cleanup failure propagates as a
   * typed refusal and is never reported as success.
   *
   * ADR-013 §7: a `nuclear.dicom.volume` timeout that expires before the
   * descriptor (and therefore the handle) is known has no safe protocol-level
   * cancel. The bridge terminates the hung worker and starts a fresh one, so the
   * worker's startup orphan sweep removes the untracked temp file
   * deterministically. On this path no handle was ever received, so no
   * `nuclear.volume.release` is issued.
   */
  async hydrateVolume(request: WorkerVolumeHydrationRequest): Promise<WorkerHydratedVolume> {
    let raw: unknown;
    try {
      raw = await this.request<unknown>(DICOM_VOLUME_METHOD, volumeRequestParams(request));
    } catch (error) {
      if (error instanceof WorkerTimeoutError && error.method === DICOM_VOLUME_METHOD) {
        await this.#restartAfterVolumeTimeout(error);
      }
      throw error;
    }
    const result = asRecord(raw, 'volume result');
    const rawDescriptor = asRecord(result.descriptor, 'volume result.descriptor');
    const candidate =
      typeof rawDescriptor.handle === 'string' && rawDescriptor.handle.length > 0
        ? rawDescriptor.handle
        : null;
    try {
      const descriptor = parseVolumeDescriptor(rawDescriptor, request);
      const capability = this.#volumeCapability();
      assertDescriptorTtlMatchesCapability(descriptor, capability);
      // ADR-013 §6: refuse an over-budget descriptor before any payload file is
      // opened or any buffer is sized (the byte cap is the stricter of the
      // advertised `maxPayloadBytes` and the absolute 1 GiB profile).
      assertVolumeWithinLimits(descriptor, capability);
      const bytes = readVerifiedVolumePayload(
        capability.root,
        descriptor,
        this.#volumeClock,
      );
      return { descriptor, scalarData: decodeVolumeScalarData(bytes, descriptor) };
    } finally {
      if (candidate !== null) await this.releaseVolume(candidate);
    }
  }

  /** Idempotent `nuclear.volume.release`; a cleanup failure propagates typed. */
  async releaseVolume(handle: string): Promise<void> {
    await this.request<unknown>(VOLUME_RELEASE_METHOD, { handle });
  }

  /**
   * ADR-013 §7 timeout-resolved lifecycle: `stop()` then `start()` so the
   * replacement worker's startup orphan sweep runs. The caller-visible failure
   * when the restart succeeds stays the original `WorkerTimeoutError`; a failed
   * restart surfaces as a typed `WorkerUnavailableError`, never as success.
   */
  async #restartAfterVolumeTimeout(timeout: WorkerTimeoutError): Promise<void> {
    await this.stop();
    try {
      await this.start();
    } catch (error) {
      throw new WorkerUnavailableError(
        `Restart after '${timeout.method}' timeout failed: ${errorMessage(error)}`,
      );
    }
  }

  #volumeCapability(): WorkerVolumeTransportCapability {
    const capability = this.currentHandshake?.volumeTransport;
    if (capability === undefined) {
      throw new WorkerVolumeTransportError(
        'capability-unavailable',
        "The worker did not advertise 'capabilities.volumeTransport'; real-source " +
          'volume hydration is unavailable for this worker.',
      );
    }
    return capability;
  }
}
