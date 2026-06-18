---
title: "Decision: provider-agnostic LLM via initChatModel + a PROVIDERS table"
type: decision
packages: [llm, evals]
tasks: [llm-provider-abstraction]
summary: The real chat model is built by LangChain's universal initChatModel; provider + model id are env config, never code. A single PROVIDERS table is the only place provider names appear. Switching Anthropic→Gemini→OpenAI is config-only; eval:compare scores models side-by-side.
updated: 2026-06-18
---

# Provider-agnostic LLM (initChatModel)

**Context.** `packages/llm` was hard-wired to `new ChatAnthropic(...)`. We needed to be
able to switch provider (Gemini, OpenAI) as a config change — no refactor, nothing broken —
and to compare models against the existing evals. Full rationale + rejected options in
**ADR-0012** (specs/08-decisions-log.md).

**Decision.**
- `createStructuredRunner(spec, schema)` (`packages/llm/src/model.ts`) builds the model via
  `initChatModel(spec.model, { modelProvider, apiKey, … })` from `langchain/chat_models/universal`.
  It is **async** (the loader dynamically imports the provider's `@langchain/*` package).
- A single `PROVIDERS` table (`packages/llm/src/config.ts`) is the **only place provider names
  appear in source**. Each row: `keyEnv` (which env var holds the key), `sendTemperature`
  ([[temperature-param-omitted]]), and `maxTokensField` (`maxTokens` vs Gemini's
  `maxOutputTokens`). Supported: `anthropic`, `google-genai`, `openai`.
- `loadLlmConfig` returns a per-stage **`ModelSpec`** (provider + model + key + token ceiling +
  the two flags). `hasModelCredentials(env, provider?)` reports whether a real runner can be built.
- Env: `AYA_LLM_PROVIDER` (required) selects the provider; optional `AYA_OCR_PROVIDER` /
  `AYA_ANALYSIS_PROVIDER` override per stage (so one run can mix providers). The judge resolves
  `AYA_JUDGE_PROVIDER` → `AYA_LLM_PROVIDER`.
- Nothing outside the package changed: callers still depend only on the `StructuredRunner`
  interface and the unchanged `runOcr` / `analyzeText` signatures.

**Why initChatModel and not litellm.** The `litellm` JS SDK (`litellmjs`) has no vision, no
structured output, no Gemini, and is unmaintained since Jan 2024 — it cannot run Aya's OCR or
Zod-bound calls. A LiteLLM proxy was rejected as needless infra for an MVP. `initChatModel` is
LangChain's own provider registry and keeps `withStructuredOutput` + vision intact.

**Comparing models.** `npm run eval:compare` ([[evals]]) runs the same datasets/scorers against
each model in `packages/evals/models.compare.json` and prints one side-by-side table — the payoff
that makes a provider swap a *measured* decision, not a guess.

**Gotchas.**
- The runner factory is now **async** — `run-ocr.ts`, `analyze-text.ts`, and the evals judge all
  `await createStructuredRunner(...)`.
- `withStructuredOutput` behaves differently per provider (Gemini has documented Zod quirks); the
  defensive Zod re-parse stays, and real per-provider numbers must come from `eval:compare` — see
  the open handoff [[multi-provider-keys]].
- Switching provider needs that provider's `@langchain/*` package installed (all three are deps).