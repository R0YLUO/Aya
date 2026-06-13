---
title: Anthropic API key + model ids for real LLM verification
type: handoff
status: open
packages: [llm]
tasks: [llm-run-ocr, llm-analyze-text]
summary: runOcr, analyzeText, and the evals LLM-as-judge translation scorer are done but have only ever run against mocked runners — they have never hit the real Anthropic API.
updated: 2026-06-13
---

# Anthropic API key + model ids

## What's needed

1. An Anthropic API key, exported as `ANTHROPIC_API_KEY` (shell env or local `.env`
   you keep out of git — golden rule #7: never commit it).
2. Chosen model ids for `AYA_OCR_MODEL` (must support vision),
   `AYA_ANALYSIS_MODEL`, and `AYA_JUDGE_MODEL` (the LLM-as-judge translation scorer).
   Per golden rule #9, pick from the current model list via the `claude-api` skill — say
   the word and an agent will recommend ids.

## Why

Every test in `packages/llm` — and the evals translation judge — injects a mock
`StructuredRunner` (see [testing & DI](../concepts/testing-and-di.md)). The two LLM calls
and the LLM-as-judge translation scorer (`evals/src/translation.ts`) are plan-`done` per
their acceptance criteria, but **no real OCR, analysis, or judge call has ever been
executed** — prompt quality, structured-output behaviour, the reconstruction pass rate,
and the judge's rubric grading against the real model are all unverified. This also
gates a real LangSmith eval run.

## Verify after

With the vars set (incl. `AYA_JUDGE_MODEL`), an agent runs a one-off smoke (no script
exists yet — an agent can write a throwaway one): `runOcr` on a sample book-page photo and
`analyzeText` on a short Chinese paragraph; confirm an `ok` OCR result and a `Phrase[]`
passing the reconstruction invariant. Also run `npm run eval -w @aya/evals` and confirm the
Translation section reports a pass rate (judge stage no longer skipped). Then mark this
handoff resolved.
