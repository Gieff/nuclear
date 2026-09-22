/**
 * @nuclear/view-engine — provenance ↔ registered-asset correlation (C5).
 *
 * ADR-010 §7.3: `ViewProvenance.sourceAssetIds`, `sourceSeriesInstanceUIDs`
 * and `sourceFingerprints` are **positionally one-to-one**. A registered
 * prepared view is refused fail-closed unless, for every index `i`, the
 * stored validated asset named by `sourceAssetIds[i]` shares the provenance
 * study, declares the matching series and carries a structurally equal
 * `SourceFingerprint`.
 *
 * Check order is fixed: length → study → series → fingerprint. Correlation is
 * read-only: it neither mutates the provenance nor the looked-up assets, so a
 * refusal leaves the caller's state untouched. It deliberately imports no
 * workspace module (no cycle); the caller supplies the asset lookup over its
 * own validated store.
 */
import type {
  AssetId,
  ImagingAsset,
  PreparedViewId,
  SourceFingerprint,
  ViewProvenance,
} from '@nuclear/shared-types';
import { PreparedViewError } from './errors.js';
import { structurallyEqual } from '../internal/json-equality.js';

export interface ProvenanceCorrelationInput {
  readonly preparedViewId: PreparedViewId;
  readonly provenance: ViewProvenance;
  /** Looks an asset up in the caller's validated store; `undefined` if absent. */
  readonly lookupAsset: (assetId: AssetId) => ImagingAsset | undefined;
}

function failLength(preparedViewId: PreparedViewId, provenance: ViewProvenance): never {
  throw new PreparedViewError(
    'PREPARED_VIEW_PROVENANCE_LENGTH_MISMATCH',
    `Prepared view '${preparedViewId}' declares provenance arrays of different lengths: ` +
      `${provenance.sourceAssetIds.length} sourceAssetIds, ` +
      `${provenance.sourceSeriesInstanceUIDs.length} sourceSeriesInstanceUIDs and ` +
      `${provenance.sourceFingerprints.length} sourceFingerprints. ` +
      'Remediation: make the three provenance arrays positionally one-to-one and equal in length.',
  );
}

function failStudy(
  preparedViewId: PreparedViewId,
  index: number,
  assetId: AssetId,
  provenanceStudy: string,
  assetStudy: string | undefined,
): never {
  const detail =
    assetStudy === undefined
      ? `is not registered against any study, so it cannot share the provenance study`
      : `resolves to study instance UID '${assetStudy}' instead of the provenance study`;
  throw new PreparedViewError(
    'PREPARED_VIEW_PROVENANCE_STUDY_MISMATCH',
    `Prepared view '${preparedViewId}' provenance source asset '${assetId}' at index ${index} ` +
      `${detail} '${provenanceStudy}'. ` +
      'Remediation: register the asset under the provenance study and correct sourceAssetIds[i].',
  );
}

function failSeries(
  preparedViewId: PreparedViewId,
  index: number,
  assetId: AssetId,
  declaredSeries: string,
  assetSeries: string | undefined,
): never {
  throw new PreparedViewError(
    'PREPARED_VIEW_PROVENANCE_SERIES_MISMATCH',
    `Prepared view '${preparedViewId}' provenance source asset '${assetId}' at index ${index} ` +
      `has series instance UID '${assetSeries ?? 'none'}' instead of the declared ` +
      `sourceSeriesInstanceUIDs[${index}] '${declaredSeries}'. ` +
      'Remediation: correct sourceSeriesInstanceUIDs[i] to name the asset series.',
  );
}

function failFingerprint(
  preparedViewId: PreparedViewId,
  index: number,
  assetId: AssetId,
  declared: SourceFingerprint,
  registered: SourceFingerprint,
): never {
  throw new PreparedViewError(
    'PREPARED_VIEW_PROVENANCE_FINGERPRINT_MISMATCH',
    `Prepared view '${preparedViewId}' provenance source asset '${assetId}' at index ${index} ` +
      `carries a sourceFingerprint whose contentDigest '${declared.contentDigest}' does not ` +
      `structurally match the registered fingerprint '${registered.contentDigest}'. ` +
      'Remediation: record the registered SourceFingerprint verbatim in sourceFingerprints[i].',
  );
}

/**
 * Validates the positional provenance correlation; throws `PreparedViewError`
 * on the first mismatch (length, then per-index study, series, fingerprint).
 */
export function assertProvenanceCorrelation(input: ProvenanceCorrelationInput): void {
  const { preparedViewId, provenance, lookupAsset } = input;
  const { sourceAssetIds, sourceSeriesInstanceUIDs, sourceFingerprints } = provenance;

  if (
    sourceAssetIds.length !== sourceSeriesInstanceUIDs.length ||
    sourceAssetIds.length !== sourceFingerprints.length
  ) {
    failLength(preparedViewId, provenance);
  }

  for (let index = 0; index < sourceAssetIds.length; index += 1) {
    const assetId = sourceAssetIds[index];
    const asset = lookupAsset(assetId);
    if (asset === undefined || asset.studyInstanceUID !== provenance.studyInstanceUID) {
      failStudy(
        preparedViewId,
        index,
        assetId,
        provenance.studyInstanceUID,
        asset === undefined ? undefined : asset.studyInstanceUID,
      );
    }
    const declaredSeries = sourceSeriesInstanceUIDs[index];
    if (asset.seriesInstanceUID !== declaredSeries) {
      failSeries(preparedViewId, index, assetId, declaredSeries, asset.seriesInstanceUID);
    }
    const declaredFingerprint = sourceFingerprints[index];
    if (!structurallyEqual(declaredFingerprint, asset.sourceFingerprint)) {
      failFingerprint(preparedViewId, index, assetId, declaredFingerprint, asset.sourceFingerprint);
    }
  }
}
