/**
 * @nuclear/medical-engine — pairwise geometry compatibility mapper.
 *
 * The worker result is pairwise and carries no per-asset `assetId` or
 * `SourceFingerprint`, so `GeometryVerificationSnapshot` is not an appropriate
 * target. This bridge-local contract preserves the worker evidence verbatim.
 */

import { WorkerContractError } from './errors.js';
import { asBoolean, asNumber, asRecord, asString, bounds, stringArray, triple } from './narrowing.js';
import { mapDiagnostics, mapWorkerMetadata } from './protocol.js';
import type { WorkerCompatibilityResult } from './types.js';

/** Map `nuclear.dicom.compatibility` onto bridge-local evidence. */
export function mapCompatibilityResult(value: unknown): WorkerCompatibilityResult {
  const record = asRecord(value, 'compatibility result');
  const status = asString(record.status, 'compatibility.status');
  const diagnostics = mapDiagnostics(record.diagnostics, 'compatibility.diagnostics');
  const workerMetadata = mapWorkerMetadata(record.workerMetadata);

  if (status === 'computed') {
    const frame = asRecord(record.frameOfReference, 'compatibility.frameOfReference');
    const orientation = asRecord(record.orientation, 'compatibility.orientation');
    const spacing = asRecord(record.spacingMm, 'compatibility.spacingMm');
    const origin = asRecord(record.originLpsMm, 'compatibility.originLpsMm');
    const extent = asRecord(record.extentOverlap, 'compatibility.extentOverlap');
    return {
      status: 'computed',
      compatible: asBoolean(record.compatible, 'compatibility.compatible'),
      frameOfReference: {
        left: asString(frame.left, 'frameOfReference.left'),
        right: asString(frame.right, 'frameOfReference.right'),
        equal: asBoolean(frame.equal, 'frameOfReference.equal'),
      },
      orientation: {
        maxAngularDeltaDeg: asNumber(
          orientation.maxAngularDeltaDeg,
          'orientation.maxAngularDeltaDeg',
        ),
        coplanar: asBoolean(orientation.coplanar, 'orientation.coplanar'),
      },
      spacingMm: {
        left: triple(spacing.left, 'spacingMm.left'),
        right: triple(spacing.right, 'spacingMm.right'),
      },
      originLpsMm: {
        left: triple(origin.left, 'originLpsMm.left'),
        right: triple(origin.right, 'originLpsMm.right'),
      },
      extentOverlap: {
        overlaps: asBoolean(extent.overlaps, 'extentOverlap.overlaps'),
        leftBounds: bounds(extent.leftBounds, 'extentOverlap.leftBounds'),
        rightBounds: bounds(extent.rightBounds, 'extentOverlap.rightBounds'),
      },
      incompatibilities: stringArray(
        record.incompatibilities,
        'compatibility.incompatibilities',
      ),
      diagnostics,
      workerMetadata,
    };
  }
  if (status === 'rejected' || status === 'unavailable') {
    const side = asString(record.side, 'compatibility.side');
    if (side !== 'left' && side !== 'right') {
      throw new WorkerContractError(`Unsupported compatibility side '${side}'.`);
    }
    return {
      status,
      side,
      reason: asString(record.reason, 'compatibility.reason'),
      diagnostics,
      workerMetadata,
    };
  }
  throw new WorkerContractError(`Unsupported compatibility status '${status}'.`);
}
