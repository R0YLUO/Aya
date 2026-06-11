---
title: "@aya/llm"
type: package
packages: [llm]
tasks: [llm-package-scaffold, llm-model-config, llm-langsmith-wiring, llm-ocr-schema-and-prompt, llm-run-ocr, llm-analysis-schema-and-prompt, llm-analyze-text]
summary: The two LLM calls (runOcr and analyzeText both built), structured-output runner, retry helper, LangSmith tagging, env-sourced model config.
updated: 2026-06-10
---

# @aya/llm (as built)

The rest of the system touches the model only via `runOcr` / `analyzeText` from the
barrel (`packages/llm/src/index.ts`). LangChain (`@langchain/anthropic`) never leaks
past this package.

## Status

- **`runOcr` is implemented** (`src/run-ocr.ts`).
- **`analyzeText` is implemented** (`src/analyze-text.ts`). Both LLM calls are done.

## What lives where

- `src/config.ts` — `loadLlmConfig(env?)` reads `AYA_OCR_MODEL`, `AYA_ANALYSIS_MODEL`,
  `ANTHROPIC_API_KEY`; throws on missing values. Temperature is fixed `0`; token
  ceilings `OCR_MAX_TOKENS = 4096`, `ANALYSIS_MAX_TOKENS = 8192`. No model id literal
  appears anywhere in the package.
- `src/model.ts` — `StructuredRunner<T>` (the narrow invoke-only interface call sites
  depend on), `createStructuredRunner` (ChatAnthropic + `withStructuredOutput`),
  `withRetry` (bounded exponential backoff, default 3 attempts / 200ms base),
  `TransientLlmError`.
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

- `createStructuredRunner` defaults to **not sending `temperature`** — see
  [decision: temperature param omitted](../decisions/temperature-param-omitted.md).
- `withRetry` retries *all* errors by default (`isRetryable` defaults to true);
  `TransientLlmError` exists but `runOcr` does not currently wrap errors in it.
- Model ids: per CLAUDE.md rule #9, consult the `claude-api` skill when choosing env
  values; nothing in code pins a model.
