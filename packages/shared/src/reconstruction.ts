// The reconstruction invariant: a page's analysed phrases must rebuild its
// `fullText` exactly. Concatenating each phrase's `original` in ascending `index`
// order must equal `fullText`, indexes must be unique and contiguous from 1, and
// every phrase must belong to the same page. This guarantees faithful page
// rebuilds (CLAUDE.md golden rule #3; North Star: Reliable).
//
// The check is pure: it never mutates its inputs.

import type { Phrase } from './domain.js';

/** Machine-readable reason a reconstruction check failed. */
export type ReconstructionFailureReason =
  | 'empty'
  | 'mixed_page_id'
  | 'duplicate_index'
  | 'index_not_contiguous_from_1'
  | 'text_mismatch';

/** Result of a reconstruction check. `ok: true` means the invariant holds. */
export type ReconstructionResult =
  | { ok: true }
  | { ok: false; reason: ReconstructionFailureReason };

/**
 * Verify the reconstruction invariant for a set of phrases against a page's
 * `fullText`.
 *
 * Checks, in order:
 *  1. there is at least one phrase;
 *  2. all phrases share the same `pageId`;
 *  3. indexes are unique;
 *  4. indexes are contiguous from 1 (1..N with no gaps);
 *  5. concatenating `original` in ascending index order equals `fullText`.
 *
 * Does not mutate `phrases` (it sorts a shallow copy).
 */
export function checkReconstruction(
  fullText: string,
  phrases: readonly Phrase[],
): ReconstructionResult {
  if (phrases.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  const pageId = phrases[0]!.pageId;
  for (const phrase of phrases) {
    if (phrase.pageId !== pageId) {
      return { ok: false, reason: 'mixed_page_id' };
    }
  }

  const seen = new Set<number>();
  for (const phrase of phrases) {
    if (seen.has(phrase.index)) {
      return { ok: false, reason: 'duplicate_index' };
    }
    seen.add(phrase.index);
  }

  // Contiguous from 1: with unique indexes, this holds iff every value 1..N is present.
  for (let i = 1; i <= phrases.length; i++) {
    if (!seen.has(i)) {
      return { ok: false, reason: 'index_not_contiguous_from_1' };
    }
  }

  const sorted = [...phrases].sort((a, b) => a.index - b.index);
  const reconstructed = sorted.map((p) => p.original).join('');
  if (reconstructed !== fullText) {
    return { ok: false, reason: 'text_mismatch' };
  }

  return { ok: true };
}
