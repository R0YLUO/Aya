---
title: Reconstruction invariant
type: concept
packages: [shared, llm, api, web]
tasks: [shared-reconstruction-invariant, llm-analysis-schema-and-prompt]
summary: phrases.join('') === fullText, indexes unique & contiguous from 1 — who checks it, who relies on it, and where it is enforced (and not yet).
updated: 2026-06-10
---

# The reconstruction invariant

Concatenating every phrase's `original` in ascending `index` order must reproduce
`Page.fullText` **exactly**; indexes are unique and contiguous from 1; all phrases
share one `pageId`. This is what makes the tappable reader a faithful rebuild of the
photographed page (CLAUDE.md golden rule #3).

## The one checker

`checkReconstruction(fullText, phrases)` in `packages/shared/src/reconstruction.ts`.
Pure; returns `{ ok: true }` or `{ ok: false, reason }` with reasons `empty`,
`mixed_page_id`, `duplicate_index`, `index_not_contiguous_from_1`, `text_mismatch`.
**Never reimplement the check — import it.**

## Enforcement map (as of 2026-06-10)

| Point | Status |
|---|---|
| `analyzeText` output (llm) | **Pending** — `llm-analyze-text` must check before returning (likely retry/fail with `analysis_failed` semantics) |
| `POST /pages` response (api) | Pending — `api-handler-pages` |
| `POST /shares` before persisting (api) | Pending — `api-handler-shares-create`; the repository deliberately does NOT check (its doc says callers must) |
| Evals | Pending — `evals-reconstruction-and-report` scores it across datasets |

## Who relies on it

- Readers (web `Reader.tsx`, mobile reader in progress) render phrases sorted by
  `index` inside pre-wrap containers — line breaks survive only because newline
  characters are themselves tokens (`pinyin: null`).
- The analysis prompt (`buildAnalysisSystemPrompt`) instructs exact reproduction and
  contiguous 1-based indexing; the prompt alone is *not* trusted — the check is.
