// Shared model plumbing: the structured-output runner abstraction, the
// ChatAnthropic factory, and a bounded-retry helper.
//
// Call sites (runOcr / analyzeText) depend only on the `StructuredRunner`
// interface, never on ChatAnthropic directly — this keeps LangChain isolated
// (North Star: Extensible) and lets tests inject a mock runner so verification
// never makes a live model call.

import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseMessageLike } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';
import type { StageConfig } from './config.js';

/**
 * Minimal structured-output runner: invoke with messages + run config, get back
 * a value already parsed/validated against the bound schema. Both the real
 * ChatAnthropic-backed runner and test mocks implement this.
 */
export interface StructuredRunner<T> {
  invoke(messages: BaseMessageLike[], config?: RunnableConfig): Promise<T>;
}

/**
 * Build a ChatAnthropic model for a stage and bind a Zod schema for structured
 * output, yielding a {@link StructuredRunner}.
 *
 * `temperature` comes from config (0). Current Anthropic models reject the
 * `temperature` parameter; pass `sendTemperature: false` (the default for the
 * production factory) to omit it from the request while keeping the value as
 * documented config.
 */
export function createStructuredRunner<S extends z.ZodTypeAny>(
  stage: StageConfig,
  apiKey: string,
  schema: S,
  opts: { sendTemperature?: boolean } = {},
): StructuredRunner<z.infer<S>> {
  const model = new ChatAnthropic({
    model: stage.model,
    apiKey,
    maxTokens: stage.maxTokens,
    ...(opts.sendTemperature ? { temperature: stage.temperature } : {}),
  });
  // withStructuredOutput returns a Runnable<input, z.infer<S>>; the StructuredRunner
  // interface is the narrow invoke-only surface we depend on.
  return model.withStructuredOutput(schema) as unknown as StructuredRunner<z.infer<S>>;
}

/** Error thrown when a transient failure persists past the retry budget. */
export class TransientLlmError extends Error {
  override readonly cause: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'TransientLlmError';
    this.cause = cause;
  }
}

/** Options for {@link withRetry}. */
export interface RetryOptions {
  /** Total attempts (initial + retries). Must be >= 1. */
  maxAttempts?: number;
  /** Base backoff in ms; attempt N waits baseDelayMs * 2^(N-1). */
  baseDelayMs?: number;
  /** Sleep function (injectable; defaults to setTimeout). */
  sleep?: (ms: number) => Promise<void>;
  /** Predicate deciding whether an error is retryable. Defaults to all errors. */
  isRetryable?: (err: unknown) => boolean;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn` with bounded exponential-backoff retries. Retries are bounded to
 * protect the latency budget and cost — we fail clearly rather than spin
 * (North Stars: Reliable, Fast & Efficient). Re-throws the last error once the
 * budget is exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 200;
  const sleep = options.sleep ?? defaultSleep;
  const isRetryable = options.isRetryable ?? (() => true);

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !isRetryable(err)) {
        throw err;
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  // Unreachable (loop either returns or throws), but satisfies the type checker.
  throw lastError;
}
