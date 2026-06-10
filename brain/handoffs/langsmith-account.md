---
title: LangSmith account & keys for tracing and evals
type: handoff
status: open
packages: [llm, evals]
tasks: [llm-langsmith-wiring, evals-package-scaffold]
summary: Tracing wiring is built but silently no-ops without LANGCHAIN_* env; the evals package will need a LangSmith project for datasets.
updated: 2026-06-10
---

# LangSmith account & keys

## What's needed

A LangSmith account and project, then env: `LANGCHAIN_TRACING_V2=true`,
`LANGCHAIN_API_KEY=<key>`, `LANGCHAIN_PROJECT=<project name, e.g. aya-dev>`.
Keep keys out of git.

## Why

`llm/src/tracing.ts` is done and unit-tested, but with tracing env absent it
deliberately no-ops — no trace has ever reached LangSmith, so the tagging/metadata
wiring is unverified against the real service. The `evals-*` tasks (todo) plan to
register LangSmith datasets. **Not blocking current coding work**; becomes blocking
at `evals-package-scaffold`.

## Verify after

With env set (plus the [Anthropic key](./anthropic-api-key.md)), make one real
`runOcr`/`analyzeText` call and confirm a run named `aya-ocr`/`aya-analysis` appears
in the LangSmith project with stage/model/env tags. Then mark resolved.
