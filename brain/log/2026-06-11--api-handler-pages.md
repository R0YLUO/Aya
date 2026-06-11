---
title: Built the POST /pages scan handler
type: log
packages: [api]
tasks: [api-handler-pages]
summary: Stateless OCR→analysis scan orchestration with injected deps, branch-mapped errors, and a page_scanned log line. Recovered abandoned uncommitted work and finished it.
updated: 2026-06-11
---

# api-handler-pages

Recovery+retry iteration. A prior attempt left uncommitted, uncommitted work (no
commit landed): `packages/api/src/handlers/pages.ts`, `pages-wiring.ts`, edits to
`index.ts` + `package.json`. Diagnosed it as **salvageable** — the handler and wiring
were correct and consistent with `@aya/shared` types, the `@aya/llm` `runOcr`/
`analyzeText` signatures, and api conventions (factory + injected deps, `ApiError`
throws, `HandlerRequest`/`HandlerResult`). The only gap vs. acceptance criteria was
the **missing test file**.

What I did to finish it:

- Wrote `packages/api/src/handlers/pages.test.ts` (node:test) covering every branch:
  happy path (200, valid `AnalyzedPage`, asserts only the 2 LLM calls + 1 fetch run →
  no persistence), `validation_error` 400, `image_not_found` 404, `image_unreadable`
  422, `no_chinese_text` 422, `analysis_failed` 502 (both the analyzeText-throws path
  and the malformed-shape-fails-schema path), and the `page_scanned` log fields.
- Fixed two lint errors in the salvaged code/test: `prefer-const` on the metrics vars
  (replaced the `let` bag with a single mutable `metrics` object) and an unused arg.
- Corrected an inaccurate comment in `pages.ts`: `AnalyzedPageSchema` does **not**
  check reconstruction — that invariant is enforced upstream in `analyzeText`.

Surprises / notes:

- `PhraseSchema.index` is `z.int().positive()` → **1-based**, not 0-based (matches the
  llm `PhraseTokenSchema`). Initial test fixtures used index 0 and failed validation.
- Token counts in the log line are `null` for now (runOcr/analyzeText don't surface
  usage; it lives in LangSmith). Documented as a gotcha in `brain/packages/api.md`.

Brain pages touched: `packages/api.md`, `concepts/scan-flow.md`, this log entry.

Verification: `turbo run typecheck lint build test --filter=@aya/api --force` — all
green (39 api tests pass); repo-wide `typecheck` also green. Mock-level only (no real
Claude/S3 call); end-to-end remains gated on the same human handoffs (Anthropic key,
AWS) already tracked — no new handoff needed.
