---
title: "llm-analyze-text: analyzeText implemented"
type: log
packages: [llm]
tasks: [llm-analyze-text]
summary: Implemented analyzeText in src/analyze-text.ts with two-phase retry, reconstruction enforcement, and AnalysisFailedError.
updated: 2026-06-10
---

## What was built

`packages/llm/src/analyze-text.ts` — the second LLM call is now complete:

- `analyzeText(fullText, pageId, options)` invokes the analysis runner, maps tokens to
  `Phrase[]` with uuid ids, checks the reconstruction invariant, and returns sorted by index.
- Two-phase retry: inner `withRetry(maxAttempts: 2)` for transient/parse errors; outer
  loop (max 2 iterations) retries reconstruction failures with a feedback hint appended
  to the human message.
- `AnalysisFailedError` thrown on persistent reconstruction mismatch (after retry).
- Barrel updated: stub replaced with real exports (`analyzeText`, `AnalysisFailedError`,
  `AnalyzeTextOptions`).

## Brain pages touched

- `brain/packages/llm.md` — status updated (analyzeText done), analyze-text.ts added to What lives where.
- `brain/concepts/reconstruction-invariant.md` — enforcement table updated (analyzeText row marked done).
- `brain/concepts/structured-llm-output.md` — Known wrinkles updated to reflect two-axis retry design.

## Surprises / decisions

- `withRetry` default of 3 was left unchanged; `analyzeText` overrides to `maxAttempts: 2`
  so the outer reconstruction retry has a clean second chance without 3+3=6 total model calls.
- Reconstruction retry feeds back `reason=…, got="…", expected="…"` appended to the human message
  (not as a system-message change) to stay within the two-message shape the analysis call expects.
