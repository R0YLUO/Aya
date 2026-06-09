// LangSmith tracing wiring.
//
// Every runOcr / analyzeText invocation runs inside a LangSmith trace. Tracing
// itself is enabled purely via environment (LANGCHAIN_TRACING_V2,
// LANGCHAIN_API_KEY, LANGCHAIN_PROJECT) — LangChain reads those directly, so no
// call site changes when toggling it (specs/05-observability.md).
//
// This module's job is the per-run slicing: attach stage / pageId / model / env
// tags and metadata to a LangChain RunnableConfig so the dashboards can answer
// "which stage dominates cost?", "trace one scan end-to-end", etc. When tracing
// is disabled the tags are harmless no-ops — invocation still works, nothing
// throws.

import type { RunnableConfig } from '@langchain/core/runnables';

/** Pipeline stage a run belongs to. */
export type Stage = 'ocr' | 'analysis';

/** Inputs used to tag a single LLM run. */
export interface RunTagInput {
  stage: Stage;
  /** The Page this run is part of; omitted for runs not tied to a page (e.g. evals). */
  pageId?: string;
  /** Resolved model id for the stage. */
  model: string;
  /** Deployment environment, e.g. "prod" / "dev". Defaults from AYA_ENV / LANGCHAIN env. */
  env?: string;
}

/**
 * Structured metadata attached to a run (mirrors the tags as key/value pairs).
 *
 * Carries an index signature so it satisfies LangChain's
 * `RunnableConfig["metadata"]` (`Record<string, unknown>`) without a cast.
 */
export interface RunMetadata {
  stage: Stage;
  model: string;
  env: string;
  pageId?: string;
  [key: string]: unknown;
}

/** Read the deployment environment label from the environment, defaulting to "dev". */
function resolveEnv(
  explicit: string | undefined,
  env: Record<string, string | undefined>,
): string {
  if (explicit !== undefined && explicit.trim() !== '') return explicit;
  const fromEnv = env['AYA_ENV'];
  if (fromEnv !== undefined && fromEnv.trim() !== '') return fromEnv;
  return 'dev';
}

/**
 * Whether LangSmith tracing is enabled, per `LANGCHAIN_TRACING_V2`.
 *
 * Treats only "true"/"1" (case-insensitive) as enabled; unset, "false", "0", or
 * anything else is disabled. Calls still work when disabled — this only governs
 * whether traces are recorded.
 */
export function isTracingEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env['LANGCHAIN_TRACING_V2'];
  if (raw === undefined) return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1';
}

/**
 * Build the structured run metadata for a stage invocation.
 *
 * Pure and deterministic for a given input + env — the unit tests assert this
 * object directly.
 */
export function buildRunMetadata(
  input: RunTagInput,
  env: Record<string, string | undefined> = process.env,
): RunMetadata {
  const metadata: RunMetadata = {
    stage: input.stage,
    model: input.model,
    env: resolveEnv(input.env, env),
  };
  if (input.pageId !== undefined) {
    metadata.pageId = input.pageId;
  }
  return metadata;
}

/**
 * Build a LangChain RunnableConfig that tags the run with stage / pageId / model
 * / env. Pass the result as the second argument to a chain's `.invoke(...)`.
 *
 * Always returns a valid config, whether or not tracing is enabled — when
 * disabled the tags are simply never shipped anywhere.
 */
export function buildRunConfig(
  input: RunTagInput,
  env: Record<string, string | undefined> = process.env,
): RunnableConfig {
  const metadata = buildRunMetadata(input, env);
  const tags = [
    `stage:${metadata.stage}`,
    `model:${metadata.model}`,
    `env:${metadata.env}`,
  ];
  if (metadata.pageId !== undefined) {
    tags.push(`pageId:${metadata.pageId}`);
  }
  return {
    runName: `aya-${metadata.stage}`,
    tags,
    metadata,
  };
}
