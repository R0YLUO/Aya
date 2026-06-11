---
title: "Wired all handlers into the API router"
type: log
packages: [api]
tasks: [api-router]
summary: makeRouter maps method+path → handler, parses the JSON body, owns the central toErrorResponse catch (ApiError keeps status, else 500), and 404s unknown routes; 15 integration tests exercise every route.
updated: 2026-06-11
---

# api-router

Added `packages/api/src/router.ts` — the transport-agnostic routing core that
completes the HTTP edge. `makeRouter(handlers)` takes an injected `RouterHandlers`
bundle (the five already-built handlers) and returns
`(RouterRequest{method,path,rawBody?}) => Promise<RouterResponse>`.

## What it does

- **Five routes, matching specs/03 exactly:** `POST /uploads`, `POST /pages`,
  `POST /shares`, `GET /shares/{code}`, `GET /health`.
- **Matching:** method case-insensitive; path normalised (trailing slash stripped
  except root). `exact()` for fixed paths, `oneParam('/shares','code')` for the one
  path param — regex-free, requires exactly one non-empty trailing segment, so bare
  `GET /shares` does NOT match the `{code}` route (it 404s).
- **Body parsing:** only POSTs parse `rawBody` as JSON; empty/whitespace → `undefined`,
  invalid JSON → `validationError` (400). Handlers still own Zod validation of the
  parsed shape.
- **Central error catch:** the whole dispatch is wrapped → `toErrorResponse(error)`.
  An `ApiError` thrown by any handler keeps its status/code; anything else becomes a
  500 `internal_error` (generic message — does not leak the original error). The
  router never throws.
- **Unknown method+path → 404** with code `not_found`.

## Decision: `not_found` lives outside the ErrorCode enum

Added `NOT_FOUND_CODE = 'not_found'` to `errors.ts` (exported), following the existing
`INTERNAL_ERROR_CODE` precedent. An unknown route is "no such endpoint" (transport),
not a PRD client-actionable state, so it stays out of the closed `ErrorCode` enum —
distinct from the resource-not-found states `image_not_found`/`share_not_found`.
Consequence: a missing-route 404 body won't parse against the closed-enum
`ErrorEnvelopeSchema`; assert it structurally.

## Verification (real, offline)

`router.test.ts` — 15 integration-style tests that drive each route **through
`makeRouter`** (not by calling handlers directly), with real handlers wired to
in-memory fakes: all five routes resolve and validate against the shared response
schemas; unknown route → 404; known path + wrong method → 404; bare `/shares` → 404;
malformed JSON → 400; handler-thrown `ApiError` → mapped status; unexpected throw →
500 (message not leaked); trailing-slash + case-insensitive method normalisation.
`npm run test -w @aya/api` → 66/66 pass. Full repo `typecheck`/`lint`/`build` green.

No handoff: the router is fully verified offline. The Lambda/API Gateway event ↔
`RouterRequest` adapter is a separate `infra-*` task, already covered by the open
`aws-account` handoff.
