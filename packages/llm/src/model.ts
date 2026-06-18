// Shared model plumbing: the provider-agnostic structured-output runner factory
// and a bounded-retry helper.
//
// Call sites (runOcr / analyzeText) depend only on the `StructuredRunner`
// interface, never on a concrete provider class — this keeps LangChain isolated
// (North Star: Extensible) and lets tests inject a mock runner so verification
// never makes a live model call. The real runner is built by LangChain's universal
// `initChatModel`, so the provider (Anthropic / Gemini / OpenAI / …) is selected
// purely from a {@link ModelSpec} resolved out of env — no provider-specific code
// lives here.

import { initChatModel } from 'langchain/chat_models/universal';
import type { BaseMessageLike } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';
import type { ModelSpec } from './config.js';

/**
 * Minimal structured-output runner: invoke with messages + run config, get back
 * a value already parsed/validated against the bound schema. Both the real
 * provider-backed runner and test mocks implement this.
 */
export interface StructuredRunner<T> {
  invoke(messages: BaseMessageLike[], config?: RunnableConfig): Promise<T>;
}

/**
 * Build a provider-agnostic chat model for a stage and bind a Zod schema for
 * structured output, yielding a {@link StructuredRunner}.
 *
 * The provider, model id, key, and token ceiling all come from the {@link ModelSpec}
 * (resolved from env). `temperature` is 0 but only sent when the provider accepts it
 * (`spec.sendTemperature`) — current Anthropic models reject the param while Gemini /
 * OpenAI want it for determinism. The token ceiling is passed under the provider's
 * own field name (`maxTokens` vs Gemini's `maxOutputTokens`).
 *
 * Async because `initChatModel` dynamically imports the provider integration package.
 */
export async function createStructuredRunner<S extends z.ZodTypeAny>(
  spec: ModelSpec,
  schema: S,
): Promise<StructuredRunner<z.infer<S>>> {
  const model = await initChatModel(spec.model, {
    modelProvider: spec.provider,
    apiKey: spec.apiKey,
    [spec.maxTokensField]: spec.maxTokens,
    ...(spec.sendTemperature ? { temperature: spec.temperature } : {}),
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
