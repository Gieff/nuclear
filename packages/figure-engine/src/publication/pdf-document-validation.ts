/**
 * @nuclear/figure-engine — structural validation for the hybrid-PDF metadata
 * (P5.7). Internal module: not re-exported from the package barrel. Vector-layer
 * validation lives in `pdf-vector-validation.ts`.
 *
 * Every rejection is a typed `FIGURE_PDF_DOCUMENT_INVALID`; malformed editorial
 * metadata must never surface as a bare `TypeError`. Pure and Node-safe.
 */

import type { PublicationPdfMetadata } from './pdf-document.js';
import { asIsoDate, asRecord, asText, fail } from './pdf-validation-primitives.js';

/** Validates the declared publication metadata (explicit, never defaulted). */
export function readPdfMetadata(value: unknown): PublicationPdfMetadata {
  const record = asRecord(value, 'metadata');
  const title = asText(record.title, 'metadata.title');
  const author = asText(record.author, 'metadata.author');
  const subject = asText(record.subject, 'metadata.subject');
  const creator = asText(record.creator, 'metadata.creator');
  const producer = asText(record.producer, 'metadata.producer');

  if (!Array.isArray(record.keywords)) {
    fail('metadata.keywords must be an array of strings (possibly empty)');
  }
  const keywords = record.keywords.map((keyword, index) => {
    if (typeof keyword !== 'string') {
      fail(`metadata.keywords[${index}] must be a string`);
    }
    return keyword;
  });
  const creationDate =
    record.creationDate === undefined
      ? undefined
      : asIsoDate(record.creationDate, 'metadata.creationDate');
  const modificationDate =
    record.modificationDate === undefined
      ? undefined
      : asIsoDate(record.modificationDate, 'metadata.modificationDate');

  return Object.freeze({
    title,
    author,
    subject,
    keywords: Object.freeze(keywords),
    creator,
    producer,
    ...(creationDate === undefined ? {} : { creationDate }),
    ...(modificationDate === undefined ? {} : { modificationDate }),
  });
}
