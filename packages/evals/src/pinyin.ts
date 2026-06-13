// Deterministic pinyin scorer (specs/06-evals.md, dimension 3).
//
// Compares the model's pinyin for a token to a pinyin library's reading of the
// SAME characters (pinyin-pro), reporting per-token match/mismatch and a batch
// mismatch rate. The library is the deterministic reference; this is NOT an
// LLM-as-judge — it is a cheap, repeatable guard that the model didn't hand back
// a flatly wrong reading.
//
// Chinese is full of polyphones (多音字): a character can have several valid
// readings depending on context, and a context-free library lookup may pick a
// different (but still correct) reading than the model did. To avoid penalising
// those, mismatches are forgiven in two ways:
//   1. Per-character fallback — for a single-character token, ANY of that
//      character's valid readings (pinyin-pro `multiple`) counts as a match.
//   2. A known-polyphone exception list — tokens (or tone-insensitive readings)
//      where the library and a human could legitimately disagree (tone sandhi on
//      一/不, neutral-tone particles, proper-noun readings, etc.). These are
//      flagged as `polyphoneException` and excluded from the mismatch rate.

import { pinyin } from 'pinyin-pro';

/**
 * Normalise a pinyin string for comparison: lower-case, collapse internal
 * whitespace to single spaces, and trim. This makes the comparison insensitive
 * to capitalisation (proper nouns like `Lǔ Xùn` vs `lǔ xùn`) and to spacing
 * differences, while keeping tone marks significant.
 */
export function normalizePinyin(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The pinyin library's reference reading for a token's characters, tone marks
 * included, syllables space-separated (e.g. `画蛇添足` → `huà shé tiān zú`).
 * This is the contextual reading pinyin-pro picks for the token as a whole.
 */
export function referencePinyin(token: string): string {
  return pinyin(token, { toneType: 'symbol', type: 'string' });
}

/**
 * All valid readings of a single character (pinyin-pro `multiple`), normalised
 * and de-duplicated. Used as a per-character polyphone fallback: any of these
 * counts as a match for a one-character token. Returns an empty array for
 * multi-character input (use {@link referencePinyin} there).
 */
export function characterReadings(char: string): string[] {
  if ([...char].length !== 1) return [];
  const all = pinyin(char, { toneType: 'symbol', multiple: true, type: 'string' });
  const seen = new Set<string>();
  for (const reading of all.split(' ')) {
    const norm = normalizePinyin(reading);
    if (norm) seen.add(norm);
  }
  return [...seen];
}

/**
 * Strip tone marks from a normalised pinyin string, leaving the bare syllables
 * (e.g. `yì qǐ` → `yi qi`). Used by the exception list to forgive tone-only
 * differences (tone sandhi, neutral tones) where the base reading is right.
 */
export function stripTones(value: string): string {
  return normalizePinyin(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining tone diacritics
    .normalize('NFC');
}

/**
 * Known-polyphone exceptions: tokens whose pinyin the model and a context-free
 * library can legitimately disagree on, so a mismatch here is NOT a real error.
 * Keyed by token; the value is the set of additional acceptable readings beyond
 * the library's own (normalised). A token present here with an empty set means
 * "accept a tone-only difference" (handled in {@link scorePinyin}).
 *
 * Kept deliberately small and explicit — every entry is a documented reading,
 * not a blanket exemption. Extend it as real eval cases surface new polyphones.
 */
export const DEFAULT_POLYPHONE_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = {
  // 一 / 不 take tone sandhi in context; both the toned and neutral library
  // forms are acceptable depending on how the model rendered the phrase.
  一起: ['yī qǐ', 'yì qǐ'],
  // 着 as a particle is neutral-tone `zhe`, but library readings vary (zhāo/zháo).
  望着: ['wàng zhe'],
  // 的 is almost always the neutral particle `de`, but the library also knows
  // dì / dí; accept all so a particle reading is never flagged.
  的: ['de', 'dì', 'dí'],
};

/** The result of scoring a single token's pinyin against the library reference. */
export interface PinyinScore {
  /** The token (one or more Chinese characters) under evaluation. */
  token: string;
  /** The model's predicted pinyin, as given (un-normalised). */
  predicted: string;
  /** The pinyin library's reference reading for the same characters. */
  reference: string;
  /** True when predicted matches the reference (or an accepted polyphone reading). */
  match: boolean;
  /**
   * True when the predicted reading differs from the library's primary reading
   * but is a recognised valid alternative (a single-char alternate reading or a
   * listed exception). Such tokens are matches AND are excluded from the
   * mismatch rate as "expected" disagreements.
   */
  polyphoneException: boolean;
}

/**
 * Score one token's predicted pinyin against the pinyin library's reading of the
 * same characters. A match is recorded when, after normalisation (case/spacing
 * insensitive, tone marks significant):
 *   - the predicted pinyin equals the library reference, OR
 *   - the token is a single character and the prediction is any of that
 *     character's valid readings (polyphone fallback), OR
 *   - the prediction appears in the token's known-polyphone exception list, OR
 *     the token is listed and the prediction differs only in tone.
 * The last three cases set `polyphoneException` so they can be reported but not
 * counted against the mismatch rate.
 */
export function scorePinyin(
  token: string,
  predicted: string,
  exceptions: Readonly<
    Record<string, readonly string[]>
  > = DEFAULT_POLYPHONE_EXCEPTIONS,
): PinyinScore {
  const reference = referencePinyin(token);
  const normPred = normalizePinyin(predicted);
  const normRef = normalizePinyin(reference);

  const base: Omit<PinyinScore, 'match' | 'polyphoneException'> = {
    token,
    predicted,
    reference,
  };

  // 1. Exact (normalised) match against the library's contextual reading.
  if (normPred === normRef) {
    return { ...base, match: true, polyphoneException: false };
  }

  // 2. Single-character polyphone fallback: any valid reading of the char.
  if ([...token].length === 1 && characterReadings(token).includes(normPred)) {
    return { ...base, match: true, polyphoneException: true };
  }

  // 3. Known-polyphone exception list for this token.
  const accepted = exceptions[token];
  if (accepted) {
    const acceptedNorm = accepted.map(normalizePinyin);
    if (acceptedNorm.includes(normPred)) {
      return { ...base, match: true, polyphoneException: true };
    }
    // A listed token also forgives a tone-only difference from the reference.
    if (stripTones(normPred) === stripTones(normRef)) {
      return { ...base, match: true, polyphoneException: true };
    }
  }

  // Otherwise it's a genuine mismatch.
  return { ...base, match: false, polyphoneException: false };
}

/** One token to score: the characters and the model's predicted pinyin. */
export interface PinyinExample {
  token: string;
  predicted: string;
}

/** Aggregate pinyin summary over a batch of tokens. */
export interface PinyinSummary {
  /** Per-token scores, in input order. */
  rows: PinyinScore[];
  /** Total tokens scored. */
  total: number;
  /** Tokens that matched the reference (includes polyphone exceptions). */
  matched: number;
  /** Tokens flagged as known/expected polyphone disagreements (a subset of matched). */
  polyphoneExceptions: number;
  /** Genuine mismatches (not matched, not excused as a polyphone). */
  mismatches: number;
  /**
   * Mismatch rate over the tokens that are NOT polyphone exceptions:
   * `mismatches / (total - polyphoneExceptions)`. 0 when there are no scorable
   * tokens. The PRD targets near-0 (near-100% pinyin correctness on common
   * vocabulary).
   */
  mismatchRate: number;
}

/**
 * Score a batch of tokens and summarise them. Polyphone exceptions are reported
 * but excluded from the denominator of {@link PinyinSummary.mismatchRate} — they
 * are expected disagreements, not model errors — so the rate reflects only
 * genuine mistakes against the deterministic reference.
 */
export function summarisePinyin(
  examples: readonly PinyinExample[],
  exceptions: Readonly<
    Record<string, readonly string[]>
  > = DEFAULT_POLYPHONE_EXCEPTIONS,
): PinyinSummary {
  const rows = examples.map((e) => scorePinyin(e.token, e.predicted, exceptions));
  const total = rows.length;
  const matched = rows.filter((r) => r.match).length;
  const polyphoneExceptions = rows.filter((r) => r.polyphoneException).length;
  const mismatches = rows.filter((r) => !r.match).length;
  const denominator = total - polyphoneExceptions;
  const mismatchRate = denominator === 0 ? 0 : mismatches / denominator;
  return { rows, total, matched, polyphoneExceptions, mismatches, mismatchRate };
}
