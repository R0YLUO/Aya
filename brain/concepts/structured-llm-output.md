---
title: Structured LLM output, retries & tracing
type: concept
packages: [llm]
tasks: [llm-run-ocr, llm-model-config, llm-langsmith-wiring]
summary: The StructuredRunner pattern every LLM call follows — Zod-bound runner, injectable for tests, bounded retries, defensive re-parse, tagged runs.
updated: 2026-06-10
---

# Structured LLM output (the pattern for every call)

Established by `runOcr`; `analyzeText` and any future call must follow it.

## The recipe (see `packages/llm/src/run-ocr.ts` as the reference implementation)

1. **Schema + prompt in one file per call** (`ocr.ts`, `analysis.ts`): a Zod schema
   for the output and a `buildXSystemPrompt()` builder returning the literal string
   (diffable, eval-gated).
2. **`StructuredRunner<T>`** (`model.ts`): the only model surface call sites see —
   `invoke(messages, config) => Promise<T>`. Production impl =
   `createStructuredRunner(stageConfig, apiKey, schema)` (ChatAnthropic +
   `withStructuredOutput`). Tests inject a fake runner; **no test makes a live call**.
3. **Lazy config**: only resolve `loadLlmConfig` / build the real runner when no
   runner was injected, so importing the module never requires env vars.
4. **`withRetry`** around the invoke: bounded exponential backoff (default 3
   attempts, 200ms base, injectable `sleep`). Fail clearly rather than spin.
5. **Defensive re-parse**: `Schema.parse(result)` on the runner's return even though
   the runner validated — unvalidated model output never escapes the package.
6. **Tag the run**: pass `buildRunConfig({ stage, model, pageId? })` as the invoke
   config — `runName: aya-<stage>` + `stage:/model:/env:/pageId:` tags. Works whether
   or not LangSmith tracing (`LANGCHAIN_TRACING_V2`) is on.

## Failure-signalling convention

Expected failure modes are **inside the schema** (OCR's `status:
ok|unreadable|no_chinese_text` discriminant with a refinement forcing `fullText: ""`
when not ok), not exceptions. Exceptions mean transport/validation problems; the
caller maps both to [error envelopes](./error-handling.md).

## Known wrinkles

- `temperature` is config'd as 0 but **not sent** to the API by default — see
  [decision](../decisions/temperature-param-omitted.md).
- `TransientLlmError` is defined but currently unused by `runOcr`; `withRetry`
  retries all errors by default. If `analyzeText` needs retry-on-reconstruction-failure
  semantics, decide whether to distinguish retryable errors and record it.
