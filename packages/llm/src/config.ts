// Model configuration for the LLM pipeline.
//
// The pipeline is PROVIDER-AGNOSTIC: the provider, model id, and per-stage token
// ceilings are CONFIGURATION, not hard-coded literals (CLAUDE.md golden rule #9;
// specs/04-llm-pipeline.md). No provider name or model id string is hard-wired as a
// default — the supported providers live in the PROVIDERS table below and the active
// one is chosen entirely by env (`AYA_LLM_PROVIDER`). Switching Anthropic → Gemini →
// OpenAI is a config change, never a code change (North Star: Extensible).
//
// Both stages run at temperature 0 for determinism and reproducibility in an
// accuracy-critical, eval-gated pipeline (North Stars: Accurate, Reliable). Whether
// temperature is actually sent is per-provider — some models reject the param (see
// `sendTemperature` and brain/decisions/temperature-param-omitted.md).

/** Providers Aya can route to via LangChain's `initChatModel`. */
export type ProviderId = 'anthropic' | 'google-genai' | 'openai';

/** Static per-provider facts the runner factory needs. */
export interface ProviderInfo {
  /** Env var holding this provider's API key. */
  readonly keyEnv: string;
  /** Whether this provider accepts a `temperature` param (current Anthropic models reject it). */
  readonly sendTemperature: boolean;
  /** The constructor field this provider uses for the output-token ceiling. */
  readonly maxTokensField: 'maxTokens' | 'maxOutputTokens';
}

/**
 * The single registry of supported providers. Adding a provider is a one-line
 * entry here plus installing its `@langchain/*` integration package — no call-site
 * changes. This table is the ONLY place provider names appear in source.
 */
export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: { keyEnv: 'ANTHROPIC_API_KEY', sendTemperature: false, maxTokensField: 'maxTokens' },
  'google-genai': {
    keyEnv: 'GOOGLE_API_KEY',
    sendTemperature: true,
    maxTokensField: 'maxOutputTokens',
  },
  openai: { keyEnv: 'OPENAI_API_KEY', sendTemperature: true, maxTokensField: 'maxTokens' },
};

/** The supported provider ids, derived from {@link PROVIDERS}. */
export const SUPPORTED_PROVIDERS = Object.keys(PROVIDERS) as ProviderId[];

/**
 * Fully-resolved spec for one pipeline stage: everything the runner factory needs
 * to build a provider-agnostic chat model. Carries its own provider + key so a
 * single eval run can mix providers across stages.
 */
export interface ModelSpec {
  readonly provider: ProviderId;
  /** Provider-native model id, sourced from env. */
  readonly model: string;
  /** Always 0 — deterministic, reproducible output. */
  readonly temperature: 0;
  /** Output token ceiling for the stage. */
  readonly maxTokens: number;
  /** API key for {@link provider} (secret — never logged). */
  readonly apiKey: string;
  /** Whether to send `temperature` to this provider (mirrors {@link ProviderInfo}). */
  readonly sendTemperature: boolean;
  /** Constructor field name for the token ceiling (mirrors {@link ProviderInfo}). */
  readonly maxTokensField: 'maxTokens' | 'maxOutputTokens';
}

/** Resolved configuration for both pipeline stages. */
export interface LlmConfig {
  readonly ocr: ModelSpec;
  readonly analysis: ModelSpec;
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

/** Parse + validate a provider id, with a clear error listing the supported set. */
export function parseProviderId(raw: string): ProviderId {
  if ((SUPPORTED_PROVIDERS as string[]).includes(raw)) {
    return raw as ProviderId;
  }
  throw new Error(
    `Unsupported LLM provider "${raw}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}.`,
  );
}

/**
 * Resolve the provider for a stage: a per-stage override (`AYA_OCR_PROVIDER` /
 * `AYA_ANALYSIS_PROVIDER`) wins, else the pipeline-wide `AYA_LLM_PROVIDER`. The
 * per-stage overrides exist so one eval run can compare/mix providers per stage.
 */
function resolveProvider(env: Env, overrideVar: string): ProviderId {
  const raw = env[overrideVar]?.trim();
  if (raw !== undefined && raw !== '') return parseProviderId(raw);
  return parseProviderId(requireEnv(env, 'AYA_LLM_PROVIDER'));
}

function resolveStage(
  env: Env,
  modelVar: string,
  providerOverrideVar: string,
  maxTokens: number,
): ModelSpec {
  const provider = resolveProvider(env, providerOverrideVar);
  const info = PROVIDERS[provider];
  return {
    provider,
    model: requireEnv(env, modelVar),
    temperature: 0,
    maxTokens,
    apiKey: requireEnv(env, info.keyEnv),
    sendTemperature: info.sendTemperature,
    maxTokensField: info.maxTokensField,
  };
}

/**
 * Build the LLM configuration from the environment.
 *
 * Reads:
 *  - `AYA_LLM_PROVIDER`      — provider id (anthropic | google-genai | openai)
 *  - `AYA_OCR_PROVIDER`      — optional per-stage provider override (OCR)
 *  - `AYA_ANALYSIS_PROVIDER` — optional per-stage provider override (analysis)
 *  - `AYA_OCR_MODEL`         — model id for the OCR (vision) stage
 *  - `AYA_ANALYSIS_MODEL`    — model id for the analysis stage
 *  - the selected provider's key var (e.g. `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` /
 *    `OPENAI_API_KEY`) per the {@link PROVIDERS} table
 *
 * Throws a clear error if any required value is missing or the provider is
 * unsupported. Temperature is fixed at 0 for both stages.
 */
export function loadLlmConfig(env: Env = process.env): LlmConfig {
  return {
    ocr: resolveStage(env, 'AYA_OCR_MODEL', 'AYA_OCR_PROVIDER', OCR_MAX_TOKENS),
    analysis: resolveStage(
      env,
      'AYA_ANALYSIS_MODEL',
      'AYA_ANALYSIS_PROVIDER',
      ANALYSIS_MAX_TOKENS,
    ),
  };
}

/**
 * Whether a real model runner can be built for the selected provider — i.e. the
 * provider is supported and its API key is present. Never throws: callers (the eval
 * harness) use it to decide whether to run the live-model path or skip it.
 *
 * @param provider Optional explicit provider; defaults to `AYA_LLM_PROVIDER`.
 */
export function hasModelCredentials(env: Env = process.env, provider?: string): boolean {
  const raw = provider ?? env['AYA_LLM_PROVIDER'];
  if (raw === undefined || raw.trim() === '') return false;
  if (!(SUPPORTED_PROVIDERS as string[]).includes(raw.trim())) return false;
  const info = PROVIDERS[raw.trim() as ProviderId];
  const key = env[info.keyEnv];
  return key !== undefined && key.trim() !== '';
}
