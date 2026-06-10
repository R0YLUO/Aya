---
title: "@aya/shared"
type: package
packages: [shared]
tasks: [shared-package-scaffold, shared-domain-types, shared-zod-domain-schemas, shared-reconstruction-invariant, shared-api-contracts]
summary: Domain types, Zod contracts, error codes, and the reconstruction check — the single source every package imports from.
updated: 2026-06-10
---

# @aya/shared (as built)

Everything is exported from one barrel, `packages/shared/src/index.ts`. Other packages
import **only** from `@aya/shared` (never deep paths). ESM, built to `dist/`; tests are
node:test compiled via `tsconfig.test.json` (this build-then-`node --test` pattern is
repeated in every package).

## What lives where

- `src/domain.ts` — `Page`, `Phrase`, `Share`, `AnalyzedPage` interfaces.
- `src/schemas.ts` — Zod schemas paired 1:1 with the interfaces. Bidirectional
  `satisfies`-based compile-time assertions make any drift between interface and
  schema a **typecheck failure** — if you change one, change both.
- `src/api.ts` — request/response schemas for every endpoint (`UploadRequest/Response`,
  `ScanRequest/Response`, `ShareRequest/Response`, `ShareResolveResponse`,
  `HealthResponse`), plus `ERROR_CODES` and `ErrorEnvelopeSchema`.
- `src/reconstruction.ts` — `checkReconstruction(fullText, phrases)`; see
  [reconstruction-invariant](../concepts/reconstruction-invariant.md).

## Conventions encoded here (rely on these)

- **Tappability is inferred, not stored**: a `Phrase` is a tappable word iff
  `pinyin !== null`; punctuation/whitespace/newline tokens carry `null` for all three
  analysis fields. Both readers depend on this.
- `Phrase.index` is **1-based** and contiguous; sorting by it reconstructs the page.
- `ScanResponse` and `ShareResolveResponse` are both exactly `AnalyzedPageSchema` —
  scan and share-resolve return the same shape.
- Timestamps are ISO 8601 strings validated by `z.iso.datetime()`; ids are uuid v4
  **but schemas only enforce `z.string()`**, not uuid format.
- `ERROR_CODES` is the closed set of *expected, client-actionable* failures; see
  [error-handling](../concepts/error-handling.md) for the two codes that deliberately
  live outside it (`internal_error`, `network_error`).

## Gotchas

- Zod is **v4** (`zod@^4.4.3`): note `z.iso.datetime()` and `z.int()` — v3 idioms
  (`z.string().datetime()`) are not used here.
- `checkReconstruction` is pure and returns `{ ok, reason? }` with machine-readable
  reasons; it never throws.
