/**
 * NuClear C5 — `structurallyEqual` unit tests.
 *
 * Pure Node: the helper is dependency-free and Node/browser-safe, so its
 * contract is pinned directly here rather than only through provenance
 * correlation. Covers `Object.is` scalars, key-order independence and the
 * array/object distinctions C5 relies on.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { structurallyEqual } from '../../packages/view-engine/src/internal/json-equality.ts';

describe('NuClear C5 — structurallyEqual', () => {
  it('compares scalars with Object.is', () => {
    assert.equal(structurallyEqual(1, 1), true);
    assert.equal(structurallyEqual('a', 'a'), true);
    assert.equal(structurallyEqual(true, true), true);
    assert.equal(structurallyEqual(null, null), true);
    assert.equal(structurallyEqual(1, 2), false);
    assert.equal(structurallyEqual(0, -0), false, '-0 and 0 must not be equal');
    assert.equal(structurallyEqual(Number.NaN, Number.NaN), true);
  });

  it('distinguishes null from undefined', () => {
    assert.equal(structurallyEqual(null, undefined), false);
  });

  it('is independent of object key order', () => {
    const left = { a: 1, b: { c: 2, d: 3 } };
    const right = { b: { d: 3, c: 2 }, a: 1 };
    assert.equal(structurallyEqual(left, right), true);
  });

  it('compares arrays element-wise and respects length', () => {
    assert.equal(structurallyEqual([1, [2, 3]], [1, [2, 3]]), true);
    assert.equal(structurallyEqual([1, 2], [1, 2, 3]), false);
    assert.equal(structurallyEqual([1, 2], [2, 1]), false);
  });

  it('distinguishes arrays from objects and mismatched value types', () => {
    assert.equal(structurallyEqual([], {}), false);
    assert.equal(structurallyEqual({ 0: 'a' }, ['a']), false);
    assert.equal(structurallyEqual({ a: 1 }, { a: '1' }), false);
  });

  it('distinguishes a missing key from an undefined-valued key', () => {
    assert.equal(structurallyEqual({ a: undefined }, {}), false);
    assert.equal(structurallyEqual({ a: undefined }, { a: undefined }), true);
  });

  it('never mutates its arguments', () => {
    const left = { a: [1, 2], b: { c: 3 } };
    const right = { b: { c: 3 }, a: [1, 2] };
    const leftSnapshot = JSON.stringify(left);
    const rightSnapshot = JSON.stringify(right);
    assert.equal(structurallyEqual(left, right), true);
    assert.equal(JSON.stringify(left), leftSnapshot);
    assert.equal(JSON.stringify(right), rightSnapshot);
  });

  it('rejects non-plain scalar mismatches without throwing', () => {
    assert.equal(structurallyEqual('a', null), false);
    assert.equal(structurallyEqual(undefined, {}), false);
    assert.equal(structurallyEqual([1], null), false);
  });

  it('handles deeply nested shared structures', () => {
    const shared = { digest: 'sha256:x' };
    assert.equal(structurallyEqual({ s: [shared] }, { s: [{ digest: 'sha256:x' }] }), true);
    assert.equal(structurallyEqual({ s: [shared] }, { s: [{ digest: 'sha256:y' }] }), false);
  });
});
