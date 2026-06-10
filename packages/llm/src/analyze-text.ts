// Call ② — analyzeText.
//
// Segments fullText into Phrase[] using structured LLM output, enforces the
// reconstruction invariant (checkReconstruction), and assigns uuid ids before
// returning. On a first-attempt reconstruction mismatch, retries once with the
// discrepancy fed back to the model; a persistent failure throws AnalysisFailedError.
// Transient / parse errors retry once via withRetry (specs/04-llm-pipeline.md).

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessageLike } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';
import type { Phrase } from '@aya/shared';
import { checkReconstruction } from '@aya/shared';
import { loadLlmConfig, type Env } from './config.js';
import { AnalysisResultSchema, buildAnalysisSystemPrompt } from './analysis.js';
import type { AnalysisResult } from './analysis.js';
import {
  createStructuredRunner,
  withRetry,
  type RetryOptions,
  type StructuredRunner,
} from './model.js';
import { buildRunConfig } from './tracing.js';

/** Thrown when reconstruction check fails even after one retry. */
export class AnalysisFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisFailedError';
  }
}

/** Options for {@link analyzeText} (mostly for tests and call-site overrides). */
export interface AnalyzeTextOptions {
  /** Inject a structured runner (tests). Defaults to a ChatAnthropic-backed one. */
  runner?: StructuredRunner<AnalysisResult>;
  /** Retry tuning for transient/parse errors (maxAttempts defaults to 2). */
  retry?: RetryOptions;
  /** Environment source for config (tests). */
  env?: Env;
}

function buildAnalysisMessages(
  fullText: string,
  feedbackHint?: string,
): BaseMessageLike[] {
  const text =
    feedbackHint !== undefined
      ? `${fullText}\n\n[CORRECTION REQUIRED — your previous response failed the reconstruction check (${feedbackHint}). Re-analyse so that tokens.map(t => t.original).join("") reproduces the passage EXACTLY.]`
      : fullText;
  return [new SystemMessage(buildAnalysisSystemPrompt()), new HumanMessage(text)];
}

/**
 * Segment and analyse `fullText` into a validated, ordered {@link Phrase[]}.
 *
 * Enforces the shared reconstruction invariant. On a reconstruction mismatch,
 * retries once with a feedback hint. On persistent failure throws
 * {@link AnalysisFailedError}. Transient / parse errors are retried once via
 * {@link withRetry} before propagating.
 */
export async function analyzeText(
  fullText: string,
  pageId: string,
  options: AnalyzeTextOptions = {},
): Promise<Phrase[]> {
  let runner = options.runner;
  let model = 'unknown';
  if (runner === undefined) {
    const cfg = loadLlmConfig(options.env);
    model = cfg.analysis.model;
    runner = createStructuredRunner(cfg.analysis, cfg.apiKey, AnalysisResultSchema);
  }

  const runConfig = buildRunConfig({ stage: 'analysis', model, pageId }, options.env);
  // One bounded retry for transient / parse errors.
  const retryOpts: RetryOptions = { maxAttempts: 2, ...options.retry };

  let feedbackHint: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const messages = buildAnalysisMessages(fullText, feedbackHint);

    const result = await withRetry(async () => {
      const raw = await runner!.invoke(messages, runConfig);
      return AnalysisResultSchema.parse(raw);
    }, retryOpts);

    const phrases: Phrase[] = result.tokens
      .map((token) => ({
        id: uuidv4(),
        pageId,
        index: token.index,
        original: token.original,
        pinyin: token.pinyin,
        translation: token.translation,
        contextualMeaning: token.contextualMeaning,
      }))
      .sort((a, b) => a.index - b.index);

    const check = checkReconstruction(fullText, phrases);
    if (check.ok) {
      return phrases;
    }

    if (attempt === 1) {
      const joined = phrases.map((p) => p.original).join('');
      feedbackHint = `reason=${check.reason}, got="${joined}", expected="${fullText}"`;
    }
  }

  throw new AnalysisFailedError(
    `analyzeText: reconstruction check failed after retry (${feedbackHint ?? 'unknown'})`,
  );
}
