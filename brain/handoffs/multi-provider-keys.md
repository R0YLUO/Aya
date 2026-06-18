---
title: "Provider API keys for real multi-provider runs + model comparison"
type: handoff
status: open
packages: [llm, evals]
tasks: [llm-provider-abstraction]
summary: The LLM layer is provider-agnostic but only the Anthropic path has ever run; Gemini/OpenAI need GOOGLE_API_KEY/OPENAI_API_KEY + real model ids in models.compare.json before eval/eval:compare produce real numbers and a provider swap can be judged.
updated: 2026-06-18
---

# Multi-provider keys + a real `eval:compare` run

The LLM layer is now provider-agnostic ([[llm-provider-abstraction]]), but every provider path
other than the existing Anthropic one has only ever run **offline** (injected runners / "skipped"
eval columns). No call has hit Gemini or OpenAI, and no side-by-side comparison has real numbers.

## What's needed

1. API keys for the providers you want to use/compare, in the environment:
   - `GOOGLE_API_KEY` (for `AYA_LLM_PROVIDER=google-genai`)
   - `OPENAI_API_KEY` (for `AYA_LLM_PROVIDER=openai`)
   - `ANTHROPIC_API_KEY` is already covered by the existing `anthropic-api-key` handoff.
2. Real model ids filled into `packages/evals/models.compare.json` (the `<...>` placeholders),
   chosen from each provider's current model list — for Anthropic consult the `claude-api` skill;
   do not guess ids from memory. OCR rows need a **vision-capable** model.
3. (For a deployed switch) add the chosen provider's key as an SST secret and set
   `AYA_LLM_PROVIDER` in the Lambda env (`packages/infra/sst.config.ts` already defaults it to
   `anthropic` and documents this).

## Why

`createStructuredRunner` builds each provider via LangChain `initChatModel`; `withStructuredOutput`
and vision differ per provider (Gemini has documented Zod/structured-output quirks). Until a real
key exercises each path we cannot confirm OCR (vision) and the analysis structured output actually
work on Gemini/OpenAI, nor whether quality holds versus Anthropic.

## Verify after

- `AYA_LLM_PROVIDER=google-genai GOOGLE_API_KEY=… AYA_OCR_MODEL=… AYA_ANALYSIS_MODEL=… npm run eval -w packages/evals`
  exits 0 and shows real (non-"skipped") OCR/Analysis numbers, no reconstruction auto-fails.
- `npm run eval:compare -w packages/evals` (with the keys + model ids set) prints a table with
  real numbers in each provider column — that table is the artifact for deciding a provider swap.
- Capture the real baseline metric values (still placeholders) once a trusted run exists
  (overlaps the `anthropic-api-key` handoff).
