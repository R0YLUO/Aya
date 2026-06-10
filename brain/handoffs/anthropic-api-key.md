---
title: Anthropic API key + model ids for real LLM verification
type: handoff
status: open
packages: [llm]
tasks: [llm-run-ocr, llm-analyze-text]
summary: runOcr and analyzeText are done but have only ever run against mocked runners — they have never hit the real Anthropic API.
updated: 2026-06-10
---

# Anthropic API key + model ids

## What's needed

1. An Anthropic API key, exported as `ANTHROPIC_API_KEY` (shell env or local `.env`
   you keep out of git — golden rule #7: never commit it).
2. Chosen model ids for `AYA_OCR_MODEL` (must support vision) and
   `AYA_ANALYSIS_MODEL`. Per golden rule #9, pick from the current model list via the
   `claude-api` skill — say the word and an agent will recommend ids.

## Why

Every test in `packages/llm` injects a mock `StructuredRunner`
(see [testing & DI](../concepts/testing-and-di.md)). Both LLM calls are plan-`done`
per their acceptance criteria, but **no real OCR or analysis has ever been executed**
— prompt quality, structured-output behaviour, and the reconstruction pass rate
against the real model are all unverified. This also blocks the `evals-*` tasks.

## Verify after

With the three vars set, an agent runs a one-off smoke (no script exists yet — an
agent can write a throwaway one): `runOcr` on a sample book-page photo and
`analyzeText` on a short Chinese paragraph; confirm an `ok` OCR result and a
`Phrase[]` passing the reconstruction invariant. Then mark this handoff resolved.
