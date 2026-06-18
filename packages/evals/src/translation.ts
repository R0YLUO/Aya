// LLM-as-judge translation scorer (specs/06-evals.md, dimension 4).
//
// Unlike CER / segmentation / pinyin — which are deterministic library checks —
// translation quality is graded by a SECOND LLM call acting as a judge. The
// judge scores three fixed rubric dimensions (faithfulness, contextual
// correctness, fluency) on a fixed 1–5 scale and we apply a pass/fail threshold.
//
// Determinism & config (golden rules #7, #9): the judge runs at temperature 0
// and its provider + model id come from env (`AYA_JUDGE_PROVIDER` /
// `AYA_JUDGE_MODEL`) — never hard-coded here.
// Following the same dependency-injection pattern the rest of the LLM code uses
// (brain/concepts/structured-llm-output.md), callers may inject a `StructuredRunner`
// so tests grade fixed judge output with zero network; the real runner is built
// lazily from config only when none is injected.

import { z } from 'zod';
import {
  createStructuredRunner,
  withRetry,
  parseProviderId,
  PROVIDERS,
  type Env,
  type ModelSpec,
  type StructuredRunner,
} from '@aya/llm';

/** The fixed rubric scale. Each dimension is an integer 1 (worst) … 5 (best). */
export const JUDGE_SCALE_MIN = 1;
export const JUDGE_SCALE_MAX = 5;

/**
 * Default pass threshold: every dimension must be >= 4 on the 1–5 scale for a
 * translation to pass. Configurable per call via `options.threshold`.
 */
export const DEFAULT_JUDGE_THRESHOLD = 4;

/** Output token ceiling for the judge — it returns three scores + short notes. */
export const JUDGE_MAX_TOKENS = 1024;

const ScoreField = z.number().int().min(JUDGE_SCALE_MIN).max(JUDGE_SCALE_MAX);

/**
 * The structured rubric the judge must return. Scores are integers on the fixed
 * 1–5 scale; `rationale` is a short free-text justification (logged, not scored).
 */
export const JudgeRubricSchema = z.object({
  faithfulness: ScoreField,
  contextualCorrectness: ScoreField,
  fluency: ScoreField,
  rationale: z.string(),
});

export type JudgeRubric = z.infer<typeof JudgeRubricSchema>;

/** The three rubric dimensions, in fixed order. */
export const JUDGE_DIMENSIONS = [
  'faithfulness',
  'contextualCorrectness',
  'fluency',
] as const;

export type JudgeDimension = (typeof JUDGE_DIMENSIONS)[number];

/** The full result of scoring one translation: per-dimension scores + verdict. */
export interface TranslationScore {
  faithfulness: number;
  contextualCorrectness: number;
  fluency: number;
  /** The free-text rationale the judge gave (for review; not part of pass/fail). */
  rationale: string;
  /** The threshold each dimension was judged against. */
  threshold: number;
  /** True iff EVERY dimension met or exceeded the threshold. */
  pass: boolean;
}

/** Options for {@link scoreTranslation}. */
export interface ScoreTranslationOptions {
  /**
   * Inject a judge runner (offline scoring / tests). When omitted, a real
   * provider-agnostic runner is built from `env` — which then requires the judge
   * provider, model id, and that provider's API key to be present.
   */
  runner?: StructuredRunner<JudgeRubric>;
  /** Env source for judge model config. Defaults to process.env. */
  env?: Env;
  /** Pass threshold (each dimension must be >= this). Defaults to 4. */
  threshold?: number;
}

/**
 * Resolve the judge model spec from the environment. The judge is provider-agnostic
 * just like the pipeline: its provider comes from `AYA_JUDGE_PROVIDER` (falling back
 * to `AYA_LLM_PROVIDER`) so it can be pinned to a fixed strong model while candidate
 * models vary across an eval-comparison matrix. The judge model id is CONFIGURATION
 * (golden rule #9): `AYA_JUDGE_MODEL`, never a literal in code. Temperature is fixed
 * at 0 for repeatability (specs/06-evals.md); whether it is sent is per-provider.
 */
export function loadJudgeConfig(env: Env = process.env): ModelSpec {
  const providerRaw =
    env['AYA_JUDGE_PROVIDER']?.trim() || requireEnv(env, 'AYA_LLM_PROVIDER');
  const provider = parseProviderId(providerRaw);
  const info = PROVIDERS[provider];
  return {
    provider,
    model: requireEnv(env, 'AYA_JUDGE_MODEL'),
    temperature: 0,
    maxTokens: JUDGE_MAX_TOKENS,
    apiKey: requireEnv(env, info.keyEnv),
    sendTemperature: info.sendTemperature,
    maxTokensField: info.maxTokensField,
  };
}

function requireEnv(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in the environment (no judge model ids or secrets in code).`,
    );
  }
  return value;
}

/**
 * Build the judge system prompt. A builder function returning the literal string
 * so prompt tweaks are diff-tracked and eval-gated (same convention as the
 * runOcr / analyzeText prompts).
 */
export function buildJudgeSystemPrompt(): string {
  return [
    'You are an expert bilingual (Simplified Chinese ⇄ English) translation grader.',
    'You will be given a Chinese phrase, the full passage it appears in (its',
    'context), and reference notes describing what a good translation must capture',
    'and what it must avoid. Grade the phrase\'s translation/contextual meaning on',
    'THREE dimensions, each an integer from 1 (poor) to 5 (excellent):',
    '',
    '1. faithfulness — Does it accurately convey the phrase\'s meaning without',
    '   adding, dropping, or distorting information?',
    '2. contextualCorrectness — Does it reflect how the phrase is actually used in',
    '   THIS passage (idiomatic / context-dependent sense), not just a literal or',
    '   dictionary gloss? Use the reference notes as the rubric.',
    '3. fluency — Is the English natural and grammatical?',
    '',
    'Return ONLY the structured object: integer scores for faithfulness,',
    'contextualCorrectness, and fluency, plus a one-sentence rationale. Do not',
    'invent dimensions or use any scale other than 1–5.',
  ].join('\n');
}

/**
 * Build the human message handed to the judge for one translation.
 */
export function buildJudgeUserMessage(
  phrase: string,
  context: string,
  candidate: string,
  referenceNotes: string,
): string {
  return [
    `Phrase under evaluation: ${phrase}`,
    `Passage (context): ${context}`,
    `Candidate translation / contextual meaning: ${candidate}`,
    `Reference notes (rubric): ${referenceNotes}`,
  ].join('\n');
}

/**
 * Score a candidate translation of `phrase` (as used in `context`) against the
 * `referenceNotes` rubric, using an LLM judge.
 *
 * @param phrase          The Chinese phrase under evaluation.
 * @param context         The passage that disambiguates the phrase's meaning.
 * @param candidate       The translation / contextual meaning being graded.
 * @param referenceNotes  Rubric notes: what a good answer captures / avoids.
 */
export async function scoreTranslation(
  phrase: string,
  context: string,
  candidate: string,
  referenceNotes: string,
  options: ScoreTranslationOptions = {},
): Promise<TranslationScore> {
  const threshold = options.threshold ?? DEFAULT_JUDGE_THRESHOLD;
  const runner = options.runner ?? (await buildJudgeRunner(options.env));

  const messages = [
    { role: 'system', content: buildJudgeSystemPrompt() },
    {
      role: 'user',
      content: buildJudgeUserMessage(phrase, context, candidate, referenceNotes),
    },
  ];

  const raw = await withRetry(() => runner.invoke(messages), { maxAttempts: 2 });
  // Defensive re-parse: never trust unvalidated runner output (golden rule #3).
  const rubric = JudgeRubricSchema.parse(raw);

  const pass =
    rubric.faithfulness >= threshold &&
    rubric.contextualCorrectness >= threshold &&
    rubric.fluency >= threshold;

  return {
    faithfulness: rubric.faithfulness,
    contextualCorrectness: rubric.contextualCorrectness,
    fluency: rubric.fluency,
    rationale: rubric.rationale,
    threshold,
    pass,
  };
}

/** Lazily build the real provider-agnostic judge runner from env config. */
function buildJudgeRunner(env: Env = process.env): Promise<StructuredRunner<JudgeRubric>> {
  return createStructuredRunner(loadJudgeConfig(env), JudgeRubricSchema);
}
