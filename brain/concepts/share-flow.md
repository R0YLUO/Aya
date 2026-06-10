---
title: Share flow (end to end)
type: concept
packages: [api, web, mobile]
tasks: [api-short-url-service, api-dynamodb-repository, web-share-page-ssr]
summary: POST /shares persists page+phrases+share transactionally and mints /s/{code}; web resolves it SSR. Both share handlers and the mobile UI are still todo.
updated: 2026-06-10
---

# Share flow (as built so far)

```
mobile sharePage(page, phrases)  ──► POST /shares  [NOT BUILT: api-handler-shares-create]
                                        ShortUrlService.generateShareCode()   (built)
                                        PageRepository.savePageWithPhrasesAndShare (built, transactional)
                                        → { code, url, pageId }
web /s/{code} (SSR, built) ─────────► GET /shares/{code}  [NOT BUILT: api-handler-shares-resolve]
                                        PageRepository.resolveShare(code)     (built)
                                        → AnalyzedPage | share_not_found
```

- **The only write path in the system.** Scan persists nothing; sharing persists
  page + all phrases + share in one `TransactWriteCommand` so a shared page is never
  half-written.
- Built: code minting (8-char base62, CSPRNG, rejection sampling), URL composition
  (`${WEB_BASE_URL}/s/${code}`), the repository, the mobile client method
  (`AyaApiClient.sharePage`, already validates `ShareRequest/ResponseSchema`), and the
  whole web read side (SSR route → `resolveSharePage` → `ReaderWithPopups`).
- Todo: `api-handler-shares-create`, `api-handler-shares-resolve`, `api-router`,
  `mobile-share-flow` (the UI invoking `sharePage` and presenting the URL).

## Constraints for the todo handlers

- Create: validate body with `ShareRequestSchema`, run
  [checkReconstruction](./reconstruction-invariant.md) and reject failures
  (`validation_error` carrying the reason) before persisting; respond
  `{ code, url, pageId }`.
- Resolve: unknown/dangling code → `share_not_found` (404); the web client renders
  the friendly not-found page **only** for that code and propagates everything else
  to the error boundary — so don't soften other failures into 404s.
- Code collisions: `savePageWithPhrasesAndShare` does an unconditional `Put` — there
  is currently **no collision guard** on the share code (62^8 ≈ 2×10^14 keyspace).
  If the create handler wants stronger guarantees, that's a decision to record.
