/**
 * NuClear 2B.3b — bridge-side SOP Instance UID digest validation (ADR-013 §5).
 *
 * Pure, Node-only tests for the worker-observed `correlation.sopInstanceUIDsHash`
 * contract: the bridge requires the exact `sha256:<64 lowercase hex>` shape,
 * compares it only when the expected fingerprint supplies one, and never
 * computes, normalizes or infers the digest itself. No worker, no filesystem and
 * no `view-engine` import are involved.
 */

import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const { WorkerContractError, parseVolumeDescriptor } = await import(
  '../../packages/medical-engine/src/index.js'
);
const { DESCRIPTOR_SOP_HASH, contextFixture, descriptorFixture } = await import(
  './fixtures/volume-bridge-fixtures.ts'
);

const context = contextFixture;
const descriptor = descriptorFixture;

/** Replace one observed correlation field, keeping the rest coherent. */
function withCorrelation(overrides: Record<string, unknown>): Record<string, unknown> {
  const correlation = descriptor().correlation as Record<string, unknown>;
  return descriptor({ correlation: { ...correlation, ...overrides } });
}

/** Build a context whose expected fingerprint carries (or omits) the SOP hash. */
function contextWithExpectedSop(sopInstanceUIDsHash?: string): Record<string, unknown> {
  const expected = { ...(context().expectedFingerprint as Record<string, unknown>) };
  if (sopInstanceUIDsHash === undefined) {
    delete expected.sopInstanceUIDsHash;
  } else {
    expected.sopInstanceUIDsHash = sopInstanceUIDsHash;
  }
  return context({ expectedFingerprint: expected });
}

describe('NuClear 2B.3b — worker-observed SOP Instance UID digest', () => {
  it('accepts the observed digest against a present, equal expectation', () => {
    const parsed = parseVolumeDescriptor(descriptor(), context() as never);
    assert.equal(parsed.correlation.sopInstanceUIDsHash, DESCRIPTOR_SOP_HASH);
  });

  it('refuses a missing observed sopInstanceUIDsHash instead of defaulting it', () => {
    const correlation = descriptor().correlation as Record<string, unknown>;
    const withoutSop = { ...correlation };
    delete withoutSop.sopInstanceUIDsHash;
    assert.throws(
      () => parseVolumeDescriptor(descriptor({ correlation: withoutSop }), context() as never),
      WorkerContractError,
    );
  });

  it('refuses a malformed observed sopInstanceUIDsHash', () => {
    for (const value of [
      `sha256:${'A'.repeat(64)}`,
      `sha256:${'c'.repeat(63)}`,
      `sha256:${'c'.repeat(65)}`,
      `md5:${'c'.repeat(64)}`,
      '',
      42,
      null,
      undefined,
    ]) {
      assert.throws(
        () =>
          parseVolumeDescriptor(withCorrelation({ sopInstanceUIDsHash: value }), context() as never),
        WorkerContractError,
        `expected refusal for observed sopInstanceUIDsHash=${String(value)}`,
      );
    }
  });

  it('refuses an observed digest that disagrees with a present expectation', () => {
    assert.throws(
      () =>
        parseVolumeDescriptor(
          descriptor(),
          contextWithExpectedSop(`sha256:${'0'.repeat(64)}`) as never,
        ),
      WorkerContractError,
    );
  });

  it('preserves the valid observed digest verbatim when the expectation is absent', () => {
    const parsed = parseVolumeDescriptor(
      descriptor(),
      contextWithExpectedSop(undefined) as never,
    );
    assert.equal(parsed.correlation.sopInstanceUIDsHash, DESCRIPTOR_SOP_HASH);
  });
});
