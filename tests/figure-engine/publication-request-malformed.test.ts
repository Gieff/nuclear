/**
 * NuClear P5.2 — `PublicationRenderRequest` assembly, malformed-object runtime
 * cases.
 *
 * Every malformed input must surface as a typed `FigurePublicationError`, never
 * as a bare `TypeError`. This file deliberately feeds non-numeric malformations
 * (null/undefined/arrays/wrong types/missing nested objects) in addition to the
 * invalid numeric values already covered elsewhere.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type { AssemblePublicationRenderRequestInput } from '../../packages/figure-engine/src/publication/index.ts';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const { FIGURE_PUBLICATION_ERROR_CODES, FigurePublicationError, assemblePublicationRenderRequest } =
  await import('../../packages/figure-engine/src/publication/index.ts');

const { mockComposerPanel, mockFigureSheet } = await import(
  '../fixtures/figure-contracts.fixture.ts'
);
const { mockPreparedView } = await import('../fixtures/view-contracts.fixture.ts');

const CODES = FIGURE_PUBLICATION_ERROR_CODES;

const validInput = (): Record<string, unknown> => ({
  figureSheet: mockFigureSheet,
  preparedViews: [mockPreparedView],
  format: 'pdf',
  dpi: 300,
  colorProfile: 'sRGB',
  renderStateHash: 'sha256:live',
  renderer: { rendererName: 'renderer', rendererVersion: '1.0.0' },
  availabilityPolicy: 'require-online',
});

const withSheet = (panels: unknown): Record<string, unknown> => ({
  ...validInput(),
  figureSheet: { ...mockFigureSheet, panels },
});

const withPreparedViews = (preparedViews: unknown): Record<string, unknown> => ({
  ...validInput(),
  preparedViews,
});

const binding = mockComposerPanel.viewInstance.medicalViewBinding;

function run(input: unknown): void {
  assemblePublicationRenderRequest(input as unknown as AssemblePublicationRenderRequestInput);
}

function expectError(input: unknown, code: string): void {
  assert.throws(
    () => run(input),
    (error: unknown) => {
      assert.ok(
        error instanceof FigurePublicationError,
        `expected FigurePublicationError for malformed input, got ${String(error)}`,
      );
      assert.ok(
        !(error instanceof TypeError),
        'a malformed input must not surface as a bare TypeError',
      );
      assert.equal(error.code, code);
      assert.ok(error.message.length > 0, 'expected an actionable message');
      return true;
    },
  );
}

describe('NuClear P5.2 — malformed publication request input', () => {
  it('1. refuses a non-object request input', () => {
    for (const input of [null, undefined, [], 'request', 7, true]) {
      expectError(input, CODES.requestInvalid);
    }
  });

  it('2. refuses a malformed figureSheet', () => {
    const cases: readonly unknown[] = [
      { ...validInput(), figureSheet: null },
      { ...validInput(), figureSheet: [] },
      { ...validInput(), figureSheet: 'sheet' },
      { ...validInput(), figureSheet: {} },
      withSheet('panels'),
      withSheet([]),
      withSheet([null]),
      withSheet([{ ...mockComposerPanel, id: undefined }]),
      withSheet([{ ...mockComposerPanel, viewInstance: undefined }]),
      withSheet([
        { ...mockComposerPanel, viewInstance: { ...mockComposerPanel.viewInstance, medicalViewBinding: undefined } },
      ]),
      withSheet([
        {
          ...mockComposerPanel,
          viewInstance: {
            ...mockComposerPanel.viewInstance,
            medicalViewBinding: { ...binding, availability: { state: 'weird' } },
          },
        },
      ]),
      withSheet([
        {
          ...mockComposerPanel,
          viewInstance: {
            ...mockComposerPanel.viewInstance,
            medicalViewBinding: { ...binding, availability: 'online' },
          },
        },
      ]),
      withSheet([
        {
          ...mockComposerPanel,
          viewInstance: {
            ...mockComposerPanel.viewInstance,
            medicalViewBinding: { ...binding, cachedPreviewReference: {} },
          },
        },
      ]),
      // Duplicate panel ids are structurally invalid for a figure sheet.
      withSheet([mockComposerPanel, { ...mockComposerPanel }]),
      // Duplicate composer view-instance ids are structurally invalid.
      withSheet([mockComposerPanel, { ...mockComposerPanel, id: 'panel-b' }]),
      // The sheet must carry an annotations array.
      { ...validInput(), figureSheet: { ...mockFigureSheet, annotations: 'nope' } },
    ];
    for (const input of cases) {
      expectError(input, CODES.requestInvalid);
    }
  });

  it('3. refuses a malformed prepared view instead of crashing', () => {
    const provenance = mockPreparedView.provenance;
    const cases: readonly unknown[] = [
      withPreparedViews('views'),
      withPreparedViews([null]),
      withPreparedViews([{ ...mockPreparedView, id: undefined }]),
      withPreparedViews([{ ...mockPreparedView, sourceViewId: undefined }]),
      withPreparedViews([{ ...mockPreparedView, state: undefined }]),
      withPreparedViews([{ ...mockPreparedView, provenance: undefined }]),
      withPreparedViews([{ ...mockPreparedView, provenance: { ...provenance, sourceFingerprints: 'nope' } }]),
      withPreparedViews([{ ...mockPreparedView, provenance: { ...provenance, sourceFingerprints: [null] } }]),
      withPreparedViews([{ ...mockPreparedView, cachedPreviewReference: {} }]),
    ];
    for (const input of cases) {
      expectError(input, CODES.requestInvalid);
    }
  });

  it('4. refuses a panel/prepared-view matching violation with FIGURE_PUBLICATION_PANEL_SOURCE_INVALID', () => {
    const cases: readonly unknown[] = [
      // Duplicate prepared view ids.
      withPreparedViews([mockPreparedView, { ...mockPreparedView }]),
      // Prepared-view id does not match the panel reference.
      withPreparedViews([{ ...mockPreparedView, id: 'prepared-other' }]),
      // One supplied prepared view is never matched by a panel.
      withPreparedViews([mockPreparedView, { ...mockPreparedView, id: 'prepared-extra' }]),
      // Two panels, only one prepared view.
      withSheet([
        mockComposerPanel,
        {
          ...mockComposerPanel,
          id: 'panel-b',
          viewInstance: {
            ...mockComposerPanel.viewInstance,
            id: 'instance-b',
            preparedViewId: 'prepared-ct-b',
            medicalViewBinding: { ...binding, preparedViewId: 'prepared-ct-b' },
          },
        },
      ]),
      // The medical view binding must reference the same prepared view as its
      // enclosing view instance.
      withSheet([
        {
          ...mockComposerPanel,
          viewInstance: {
            ...mockComposerPanel.viewInstance,
            medicalViewBinding: { ...binding, preparedViewId: 'prepared-other' },
          },
        },
      ]),
    ];
    for (const input of cases) {
      expectError(input, CODES.panelSourceInvalid);
    }
  });

  it('5. refuses malformed scalar and identity fields', () => {
    const cases: Array<[unknown, string]> = [
      [{ ...validInput(), format: 'jpeg' }, CODES.requestInvalid],
      [{ ...validInput(), format: undefined }, CODES.requestInvalid],
      [{ ...validInput(), dpi: 0 }, CODES.requestInvalid],
      [{ ...validInput(), dpi: Number.NaN }, CODES.requestInvalid],
      [{ ...validInput(), dpi: '300' }, CODES.requestInvalid],
      [{ ...validInput(), colorProfile: '' }, CODES.requestInvalid],
      [{ ...validInput(), alpha: 'translucent' }, CODES.requestInvalid],
      [{ ...validInput(), renderStateHash: '' }, CODES.requestInvalid],
      [{ ...validInput(), renderStateHash: 42 }, CODES.requestInvalid],
      [{ ...validInput(), renderer: null }, CODES.requestInvalid],
      [{ ...validInput(), renderer: { rendererName: 'renderer' } }, CODES.requestInvalid],
      [{ ...validInput(), availabilityPolicy: 'whatever' }, CODES.requestInvalid],
    ];
    for (const [input, code] of cases) {
      expectError(input, code);
    }
  });

  it('6. refuses field-level malformed source fingerprints', () => {
    const provenance = mockPreparedView.provenance;
    const fingerprint = provenance.sourceFingerprints[0];
    const preview = mockPreparedView.cachedPreviewReference!;

    expectError(
      withPreparedViews([
        {
          ...mockPreparedView,
          provenance: {
            ...provenance,
            sourceFingerprints: [{ ...fingerprint, contentDigest: undefined }],
          },
        },
      ]),
      CODES.requestInvalid,
    );

    expectError(
      withPreparedViews([
        // An empty provenance fingerprint set is structurally invalid
        // (`isViewProvenance` requires at least one fingerprint).
        { ...mockPreparedView, provenance: { ...provenance, sourceFingerprints: [] } },
      ]),
      CODES.requestInvalid,
    );

    expectError(
      withSheet([
        {
          ...mockComposerPanel,
          viewInstance: {
            ...mockComposerPanel.viewInstance,
            medicalViewBinding: {
              ...binding,
              cachedPreviewReference: {
                ...preview,
                sourceFingerprintSet: [{ ...preview.sourceFingerprintSet[0], instanceCount: 0 }],
              },
            },
          },
        },
      ]),
      CODES.requestInvalid,
    );
  });
});
