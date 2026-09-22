/**
 * @nuclear/view-engine — demand projection → `ResourceManager` reconciliation
 * (P4.7).
 *
 * Declares demand and consumes the manager's settlement; it does not
 * reimplement residency policy (no loading, eviction, byte measurement or
 * budget logic — ADR-010 §6). The caller-injected `ResourceRetentionBuilder`
 * attaches the physical plan; this module validates the builder's output
 * **before** calling `manager.reconcile`, so a dishonest builder leaves the
 * manager completely untouched.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import type {
  ResourceRetention,
  ResidencySettlementResult,
} from '@nuclear/medical-engine';
import { structurallyEqual } from '../internal/json-equality.js';
import { ResidencyProjectionError } from './errors.js';
import { projectResourceRetentionRequests } from './project.js';
import type { ReconcileResourceDemandInput, ResourceRetentionRequest } from './types.js';

function malformed(detail: string): ResidencyProjectionError {
  return new ResidencyProjectionError(
    'RESIDENCY_PROJECTION_MALFORMED',
    `Resource-demand reconcile input is malformed: ${detail} Remediation: pass { slots, visibility, manager, buildRetention } with a ResourceManager and a ResourceRetentionBuilder.`,
  );
}

function mismatch(
  request: ResourceRetentionRequest,
  detail: string,
): ResidencyProjectionError {
  return new ResidencyProjectionError(
    'RESIDENCY_PROJECTION_BUILDER_MISMATCH',
    `ResourceRetentionBuilder returned a retention that does not match the projected request for lease '${request.leaseId}' (slot '${request.slotId}'): ${detail} Remediation: the builder must return a ResourceRetention whose leaseId is '${request.leaseId}', whose demand is structurally equal to the projected ResourceDemand (assetId, priority, requiredTiers), and whose 'plan' and 'availability' are non-null objects.`,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Renders a value for diagnostics without leaking a bare `undefined`. */
function describeValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  return value === null ? 'null' : `a ${typeof value}`;
}

/** Fail-closed validation of the manager/builder seam; never leaks a `TypeError`. */
function requireReconcileInput(input: unknown): ReconcileResourceDemandInput {
  if (!isObject(input)) {
    throw malformed(`expected an object, received ${input === null ? 'null' : typeof input}.`);
  }
  const { manager, buildRetention } = input;
  if (!isObject(manager) || typeof manager.reconcile !== 'function') {
    throw malformed("the 'manager' is missing or is not a ResourceManager with a 'reconcile' method.");
  }
  if (typeof buildRetention !== 'function') {
    throw malformed("the 'buildRetention' ResourceRetentionBuilder is missing or is not a function.");
  }
  return input as unknown as ReconcileResourceDemandInput;
}

/** Validates one builder result against its request, fail-closed (opaque shape only). */
function assertBuilderRetention(
  request: ResourceRetentionRequest,
  retention: unknown,
): ResourceRetention {
  if (!isObject(retention)) {
    throw mismatch(request, `the builder returned ${retention === null ? 'null' : typeof retention} instead of a ResourceRetention.`);
  }
  if (retention.leaseId !== request.leaseId) {
    throw mismatch(request, `leaseId '${String(retention.leaseId)}' differs from the projected leaseId.`);
  }
  if (!structurallyEqual(retention.demand, request.demand)) {
    throw mismatch(request, 'the retention demand (assetId/priority/requiredTiers) differs from the projected demand.');
  }
  if (!isObject(retention.plan)) {
    throw mismatch(request, `field 'plan' must be a non-null object but is ${describeValue(retention.plan)}.`);
  }
  if (!isObject(retention.availability)) {
    throw mismatch(request, `field 'availability' must be a non-null object but is ${describeValue(retention.availability)}.`);
  }
  return retention as unknown as ResourceRetention;
}

/**
 * Projects slot demand and reconciles it against the real `ResourceManager`.
 *
 * Every builder result is validated (lease id + structural demand equality +
 * opaque non-null `plan`/`availability` shape, without ever naming the
 * physical plan type) **before** any manager mutation; a violation throws
 * `RESIDENCY_PROJECTION_BUILDER_MISMATCH` and leaves the manager untouched.
 * On success the manager's `ResidencySettlementResult` is returned unchanged.
 */
export function reconcileResourceDemand(
  input: ReconcileResourceDemandInput,
): ResidencySettlementResult {
  const source = requireReconcileInput(input);
  const requests = projectResourceRetentionRequests(source);
  const retentions: ResourceRetention[] = [];
  for (const request of requests) {
    retentions.push(assertBuilderRetention(request, source.buildRetention(request)));
  }
  return source.manager.reconcile(retentions);
}
