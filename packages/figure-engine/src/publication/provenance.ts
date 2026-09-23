/**
 * @nuclear/figure-engine — publication provenance equality (P5.2, ADR-014 D4).
 *
 * The offline-preview branch must prove that a `CachedPreviewReference` really
 * describes the saved `PreparedView` it is composed from. These helpers mirror
 * the Fase-1 contract oracle (`tests/contracts/figure-validators.ts`,
 * `sameFingerprints`/`samePreview`) exactly so that an assembled offline
 * request is accepted by that oracle. The comparison is order-independent,
 * duplicate-sensitive and complete; it never coerces or defaults a value.
 *
 * Pure and Node-safe: no DOM, no WebGL, no Cornerstone.
 */

import type { CachedPreviewReference, SourceFingerprint } from '@nuclear/shared-types';

/**
 * Canonical, order-independent identity of one fingerprint. Presence of the
 * optional hashes is significant (absent vs `undefined` are distinguished),
 * matching the oracle byte-for-byte.
 */
function fingerprintKey(fingerprint: SourceFingerprint): string {
  return JSON.stringify([
    fingerprint.studyInstanceUID,
    fingerprint.seriesInstanceUID,
    fingerprint.instanceCount,
    fingerprint.contentDigest,
    Object.prototype.hasOwnProperty.call(fingerprint, 'sopInstanceUIDsHash'),
    fingerprint.sopInstanceUIDsHash,
    Object.prototype.hasOwnProperty.call(fingerprint, 'totalBytes'),
    fingerprint.totalBytes,
    Object.prototype.hasOwnProperty.call(fingerprint, 'geometricDigest'),
    fingerprint.geometricDigest,
  ]);
}

function countKeys(fingerprints: readonly SourceFingerprint[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const fingerprint of fingerprints) {
    const key = fingerprintKey(fingerprint);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Multiset equality of two fingerprint sets: same length, same keys, same
 * multiplicity. Order is irrelevant; duplicates are significant.
 */
export function sourceFingerprintSetEquals(
  left: readonly SourceFingerprint[],
  right: readonly SourceFingerprint[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const leftCounts = countKeys(left);
  const rightCounts = countKeys(right);
  if (leftCounts.size !== rightCounts.size) {
    return false;
  }
  for (const [key, count] of leftCounts) {
    if (rightCounts.get(key) !== count) {
      return false;
    }
  }
  return true;
}

/**
 * Value equality of two cached-preview references, mirroring the Fase-1
 * oracle's `samePreview`. `generatedAt` is intentionally not compared, exactly
 * as in the oracle: a reference may be regenerated without invalidating the
 * approved preview identity.
 */
export function cachedPreviewReferenceEquals(
  left: CachedPreviewReference,
  right: CachedPreviewReference,
): boolean {
  return (
    left.previewId === right.previewId &&
    left.renderStateHash === right.renderStateHash &&
    left.colorProfile === right.colorProfile &&
    JSON.stringify(left.pixelDimensions) === JSON.stringify(right.pixelDimensions) &&
    sourceFingerprintSetEquals(left.sourceFingerprintSet, right.sourceFingerprintSet) &&
    JSON.stringify(left.rendererMetadata) === JSON.stringify(right.rendererMetadata)
  );
}
