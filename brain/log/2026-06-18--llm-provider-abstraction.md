---
title: "llm-provider-abstraction: provider-agnostic LLM via initChatModel + eval:compare"
type: log
packages: [llm, evals, api]
tasks: [llm-provider-abstraction]
summary: Refactored packages/llm off hard-wired ChatAnthropic onto LangChain initChatModel (provider = env config via a PROVIDERS table + ModelSpec); evals gate on hasModelCredentials and gained a side-by-side eval:compare CLI; infra injects AYA_LLM_PROVIDER. Rejected litellmjs (no vision/structured-output/Gemini).
updated: 2026-06-18
---

# Provider-agnostic LLM + side-by-side model comparison

Refactored `packages/llm` off its hard-wired `ChatAnthropic` onto LangChain's universal
`initChatModel`, so the provider (anthropic / google-genai / openai) and model id are env
config — switching is config-only, no refactor, nothing outside the package changed
(`runOcr`/`analyzeText` signatures held; callers still depend only on `StructuredRunner`).

What changed:
- `config.ts` — new `PROVIDERS` table (the only place provider names appear), `ModelSpec`,
  `AYA_LLM_PROVIDER` (+ per-stage overrides), `hasModelCredentials`. `loadLlmConfig` now returns
  per-stage `ModelSpec`.
- `model.ts` — `createStructuredRunner(spec, schema)` is now **async**, builds via `initChatModel`;
  `temperature`/token-field handled per-provider. `run-ocr.ts` / `analyze-text.ts` `await` it.
- evals — `run-evals.ts` gates on `hasModelCredentials`; `translation.ts` judge is provider-aware
  (`AYA_JUDGE_PROVIDER`, async runner). **New** `compare.ts` (`runEvalsMatrix` + `printMatrix`) +
  `models.compare.json` + `npm run eval:compare` — runs the same datasets/scorers against N models
  and prints one side-by-side table.
- infra — `AYA_LLM_PROVIDER` injected into the scan Lambda (default `anthropic`).
- deps — added `@langchain/google-genai`, `@langchain/openai` (both peer `@langchain/core ^1.2.0`,
  deduped clean); core bumped 1.1.48 → 1.2.0.

Rejected the `litellm` JS SDK (`litellmjs`): no vision / structured output / Gemini, unmaintained
since Jan 2024 — can't run Aya's OCR or Zod calls. Decision = ADR-0012 + [[llm-provider-abstraction]].

Brain touched: `packages/llm.md`, `packages/evals.md`, `concepts/structured-llm-output.md`,
`concepts/env-and-config.md`, `decisions/temperature-param-omitted.md` (now per-provider), new
`decisions/llm-provider-abstraction.md`, new handoff `handoffs/multi-provider-keys.md`.

Verification: root typecheck + lint green; `@aya/llm` (47) + `@aya/evals` (73) + `@aya/api` (71)
tests pass; `npm run eval` exits 0 offline (golden rule #2, prompts/schemas unchanged → no
regression); `npm run eval:compare` renders the table offline ("skipped" columns). Real
Gemini/OpenAI runs pending the [[multi-provider-keys]] handoff.
