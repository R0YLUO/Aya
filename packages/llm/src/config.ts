// Model configuration for the LLM pipeline.
//
// Model id, temperature, and max tokens are CONFIGURATION, not hard-coded
// literals (CLAUDE.md golden rule #9; specs/04-llm-pipeline.md). Ids come from
// the environment so we can upgrade models or tune per stage without touching
// call sites. No Claude model id string appears in this source.
//
// Both stages run at temperature 0 for determinism and reproducibility in an
// accuracy-critical, eval-gated pipeline (North Stars: Accurate, Reliable).

/** Per-stage model configuration. */
export interface StageConfig {
  /** Claude model id, sourced from env. */
  readonly model: string;
  /** Always 0 — deterministic, reproducible output. */
  readonly temperature: 0;
  /** Output token ceiling for the stage. */
  readonly maxTokens: number;
}

/** Resolved configuration for both pipeline stages plus the API key. */
export interface LlmConfig {
  readonly ocr: StageConfig;
  readonly analysis: StageConfig;
  /** Anthropic API key (secret — never logged). */
  readonly apiKey: string;
}

/** Default per-stage output token ceilings (specs/04-llm-pipeline.md). */
export const OCR_MAX_TOKENS = 4096;
export const ANALYSIS_MAX_TOKENS = 8192;

/** Source of environment values; defaults to `process.env`. Injectable for tests. */
export type Env = Record<string, string | undefined>;

function requireEnv(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in the deployment environment (no secrets or model ids in code).`,
    );
  }
  return value;
}

/**
 * Build the LLM configuration from the environment.
 *
 * Reads:
 *  - `AYA_OCR_MODEL`       — model id for the OCR (vision) stage
 *  - `AYA_ANALYSIS_MODEL`  — model id for the analysis stage
 *  - `ANTHROPIC_API_KEY`   — Anthropic API key
 *
 * Throws a clear error if any required value is missing. Temperature is fixed
 * at 0 for both stages.
 */
export function loadLlmConfig(env: Env = process.env): LlmConfig {
  const ocrModel = requireEnv(env, 'AYA_OCR_MODEL');
  const analysisModel = requireEnv(env, 'AYA_ANALYSIS_MODEL');
  const apiKey = requireEnv(env, 'ANTHROPIC_API_KEY');

  return {
    ocr: { model: ocrModel, temperature: 0, maxTokens: OCR_MAX_TOKENS },
    analysis: { model: analysisModel, temperature: 0, maxTokens: ANALYSIS_MAX_TOKENS },
    apiKey,
  };
}
