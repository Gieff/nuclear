/**
 * NuClear P5.2 — explicit publication-request trust-boundary test.
 *
 * The assembler validates the publication-relevant shape of its inputs and
 * relies on the upstream contract owners for deep clinical validity: a
 * `PreparedView` produced by `view-engine` assembly is contract-valid (ADR-011).
 * This test pins that boundary rather than masking it — a deeply malformed
 * `PreparedView.state` is passed through unchanged by the assembler and is
 * rejected by the Fase-1 contract oracle. It is documentation-by-evidence, not
 * an invitation to supply malformed state.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type { PreparedView } from '../../packages/shared-types/src/index.js';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const { assemblePublicationRenderRequest } = await import(
  '../../packages/figure-engine/src/publication/index.ts'
);
const { isPublicationRenderRequest } = await import('../contracts/figure-validators.ts');
const { mockFigureSheet } = await import('../fixtures/figure-contracts.fixture.ts');
const { mockPreparedView } = await import('../fixtures/view-contracts.fixture.ts');

describe('NuClear P5.2 — publication request trust boundary', () => {
  it('leaves deep PreparedView.state validity to the view-engine/oracle authority', () => {
    const deeplyMalformed = { ...mockPreparedView, state: {} } as unknown as PreparedView;

    const request = assemblePublicationRenderRequest({
      figureSheet: mockFigureSheet,
      preparedViews: [deeplyMalformed],
      format: 'pdf',
      dpi: 300,
      colorProfile: 'sRGB',
      renderStateHash: 'sha256:live',
      renderer: { rendererName: 'renderer', rendererVersion: '1.0.0' },
      availabilityPolicy: 'require-online',
    });

    // The assembler deliberately does not re-validate the deep clinical state
    // (upstream-owned); the assembled request is only contract-valid once the
    // upstream PreparedView is, which the Fase-1 oracle states explicitly.
    assert.equal(isPublicationRenderRequest(request), false);
  });
});
