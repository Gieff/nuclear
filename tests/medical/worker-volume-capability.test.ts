/**
 * NuClear 2B.3b — `capability-unavailable` bridge refusal.
 *
 * A worker whose handshake is coherent but omits the additive
 * `capabilities.volumeTransport` (ADR-013 §2) must refuse real-source hydration
 * with a typed `WorkerVolumeTransportError` before any payload file is resolved,
 * opened or hashed. Because the `nuclear.dicom.volume` descriptor (and therefore
 * its opaque handle) was received, `hydrateVolume` must still issue
 * `nuclear.volume.release` exactly once in `finally`. Driven by a test-local
 * `request` stub on an unstarted bridge: no worker process, no filesystem and no
 * payload bytes are touched. No `view-engine` import is involved.
 */

import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type { WorkerVolumeHydrationRequest } from '../../packages/medical-engine/src/worker/volume-types.ts';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const {
  DICOM_VOLUME_METHOD,
  ScientificWorkerBridge,
  VOLUME_RELEASE_METHOD,
  WorkerVolumeTransportError,
  mapWorkerHandshake,
} = await import('../../packages/medical-engine/src/index.js');
const { contextFixture, descriptorFixture, handshakeEnvelope } = await import(
  './fixtures/volume-bridge-fixtures.ts'
);

const HANDLE = descriptorFixture().handle as string;

/** A coherent hydration request built from the shared context fixture. */
function hydrationRequest(): WorkerVolumeHydrationRequest {
  const context = contextFixture();
  return {
    locator: { kind: 'local-folder', path: '/nonexistent/nuclear-capability-probe' },
    seriesInstanceUID: context.seriesInstanceUID,
    expectedFingerprint: context.expectedFingerprint,
    expectedFrameOfReferenceUID: context.expectedFrameOfReferenceUID,
    expectedDimensions: context.expectedDimensions,
    expectedGeometricDigest: context.expectedGeometricDigest,
    expectedRescale: context.expectedRescale,
  } as unknown as WorkerVolumeHydrationRequest;
}

interface RequestCall {
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
}

interface CapabilityLessBridge {
  readonly bridge: InstanceType<typeof ScientificWorkerBridge>;
  readonly calls: RequestCall[];
  readonly released: string[];
  readonly clock: { samples: number };
}

/**
 * An unstarted bridge whose `request` is stubbed to return a coherent volume
 * descriptor and to accept the release. `currentHandshake` is exposed as a real
 * mapped handshake with no `volumeTransport` capability. The injected
 * `volumeClock` counts (and refuses) any payload-path sampling.
 */
function capabilityLessBridge(): CapabilityLessBridge {
  const calls: RequestCall[] = [];
  const released: string[] = [];
  const clock = { samples: 0 };
  const bridge = new ScientificWorkerBridge({
    // `readVerifiedVolumePayload` samples this clock before it opens any file;
    // reaching it would mean the capability refusal happened too late.
    volumeClock: () => {
      clock.samples += 1;
      throw new Error('the payload/read path must not be reached');
    },
  });
  const stub = (
    method: string,
    params: Readonly<Record<string, unknown>>,
  ): Promise<unknown> => {
    calls.push({ method, params });
    if (method === DICOM_VOLUME_METHOD) {
      return Promise.resolve({ descriptor: descriptorFixture() });
    }
    if (method === VOLUME_RELEASE_METHOD) {
      released.push(String(params.handle));
      return Promise.resolve({ status: 'released' });
    }
    return Promise.reject(new Error(`unexpected method '${method}'`));
  };
  (bridge as unknown as { request: typeof stub }).request = stub;
  Object.defineProperty(bridge, 'currentHandshake', {
    value: mapWorkerHandshake(handshakeEnvelope() as never),
    configurable: true,
  });
  return { bridge, calls, released, clock };
}

describe('NuClear 2B.3b — volumeTransport capability-unavailable', () => {
  it('refuses with a typed failure before any payload is touched', async () => {
    const { bridge, clock } = capabilityLessBridge();
    assert.equal(bridge.availability, 'stopped', 'the bridge must remain unstarted');
    await assert.rejects(bridge.hydrateVolume(hydrationRequest()), (error: unknown) => {
      assert.ok(error instanceof WorkerVolumeTransportError, `got ${String(error)}`);
      assert.equal(error.failure, 'capability-unavailable');
      // The refusal is raised by the bridge itself, so no handle is attributed.
      assert.equal(error.handle, null);
      return true;
    });
    assert.equal(clock.samples, 0, 'the TTL/payload clock must never be sampled');
  });

  it('attempts the known handle release exactly once, after the volume request', async () => {
    const { bridge, calls, released, clock } = capabilityLessBridge();
    await assert.rejects(bridge.hydrateVolume(hydrationRequest()), WorkerVolumeTransportError);
    assert.deepEqual(
      calls.map((call) => call.method),
      [DICOM_VOLUME_METHOD, VOLUME_RELEASE_METHOD],
      'the volume request precedes the finally release',
    );
    assert.deepEqual(released, [HANDLE], 'release must target the descriptor handle exactly once');
    assert.deepEqual(calls[1].params, { handle: HANDLE });
    assert.equal(clock.samples, 0, 'the TTL/payload clock must never be sampled');
  });
});
