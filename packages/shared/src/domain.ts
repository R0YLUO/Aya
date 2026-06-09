// Aya domain types — the single source of truth for Page, Phrase, Share, and
// AnalyzedPage. Defined once here and re-exported from the package barrel so the
// API, web reader, and mobile client all share one definition.
//
// Source of truth: specs/02-data-model.md. These interfaces are paired one-to-one
// with the Zod schemas in `schemas.ts`.

/**
 * A `Page` is the text of one photographed book page.
 */
export interface Page {
  /** Primary identifier (uuid v4). */
  id: string;
  /** Raw text from the OCR call, line breaks preserved. Ground truth for evals. */
  fullText: string;
  /** When the page was created (ISO 8601). */
  createdAt: string;
}

/**
 * A `Phrase` is one ordered token of a `Page`. Concatenating every phrase's
 * `original` in ascending `index` order reconstructs the page's `fullText`
 * exactly (the reconstruction invariant).
 *
 * Tappability is inferred, not stored: a token is tappable iff its analysis is
 * present (`pinyin !== null`). Punctuation/whitespace tokens carry `null`
 * analysis.
 */
export interface Phrase {
  /** Primary identifier (uuid v4). */
  id: string;
  /** The `Page` this phrase belongs to (uuid). */
  pageId: string;
  /** Position in the page; 1-based. Sort by this to reconstruct the page. */
  index: number;
  /** Original Simplified-Chinese text of this token (or literal punctuation/newline). */
  original: string;
  /** Pinyin with tone marks. `null` for non-word tokens. */
  pinyin: string | null;
  /** Standard English translation. `null` for non-word tokens. */
  translation: string | null;
  /** How the phrase is used in this passage. `null` for non-word tokens. */
  contextualMeaning: string | null;
}

/**
 * A `Share` backs the short-URL web reader. It is the only persisted concept on
 * the scan path's downstream `POST /shares` flow.
 */
export interface Share {
  /** Short, URL-safe code; the public identifier in `/s/{code}`. */
  code: string;
  /** The page this share points to (uuid). */
  pageId: string;
  /** When the share was minted (ISO 8601). */
  createdAt: string;
}

/**
 * A fully analysed page: the `Page` plus its `Phrase`s, ordered by `index`.
 */
export interface AnalyzedPage {
  page: Page;
  /** Ordered by `index`. */
  phrases: Phrase[];
}
