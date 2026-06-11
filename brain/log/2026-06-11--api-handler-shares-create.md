---
title: Built the POST /shares create handler
type: log
packages: [api]
tasks: [api-handler-shares-create]
summary: The only write path — validates shape + reconstruction (incl. page.id match), mints a code, persists Page+Phrases+Share in one transaction, returns 201.
updated: 2026-06-11
---

# api-handler-shares-create

Implemented `makeSharesCreateHandler(deps)` in `packages/api/src/handlers/shares.ts`
— the `POST /shares` handler and the system's only write path.

Flow:

- Validate body with `ShareRequestSchema.safeParse` (shape) → throw
  `validationError` (400) on failure.
- Validate the reconstruction invariant with shared `checkReconstruction(page.fullText,
  phrases)` → throw `validationError` (400, `details.reason`) on failure.
- **Extra check beyond `checkReconstruction`:** assert `phrases[0].pageId === page.id`.
  `checkReconstruction` only asserts the phrases share *one* pageId (`mixed_page_id`),
  not that it matches *this* page's id — so a payload whose phrases all reference a
  different page would otherwise slip through. This is the acceptance criterion
  "phrases reference page.id".
- Only after both checks pass: mint the code (`shortUrls.generateShareCode()`), build
  the `Share`, and call `repository.savePageWithPhrasesAndShare(page, phrases, share)` —
  the single `TransactWriteCommand`. Persisting is the first side effect, so a
  validation failure writes nothing (acceptance criterion).
- Return `201 { code, url, pageId }` (`ShareResponse`).

Conventions followed: factory + injected deps (`SharePersister`, `ShareUrlMinter`,
`now`), `ApiError` thrown for the non-2xx path (router owns `toErrorResponse`),
config (table name, web base URL) stays at the edge. The injected interfaces are
structural subsets of `PageRepository` / `ShortUrlService`, so the handler unit-tests
fully offline with recording fakes.

Tests (`shares.test.ts`, node:test, 10 cases): 201 happy path asserting exactly one
write of Page + N phrases + Share and a schema-valid response; and a 400
`validation_error` writing nothing for each invariant — bad shape, empty phrases,
concatenation != fullText, index gap, duplicate index, mismatched page.id, mixed
pageId across phrases, and absent body.

Notes:

- No share-code collision guard (the repo `Put` is unconditional; 62^8 keyspace). Kept
  as-is per the share-flow page's existing note — not in scope for this task.
- Still pending: `api-handler-shares-resolve` and `api-router`.

Verification: repo-wide `typecheck`, `lint`, `build` all green; `npm test -w @aya/api`
= 48 pass (10 new). Mock-level only (recording fakes for repo + short-url service); no
real DynamoDB write. End-to-end remains gated on the existing AWS handoff — no new
handoff needed.
