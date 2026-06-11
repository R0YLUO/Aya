// Deterministic scorers (specs/06-evals.md).
//
// These are pure functions over a prediction + gold, with no network or model
// calls, so they run identically locally and in CI. The LLM-as-judge translation
// scorer is intentionally out of scope for this scaffold (it needs the Anthropic
// key — see the anthropic-api-key handoff); it slots in here later.

import { checkReconstruction } from '@aya/shared';
import type { Phrase } from '@aya/shared';

/** Levenshtein edit distance between two strings (character-level). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Two-row DP, O(min) space.
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1, // deletion
        (curr[j - 1] ?? 0) + 1, // insertion
        (prev[j - 1] ?? 0) + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? 0;
}

/**
 * Character Error Rate of `predicted` vs gold `expected`: edit distance
 * normalised by the gold length. 0 is perfect. Character accuracy is `1 - CER`
 * (clamped at 0). An empty gold scores CER 0 when predicted is also empty, else 1.
 */
export function characterErrorRate(predicted: string, expected: string): number {
  if (expected.length === 0) return predicted.length === 0 ? 0 : 1;
  return editDistance(predicted, expected) / expected.length;
}

/** Convenience: character accuracy = 1 - CER, clamped to [0, 1]. */
export function characterAccuracy(predicted: string, expected: string): number {
  return Math.max(0, 1 - characterErrorRate(predicted, expected));
}

export interface BoundaryScore {
  /** Boundary precision: fraction of predicted cut points that are correct. */
  precision: number;
  /** Boundary recall: fraction of gold cut points that were predicted. */
  recall: number;
  /** Harmonic mean of precision and recall. */
  f1: number;
}

/**
 * Convert an ordered token segmentation into the set of interior boundary offsets
 * (cumulative character positions, excluding 0 and the final length). Two
 * segmentations of the SAME underlying text agree exactly where these sets match.
 */
function boundaryOffsets(tokens: readonly string[]): Set<number> {
  const offsets = new Set<number>();
  let pos = 0;
  for (let i = 0; i < tokens.length - 1; i++) {
    pos += (tokens[i] ?? '').length;
    offsets.add(pos);
  }
  return offsets;
}

/**
 * Phrase-boundary F1 of a predicted segmentation vs the gold one. Both are
 * ordered lists of token strings over the same text; we compare their interior
 * cut points. Returns precision/recall/F1 (all 1 when both have no interior cuts).
 */
export function boundaryF1(
  predicted: readonly string[],
  gold: readonly string[],
): BoundaryScore {
  const p = boundaryOffsets(predicted);
  const g = boundaryOffsets(gold);
  let tp = 0;
  for (const offset of p) if (g.has(offset)) tp++;
  const fp = p.size - tp;
  const fn = g.size - tp;
  const precision = p.size === 0 ? 1 : tp / (tp + fp);
  const recall = g.size === 0 ? 1 : tp / (tp + fn);
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

/**
 * Count how many gold idioms (multi-character whole phrases) the prediction
 * SPLIT — i.e. a gold token that does not appear intact as one predicted token.
 * This must stay at zero (specs/06-evals.md: idioms never split).
 */
export function idiomSplitCount(
  predicted: readonly string[],
  goldIdioms: readonly string[],
): number {
  const predictedSet = new Set(predicted);
  let split = 0;
  for (const idiom of goldIdioms) {
    if (idiom.length > 1 && !predictedSet.has(idiom)) split++;
  }
  return split;
}

/**
 * The structural invariant — phrases.join("") === fullText, indexes 1-based and
 * contiguous. Delegates to the shared check so eval and production agree. An
 * automatic fail independent of quality scores.
 */
export function reconstructionPass(fullText: string, phrases: readonly Phrase[]): boolean {
  return checkReconstruction(fullText, phrases).ok;
}
