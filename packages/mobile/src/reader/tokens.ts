// Reader token model (framework-free, unit-tested).
//
// The reader renders an AnalyzedPage as clean, scrollable text. This module owns
// the pure logic that decides how each phrase renders, independent of React
// Native, so the rendering contract is testable under node:test:
//
//   - Phrases are ordered by ascending `index`; concatenating each `original`
//     reproduces `page.fullText` exactly, line breaks included (the
//     reconstruction invariant — specs/02-data-model.md).
//   - A token is INTERACTIVE (tappable) iff its analysis is present
//     (`pinyin !== null`). Punctuation / whitespace / newline tokens carry null
//     analysis and render as plain, non-tappable text.

import type { AnalyzedPage, Phrase } from '@aya/shared';

/** A phrase is interactive (tappable) iff it carries analysis (pinyin present). */
export function isInteractive(phrase: Phrase): boolean {
  return phrase.pinyin !== null;
}

/** One token in the reader: the phrase plus whether it is tappable. */
export interface ReaderToken {
  phrase: Phrase;
  /** Whether tapping this token opens the lookup popup. */
  interactive: boolean;
}

/**
 * Phrases sorted by `index` (defensively, so the visual order always reproduces
 * `fullText` even if the input array is not pre-sorted) and classified as
 * tappable vs plain text.
 */
export function readerTokens(page: AnalyzedPage): ReaderToken[] {
  return [...page.phrases]
    .sort((a, b) => a.index - b.index)
    .map((phrase) => ({ phrase, interactive: isInteractive(phrase) }));
}

/**
 * The text the reader renders, reconstructed from the ordered phrases. Equal to
 * `page.fullText` when the reconstruction invariant holds.
 */
export function reconstructText(page: AnalyzedPage): string {
  return readerTokens(page)
    .map((t) => t.phrase.original)
    .join('');
}
