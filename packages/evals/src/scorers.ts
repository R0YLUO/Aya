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

/**
 * PRD KPI: clear pages must reach ≥95% OCR character accuracy
 * (specs/06-evals.md, north star "Accurate"). Used by `summariseCer` to flag
 * examples that fall short.
 */
export const CER_ACCURACY_TARGET = 0.95;

/** The CER score for a single example: error rate plus derived accuracy. */
export interface CerScore {
  /**
   * Character Error Rate (edit distance / gold length); 0 is perfect. Can exceed
   * 1 when the prediction is much longer than the gold (more edits than gold
   * characters) — this is the standard CER definition, normalised by gold length.
   */
  cer: number;
  /** Character accuracy = 1 - CER, clamped to [0, 1]; 1 is perfect, never negative. */
  accuracy: number;
}

/**
 * Score one OCR prediction against its gold `fullText`, returning both the CER
 * and the derived accuracy. `accuracy` is always in [0, 1]; `cer` is ≥0 and may
 * exceed 1 for wildly long predictions. Identical strings score accuracy 1.0;
 * an empty gold scores accuracy 1.0 only when the prediction is also empty.
 * This is the single entry point the OCR eval stage should use.
 */
export function scoreCER(predicted: string, expected: string): CerScore {
  const cer = characterErrorRate(predicted, expected);
  return { cer, accuracy: Math.max(0, 1 - cer) };
}

/** One row of a CER summary: an example id, its score, and whether it passed. */
export interface CerSummaryRow {
  id: string;
  cer: number;
  accuracy: number;
  /** True when `accuracy >= target`. */
  passed: boolean;
}

/** Aggregate CER summary over a set of OCR examples. */
export interface CerSummary {
  rows: CerSummaryRow[];
  /** Mean character accuracy across all examples (0 when empty). */
  meanAccuracy: number;
  /** The accuracy threshold each example is judged against. */
  target: number;
  /** Examples whose accuracy fell below `target` — the ones needing attention. */
  belowTarget: CerSummaryRow[];
  /** True when every example met `target` (vacuously true when empty). */
  allPassed: boolean;
}

/** One predicted/gold pair to score, identified for the summary. */
export interface CerExample {
  id: string;
  predicted: string;
  expected: string;
}

/**
 * Score a batch of OCR examples and summarise them, flagging every example whose
 * character accuracy fell below `target` (default {@link CER_ACCURACY_TARGET}).
 * The summary surfaces the laggards (`belowTarget`) so a run can report — or gate
 * on — pages that miss the PRD's ≥95% accuracy KPI.
 */
export function summariseCer(
  examples: readonly CerExample[],
  target: number = CER_ACCURACY_TARGET,
): CerSummary {
  const rows: CerSummaryRow[] = examples.map((e) => {
    const { cer, accuracy } = scoreCER(e.predicted, e.expected);
    return { id: e.id, cer, accuracy, passed: accuracy >= target };
  });
  const meanAccuracy =
    rows.length === 0 ? 0 : rows.reduce((a, r) => a + r.accuracy, 0) / rows.length;
  const belowTarget = rows.filter((r) => !r.passed);
  return {
    rows,
    meanAccuracy,
    target,
    belowTarget,
    allPassed: belowTarget.length === 0,
  };
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

/** The segmentation-stage score: boundary precision/recall/F1 plus idiom splits. */
export interface SegmentationScore extends BoundaryScore {
  /**
   * How many gold idioms (multi-character whole phrases) the prediction split.
   * Must stay 0 — any positive value is a hard failure (specs/06-evals.md:
   * idioms are never split), independent of the F1 score.
   */
  idiomSplitCount: number;
}

/**
 * Score a predicted segmentation against a gold one — the single entry point the
 * analysis/segmentation eval stage should use. `goldBoundaries` is the gold token
 * list (ordered `original` strings whose join reconstructs the page text); the
 * predicted tokens are scored against it.
 *
 * Returns phrase-boundary `precision`/`recall`/`f1` (via {@link boundaryF1}) plus
 * an `idiomSplitCount`: the number of gold multi-character phrases the prediction
 * failed to keep whole (via {@link idiomSplitCount}, with every multi-char gold
 * token treated as an idiom to keep intact). A perfect match yields `f1` 1.0 and
 * `idiomSplitCount` 0; any split idiom is a hard failure callers must surface.
 */
export function scoreSegmentation(
  predTokens: readonly string[],
  goldBoundaries: readonly string[],
): SegmentationScore {
  const goldIdioms = goldBoundaries.filter((t) => t.length > 1);
  return {
    ...boundaryF1(predTokens, goldBoundaries),
    idiomSplitCount: idiomSplitCount(predTokens, goldIdioms),
  };
}

/**
 * The structural invariant — phrases.join("") === fullText, indexes 1-based and
 * contiguous. Delegates to the shared check so eval and production agree. An
 * automatic fail independent of quality scores.
 */
export function reconstructionPass(fullText: string, phrases: readonly Phrase[]): boolean {
  return checkReconstruction(fullText, phrases).ok;
}
