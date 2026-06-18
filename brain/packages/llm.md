---
title: "@aya/llm"
type: package
packages: [llm]
tasks: [llm-package-scaffold, llm-model-config, llm-langsmith-wiring, llm-ocr-schema-and-prompt, llm-run-ocr, llm-analysis-schema-and-prompt, llm-analyze-text, llm-provider-abstraction]
summary: The two LLM calls (runOcr and analyzeText), a PROVIDER-AGNOSTIC structured-output runner (LangChain initChatModel), retry helper, LangSmith tagging, env-sourced provider+model config.
updated: 2026-06-18
---

# @aya/llm (as built)

The rest of the system touches the model only via `runOcr` / `analyzeText` from the
barrel (`packages/llm/src/index.ts`). LangChain never leaks past this package, and the
package is **provider-agnostic** — the provider (anthropic / google-genai / openai) is
env config, not code ([[llm-provider-abstraction]]).

## Status

- **`runOcr` is implemented** (`src/run-ocr.ts`).
- **`analyzeText` is implemented** (`src/analyze-text.ts`). Both LLM calls are done.

## What lives where

- `src/config.ts` — the `PROVIDERS` registry (`anthropic` / `google-genai` / `openai` →
  `keyEnv`, `sendTemperature`, `maxTokensField`); the **only** place provider names appear.
  `loadLlmConfig(env?)` reads `AYA_LLM_PROVIDER` (+ optional `AYA_OCR_PROVIDER` /
  `AYA_ANALYSIS_PROVIDER`), `AYA_OCR_MODEL`, `AYA_ANALYSIS_MODEL`, and the selected provider's
  key var; returns a per-stage **`ModelSpec`**; throws on missing/unknown values. Temperature
  fixed `0`; ceilings `OCR_MAX_TOKENS = 4096`, `ANALYSIS_MAX_TOKENS = 8192`. `hasModelCredentials`
  reports whether a real runner can be built. No provider name or model id literal escapes this
  table.
- `src/model.ts` — `StructuredRunner<T>` (the narrow invoke-only interface call sites depend on),
  `createStructuredRunner(spec, schema)` — **async**, builds the model via LangChain's universal
  `initChatModel` (provider-agnostic) and binds `withStructuredOutput`; `withRetry` (bounded
  exponential backoff, default 3 attempts / 200ms base), `TransientLlmError`.
- `src/ocr.ts` — `OcrResultSchema` (`status: ok|unreadable|no_chinese_text` +
  `fullText`, with a refinement that `fullText === ""` unless ok) and
  `buildOcrSystemPrompt()`.
- `src/run-ocr.ts` — `runOcr(image, options)`. `OcrImageInput` is bytes
  (base64'd into a LangChain image block) or a URL. Vision message =
  `[SystemMessage, HumanMessage([image block, "Transcribe this page."])]`.
- `src/analysis.ts` — `AnalysisResultSchema` (`tokens: PhraseToken[]`, analysis fields
  nullable) and `buildAnalysisSystemPrompt()` (segmentation rules: idioms/compounds
  whole, exact reconstruction, 1-based contiguous index).
- `src/analyze-text.ts` — `analyzeText(fullText, pageId, options)`. Two-phase retry:
  `withRetry` (maxAttempts 2) for transient/parse errors; outer loop (max 2 iterations)
  for reconstruction failures with feedback injected into the retry message.
  Assigns uuid ids and pageId to each token. Throws `AnalysisFailedError` on persistent
  reconstruction mismatch. Sorted by index before return.
- `src/tracing.ts` — `buildRunConfig({stage, model, pageId?, env?})` → RunnableConfig
  with `runName: aya-<stage>` plus `stage:/model:/env:/pageId:` tags and mirrored
  metadata. Tracing on/off is purely env (`LANGCHAIN_TRACING_V2`); tags are no-ops
  when off.

## Conventions

- Prompts are **builder functions** returning the literal string, so tweaks are
  diff-tracked and eval-gated. Schema and prompt live together in one file per call.
- Call sites take an injectable `runner` + `env` in options, so tests never hit the
  network; production path resolves config + runner only when `runner` is undefined.
- Output is re-parsed with the Zod schema **even though** the runner already
  validated — never return unvalidated model output.
- Anything touching prompts/schemas/model config requires an eval run (CLAUDE.md
  golden rule #2). The eval suite now exists — [@aya/evals](./evals.md) scores `runOcr`
  / `analyzeText` via injected runners (offline) or the real key; a real LangSmith
  dataset run stays gated on the langsmith-account handoff.

## Gotchas

- `createStructuredRunner` is **async** (initChatModel dynamically imports the provider
  package) — every caller `await`s it (`run-ocr.ts`, `analyze-text.ts`, evals judge).
- Whether `temperature: 0` is sent is **per-provider** via the `PROVIDERS` table's
  `sendTemperature` (anthropic false, others true) — see
  [decision: temperature param](../decisions/temperature-param-omitted.md).
- Token ceiling field differs per provider (`maxTokens` vs Gemini's `maxOutputTokens`) —
  handled by `maxTokensField` in the table.
- `withRetry` retries *all* errors by default (`isRetryable` defaults to true);
  `TransientLlmError` exists but `runOcr` does not currently wrap errors in it.
- Provider + model ids are env config (per CLAUDE.md rule #9, consult the `claude-api` skill /
  the provider's model list); nothing in code pins a provider or model.
- Real per-provider quality numbers are unproven until `eval:compare` runs with keys — see the
  open handoff [multi-provider-keys](../handoffs/multi-provider-keys.md).
