/**
 * NuClear 2B.3b — bridge-side path containment and payload integrity evidence.
 *
 * Pure, Node-only tests: canonical containment (traversal/symlink), exact
 * length/hash reads, the TTL boundary and little-endian decoding. These are the
 * bridge defenses that run before the worker bytes ever reach a renderer.
 */

import assert from 'node:assert/strict';
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { register } from 'node:module';
import { after, describe, it } from 'node:test';

register(new URL('./fixtures/ts-resolve-hook.mjs', import.meta.url));
const {
  WORKER_VOLUME_MAX_PAYLOAD_BYTES,
  WORKER_VOLUME_MAX_VOXELS_PER_VOLUME,
  WorkerVolumeTransportError,
  assertHandleNotExpired,
  assertVolumeWithinLimits,
  decodeVolumeScalarData,
  parseVolumeDescriptor,
  readVerifiedVolumePayload,
  resolveContainedPayloadPath,
  sha256ContentHash,
  workerVolumePayloadByteCap,
} = await import('../../packages/medical-engine/src/index.js');
const { contextFixture, descriptorFixture } = await import('./fixtures/volume-bridge-fixtures.ts');

const context = contextFixture;
const descriptor = descriptorFixture;

// The fixture descriptor publishes at 2026-09-22T00:00:00.000Z with a 300 s
// TTL, so its ADR-013 §7 expiry boundary is this exact instant.
const EXPIRY_MS = Date.parse('2026-09-22T00:00:00.000Z') + 300 * 1000;
const beforeExpiry = (): number => EXPIRY_MS - 1;

const ROOTS: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'nuclear-volume-files-'));
  ROOTS.push(root);
  return root;
}
after(() => {
  for (const root of ROOTS) rmSync(root, { recursive: true, force: true });
});

function expectFailure(run: () => unknown, failure: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof WorkerVolumeTransportError, `got ${String(error)}`);
    assert.equal(error.failure, failure);
    return true;
  });
}

describe('NuClear 2B.3b — canonical containment', () => {
  it('resolves a contained regular file', () => {
    const root = tempRoot();
    writeFileSync(join(root, 'payload.bin'), Buffer.from([1, 2, 3]));
    const resolved = resolveContainedPayloadPath(root, 'payload.bin');
    assert.equal(resolved, join(realpathSync(root), 'payload.bin'));
  });

  it('rejects absolute, traversal and multi-component names', () => {
    const root = tempRoot();
    for (const name of ['/etc/passwd', '..', '.', '../payload.bin', 'a/b', 'a\\b', '', 'x\0y']) {
      expectFailure(() => resolveContainedPayloadPath(root, name), 'path-rejected');
    }
  });

  it('rejects a symlinked file and a symlinked root', () => {
    const root = tempRoot();
    const outside = tempRoot();
    writeFileSync(join(outside, 'secret.bin'), Buffer.from([9]));
    symlinkSync(join(outside, 'secret.bin'), join(root, 'link.bin'));
    expectFailure(() => resolveContainedPayloadPath(root, 'link.bin'), 'path-rejected');

    const linkRoot = join(tempRoot(), 'root-link');
    symlinkSync(root, linkRoot);
    expectFailure(() => resolveContainedPayloadPath(linkRoot, 'payload.bin'), 'path-rejected');
  });

  it('reports a missing payload without leaking a path', () => {
    const root = tempRoot();
    expectFailure(() => resolveContainedPayloadPath(root, 'missing.bin'), 'file-missing');
    try {
      resolveContainedPayloadPath(root, 'missing.bin');
    } catch (error) {
      assert.ok(!(error as Error).message.includes(root));
    }
  });
});

describe('NuClear 2B.3b — payload read, hash and TTL', () => {
  it('reads a payload only when length and hash match', () => {
    const root = tempRoot();
    const bytes = Buffer.alloc(192, 7);
    writeFileSync(join(root, 'payload.bin'), bytes);
    const parsed = parseVolumeDescriptor(
      descriptor({ contentHash: sha256ContentHash(bytes) }),
      context() as never,
    );
    assert.deepEqual(readVerifiedVolumePayload(root, parsed, beforeExpiry), bytes);

    writeFileSync(join(root, 'payload.bin'), bytes.subarray(0, 191));
    expectFailure(() => readVerifiedVolumePayload(root, parsed, beforeExpiry), 'file-short');
    writeFileSync(join(root, 'payload.bin'), Buffer.concat([bytes, Buffer.from([0])]));
    expectFailure(() => readVerifiedVolumePayload(root, parsed, beforeExpiry), 'file-long');
    const corrupt = Buffer.from(bytes);
    corrupt[0] ^= 0xff;
    writeFileSync(join(root, 'payload.bin'), corrupt);
    expectFailure(() => readVerifiedVolumePayload(root, parsed, beforeExpiry), 'hash-mismatch');
  });

  it('refuses an expired handle at the publication-anchored boundary', () => {
    const parsed = parseVolumeDescriptor(descriptor(), context() as never);
    assert.doesNotThrow(() => assertHandleNotExpired(parsed, EXPIRY_MS - 1));
    expectFailure(() => assertHandleNotExpired(parsed, EXPIRY_MS), 'handle-expired');
  });

  it('refuses a payload whose TTL elapses during the read/hash window', () => {
    const root = tempRoot();
    const bytes = Buffer.alloc(192, 7);
    writeFileSync(join(root, 'payload.bin'), bytes);
    const parsed = parseVolumeDescriptor(
      descriptor({ contentHash: sha256ContentHash(bytes) }),
      context() as never,
    );
    let samples = 0;
    const lapsing = (): number => (samples++ === 0 ? EXPIRY_MS - 1 : EXPIRY_MS);
    expectFailure(() => readVerifiedVolumePayload(root, parsed, lapsing), 'handle-expired');
    assert.equal(samples, 2, 'TTL must be sampled before and after the read');
  });

  it('refuses a payload longer than its declared byteLength even when the prefix hashes', () => {
    const root = tempRoot();
    const bytes = Buffer.alloc(192, 7);
    const parsed = parseVolumeDescriptor(
      descriptor({ contentHash: sha256ContentHash(bytes) }),
      context() as never,
    );
    writeFileSync(join(root, 'payload.bin'), Buffer.concat([bytes, Buffer.from([0xff])]));
    expectFailure(() => readVerifiedVolumePayload(root, parsed, beforeExpiry), 'file-long');
  });

  it('decodes little-endian bytes into exactly the declared typed array', () => {
    const values = new Float32Array([-1048.5, 2.25, 1024, -1]);
    const bytes = Buffer.from(values.buffer.slice(0));
    const parsed = parseVolumeDescriptor(
      descriptor({ dimensions: [4, 1, 1], byteLength: 16, contentHash: sha256ContentHash(bytes) }),
      context({ expectedDimensions: [4, 1, 1] }) as never,
    );
    const decoded = decodeVolumeScalarData(bytes, parsed);
    assert.ok(decoded instanceof Float32Array);
    assert.deepEqual([...decoded], [...values]);
    expectFailure(() => decodeVolumeScalarData(bytes.subarray(0, 15), parsed), 'decode-failed');
  });
});

describe('NuClear 2B.3b — ADR-013 §6 bridge resource bounds', () => {
  it('refuses a descriptor above the per-volume voxel cap before any I/O', () => {
    const overVoxels = descriptor({
      dtype: 'int8',
      dimensions: [WORKER_VOLUME_MAX_VOXELS_PER_VOLUME + 1, 1, 1],
      byteLength: WORKER_VOLUME_MAX_VOXELS_PER_VOLUME + 1,
    }) as never;
    expectFailure(() => assertVolumeWithinLimits(overVoxels), 'voxel-limit-exceeded');
    // The reader applies the same bound before resolving or opening anything: a
    // bogus root would otherwise surface as a containment error first.
    expectFailure(
      () => readVerifiedVolumePayload('/nonexistent-nuclear-root', overVoxels, beforeExpiry),
      'voxel-limit-exceeded',
    );
  });

  it('refuses a payload above the advertised byte cap', () => {
    const parsed = parseVolumeDescriptor(descriptor(), context() as never);
    const tight = {
      root: '/private/tmp/nuclear',
      handleTtlSeconds: 300,
      maxResidentPayloads: 2,
      maxPayloadBytes: 128,
    };
    expectFailure(() => assertVolumeWithinLimits(parsed, tight as never), 'payload-limit-exceeded');
    assert.doesNotThrow(() =>
      assertVolumeWithinLimits(parsed, { ...tight, maxPayloadBytes: 192 } as never),
    );
  });

  it('never loosens the absolute 1 GiB cap with a larger advertised value', () => {
    assert.equal(workerVolumePayloadByteCap(), WORKER_VOLUME_MAX_PAYLOAD_BYTES);
    assert.equal(
      workerVolumePayloadByteCap({ maxPayloadBytes: 2 ** 31 } as never),
      WORKER_VOLUME_MAX_PAYLOAD_BYTES,
    );
    assert.equal(workerVolumePayloadByteCap({ maxPayloadBytes: 1024 } as never), 1024);
  });
});
