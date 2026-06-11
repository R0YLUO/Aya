---
title: Built the GET /shares/{code} resolve handler
type: log
packages: [api]
tasks: [api-handler-shares-resolve]
summary: Read handler — resolves a share code to its AnalyzedPage via repository.resolveShare; 200 { page, phrases } or 404 share_not_found; writes nothing.
updated: 2026-06-11
---

# api-handler-shares-resolve

Implemented `makeSharesResolveHandler(deps)` in
`packages/api/src/handlers/shares-resolve.ts` — the `GET /shares/{code}` handler the
web reader calls server-side (specs/03 §4). Pure read path; never writes.

Flow:

- Read `code` from `request.pathParameters?.['code']` (bracket access required by
  `noPropertyAccessFromIndexSignature`). Absent/empty → throw `validationError` (400)
  **before** any query (a malformed request, not an unknown share).
- `repository.resolveShare(code)` → `AnalyzedPage | undefined`. The repo already does
  the GetItem-then-partition-query and returns `undefined` for an unknown code **or** a
  dangling share whose page is gone.
- `undefined` → throw `shareNotFound` (404, `details: { code }`). Otherwise return
  `200` with the `AnalyzedPage` (`{ page, phrases }`); phrases are already index-ordered
  by the repository, satisfying the reconstruction invariant the create path enforced.

Deliberate scoping: only the `undefined` resolver result maps to 404. Repository /
transport errors bubble unchanged to the router's 500, per the share-flow note that the
web client renders the friendly not-found page *only* for `share_not_found` and
propagates everything else.

Conventions followed: factory + injected dep (`ShareResolver`, a structural subset of
`PageRepository` exposing just `resolveShare`), `ApiError` thrown for non-2xx (router
owns `toErrorResponse`), config stays at the edge. Exported from the package barrel.

Tests (`shares-resolve.test.ts`, node:test, 6 cases): known code → 200, queried by
exactly that code, schema-valid (`ShareResolveResponseSchema`); returned phrases
index-ordered and pass `checkReconstruction`; unknown code → 404 `share_not_found`;
dangling share (resolver returns undefined) → 404; missing path param → 400
`validation_error` with no query attempted.

Verification: repo-wide `typecheck`, `lint`, `build` all green; `npm test -w @aya/api`
= 53 pass (6 new). Mock-level only (recording fake resolver); no real DynamoDB read.
End-to-end remains gated on the existing AWS handoff (`handoffs/aws-account.md`) — no
new handoff needed. Still pending: `api-router`.
