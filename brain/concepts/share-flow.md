---
title: Share flow (end to end)
type: concept
packages: [api, web, mobile]
tasks: [api-short-url-service, api-dynamodb-repository, web-share-page-ssr]
summary: POST /shares persists page+phrases+share transactionally and mints /s/{code}; web resolves it SSR via GET /shares/{code}. Both handlers + router built; only mobile share UI todo.
updated: 2026-06-11
---

# Share flow (as built so far)

```
mobile sharePage(page, phrases)  ──► POST /shares  (handler BUILT: api-handler-shares-create)
                                        ShortUrlService.generateShareCode()   (built)
                                        PageRepository.savePageWithPhrasesAndShare (built, transactional)
                                        → { code, url, pageId }
web /s/{code} (SSR, built) ─────────► GET /shares/{code}  (handler BUILT: api-handler-shares-resolve)
                                        PageRepository.resolveShare(code)     (built)
                                        → 200 AnalyzedPage | 404 share_not_found
```

- **The only write path in the system.** Scan persists nothing; sharing persists
  page + all phrases + share in one `TransactWriteCommand` so a shared page is never
  half-written.
- Built: code minting (8-char base62, CSPRNG, rejection sampling), URL composition
  (`${WEB_BASE_URL}/s/${code}`), the repository, the mobile client method
  (`AyaApiClient.sharePage`, already validates `ShareRequest/ResponseSchema`), and the
  whole web read side (SSR route → `resolveSharePage` → `ReaderWithPopups`).
- Built (create handler): `makeSharesCreateHandler` validates
  `ShareRequestSchema` + [checkReconstruction](./reconstruction-invariant.md) +
  `page.id` match, then persists; returns `201 { code, url, pageId }`.
- Built (resolve handler): `makeSharesResolveHandler` reads `code` from the path,
  calls `repository.resolveShare(code)`, returns `200` `AnalyzedPage` or throws
  `shareNotFound` (404) for an unknown/dangling code; an absent code is a 400
  `validation_error` before any query. Pure read — writes nothing.
- Built (router): `makeRouter` wires `POST /shares` → create and
  `GET /shares/{code}` → resolve (and the other three routes) with the central error
  catch; see [@aya/api](../packages/api.md).
- Todo: `mobile-share-flow` (the UI invoking `sharePage` and presenting the URL).

## Constraints for the handlers

- Create (BUILT): validates body with `ShareRequestSchema`, runs
  [checkReconstruction](./reconstruction-invariant.md) **and** asserts the phrases'
  shared pageId equals `page.id`, rejecting failures (`validation_error` carrying the
  reason) **before** any write; responds `{ code, url, pageId }`. The persist is the
  first side effect, so a rejected payload writes nothing.
- Resolve (BUILT): unknown/dangling code → `share_not_found` (404); the web client
  renders the friendly not-found page **only** for that code and propagates
  everything else to the error boundary — so the handler maps *only* the
  `undefined` resolver result to 404 and lets repository/transport failures
  bubble to the router's 500. Don't soften other failures into 404s.
- Code collisions: `savePageWithPhrasesAndShare` does an unconditional `Put` — there
  is currently **no collision guard** on the share code (62^8 ≈ 2×10^14 keyspace).
  If the create handler wants stronger guarantees, that's a decision to record.
