---
title: Reconstruction invariant
type: concept
packages: [shared, llm, api, web]
tasks: [shared-reconstruction-invariant, llm-analysis-schema-and-prompt, llm-analyze-text]
summary: phrases.join('') === fullText, indexes unique & contiguous from 1 — who checks it, who relies on it, and where it is enforced (and not yet).
updated: 2026-06-11
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
**Never reimplement the check — import it.** Note it only asserts the phrases share
*one* pageId (`mixed_page_id`), **not** that that id equals a given `Page.id` — callers
that have a concrete page (the share-create handler) must additionally check
`phrases[0].pageId === page.id`.

## Enforcement map (as of 2026-06-10)

| Point | Status |
|---|---|
| `analyzeText` output (llm) | **Done** — `analyzeText` checks, retries once with feedback, then throws `AnalysisFailedError` on persistent failure |
| `POST /pages` response (api) | Pending — `api-handler-pages` |
| `POST /shares` before persisting (api) | **Done** — `makeSharesCreateHandler` runs `checkReconstruction` **and** asserts the shared pageId equals `page.id`, throwing `validation_error` (400) before any write. The repository still deliberately does NOT check (its doc says callers must) |
| Evals | Pending — `evals-reconstruction-and-report` scores it across datasets |

## Who relies on it

- Readers (web `Reader.tsx`, mobile reader in progress) render phrases sorted by
  `index` inside pre-wrap containers — line breaks survive only because newline
  characters are themselves tokens (`pinyin: null`).
- The analysis prompt (`buildAnalysisSystemPrompt`) instructs exact reproduction and
  contiguous 1-based indexing; the prompt alone is *not* trusted — the check is.
