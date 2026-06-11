---
title: LangSmith account & keys for tracing and evals
type: handoff
status: open
packages: [llm, evals]
tasks: [llm-langsmith-wiring, evals-package-scaffold]
summary: Tracing wiring is built but silently no-ops without LANGCHAIN_* env; the @aya/evals package is now scaffolded and can register/run LangSmith datasets but has only ever run offline against local fixtures.
updated: 2026-06-11
---

# LangSmith account & keys

## What's needed

A LangSmith account and project, then env: `LANGCHAIN_TRACING_V2=true`,
`LANGCHAIN_API_KEY=<key>`, `LANGCHAIN_PROJECT=<project name, e.g. aya-dev>`.
Keep keys out of git.

## Why

`llm/src/tracing.ts` is done and unit-tested, but with tracing env absent it
deliberately no-ops — no trace has ever reached LangSmith, so the tagging/metadata
wiring is unverified against the real service. `evals-package-scaffold` is now
**built**: `@aya/evals` has `isLangSmithEnabled` + `registerLangSmithDataset`
(dynamic-imports the `langsmith` client) and `runEvals` mirrors fixtures into
LangSmith when enabled — but every run so far has been **offline against local
fixtures** (LangSmith disabled), so the dataset-registration path has never hit the
real service. **Not blocking further coding**; blocks any real LangSmith dataset run
and any eval that needs the Anthropic model path.

## Verify after

With env set (plus the [Anthropic key](./anthropic-api-key.md)), make one real
`runOcr`/`analyzeText` call and confirm a run named `aya-ocr`/`aya-analysis` appears
in the LangSmith project with stage/model/env tags. Then run
`npm run eval -w packages/evals` and confirm the `aya-ocr-v1` / `aya-analysis-v1`
datasets appear in the LangSmith project (the report's `LangSmith: enabled (datasets
registered)` line confirms it). Then mark resolved.
