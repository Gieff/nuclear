/**
 * NuClear C8 corrective — `requireCompleteScalarData` guard tests.
 *
 * Pure Node: the guard is intentionally free of any Cornerstone/DOM import, so
 * both the success path and the fail-closed path are unit-testable here.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { requireCompleteScalarData } from './fixtures/scalar-data-access.ts';

describe('NuClear C8 — requireCompleteScalarData is fail-closed', () => {
  it('returns the complete scalar data when the method is present', () => {
    const data = new Float32Array([1, 2, 3]);
    const source = { getCompleteScalarDataArray: () => data };
    assert.equal(requireCompleteScalarData(source, 'volume-probe'), data);
  });

  it('invokes the method with the source as `this`', () => {
    const source = {
      values: new Float32Array([4, 5]),
      getCompleteScalarDataArray(this: { values: Float32Array }) {
        return this.values;
      },
    };
    assert.equal(requireCompleteScalarData(source, 'volume-probe'), source.values);
  });

  it('fails closed when the method is absent', () => {
    assert.throws(
      () => requireCompleteScalarData({}, 'volume-probe'),
      /getCompleteScalarDataArray is required/,
    );
  });

  it('fails closed when the source is undefined', () => {
    assert.throws(
      () => requireCompleteScalarData(undefined, 'volume-probe'),
      /getCompleteScalarDataArray is required/,
    );
  });
});
