/**
 * @nuclear/medical-engine — `ScientificWorkerBridge` query facade.
 *
 * Extends the lifecycle supervisor with the typed scientific queries, the
 * correlated low-level transport call and the public availability/stderr
 * subscriptions. No computation happens here: results are mapped verbatim.
 */

import type { SourceLocator } from '@nuclear/shared-types';
import { WorkerContractError, WorkerUnavailableError } from './errors.js';
import { mapGeometryResult, mapInspectionResult } from './mapping.js';
import { mapCompatibilityResult } from './mapping-compatibility.js';
import { mapQuantitationResult } from './mapping-quantitation.js';
import {
  DICOM_COMPATIBILITY_METHOD,
  DICOM_GEOMETRY_METHOD,
  DICOM_INSPECT_METHOD,
  DEFAULT_PROTOCOL_VERSION,
  QUANTITATION_SUVBW_METHOD,
  errorMessage,
} from './protocol.js';
import { WorkerSupervisor } from './supervisor.js';
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

  constructor(options: ScientificWorkerBridgeOptions = {}) {
    super(options);
    this.#optionListener = options.onAvailabilityChange;
    this.#stderr = options.onStderr;
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
}
