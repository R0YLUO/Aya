---
title: "@aya/api"
type: package
packages: [api]
tasks: [api-package-scaffold, api-error-envelope, api-dynamodb-repository, api-s3-presign-service, api-short-url-service, api-handler-health, api-handler-uploads, api-handler-pages, api-handler-shares-create, api-handler-shares-resolve, api-router]
summary: Transport-agnostic handlers + router (method+path → handler, JSON parse, central error catch → standard envelope/500), ApiError→envelope mapping, DynamoDB repository, S3 presign, short-URL service.
updated: 2026-06-11
---

# @aya/api (as built)

Lambda-destined backend. Handlers are transport-agnostic functions; the **router**
(`src/router.ts`) maps method+path → handler, parses the JSON body, and owns the
central error catch. The API Gateway/Lambda adapter (an `infra-*` task) still has to
convert a proxy event into a `RouterRequest` and back.

## Status

- Built: `errors.ts`, `repositories/`, `services/`, handlers for `GET /health`,
  `POST /uploads`, `POST /pages` (the scan orchestration), `POST /shares` (the
  create handler — the only write path), and `GET /shares/{code}` (the resolve
  read handler), plus `router.ts` wiring them all together.
- Todo: the `infra-*` tasks (SST) — including the Lambda event ↔ RouterRequest
  adapter — are all todo.

## What lives where

- `src/handlers/types.ts` — the handler contract: `(HandlerRequest) =>
  HandlerResult`. `HandlerRequest` carries pre-parsed `body` (router parses, handler
  validates with the shared schema) and `pathParameters`. **No API Gateway types in
  handlers.**
- `src/errors.ts` — `ApiError` + convenience constructors (`validationError`,
  `imageNotFound`, …) carrying canonical status + PRD copy, and `toErrorResponse`
  mapping any thrown value to `{statusCode, body: envelope}`. See
  [error-handling](../concepts/error-handling.md).
- `src/repositories/keys.ts` + `page-repository.ts` — single-table item shapes and
  `PageRepository` (`savePageWithPhrasesAndShare` transactional write,
  `getPageWithPhrases` one partition query, `resolveShare`). See
  [dynamodb-single-table](../concepts/dynamodb-single-table.md).
- `src/services/s3-presign-service.ts` — `presignUpload(contentType?)` →
  `{uploadUrl, imageKey, expiresInSeconds}` (key `uploads/YYYY/MM/DD/<uuid>.jpg`,
  TTL 300s) and `getUploadedImage(imageKey)` → bytes, throwing `image_not_found` on
  any S3 not-found shape.
- `src/services/short-url-service.ts` — `generateShareCode()`: 8-char base62 via
  CSPRNG with rejection sampling (uniform, unguessable); `buildShareUrl(code)` →
  `${WEB_BASE_URL}/s/${code}` (base injected, trailing slash normalised).
- `src/handlers/pages.ts` — `makeScanHandler(deps)`: the **stateless** `POST /pages`
  orchestration. Deps are injected (`fetchImage`, `runOcr`, `analyzeText`, plus
  `log`/`clock`/`now`) so the orchestration unit-tests fully offline — it has **no LLM
  or AWS import and no repository**, which makes "persists nothing" structural. Flow:
  validate `{imageKey}` (`ScanRequestSchema`) → `fetchImage` (404 `image_not_found`
  propagates) → OCR (`unreadable`→422 `image_unreadable`, `no_chinese_text`→422) →
  mint `Page` (uuid + `createdAt`) → `analyzeText` (throw→502 `analysis_failed`) →
  `ScanResponseSchema.safeParse` shape-check (unparseable→502) → 200 `AnalyzedPage`.
  Emits one `page_scanned` JSON log line on every terminal path (specs/05).
- `src/handlers/shares.ts` — `makeSharesCreateHandler(deps)`: the `POST /shares`
  handler and the **only write path**. Deps `{ repository, shortUrls, now }` are
  injected (`SharePersister`/`ShareUrlMinter` are structural subsets of
  `PageRepository`/`ShortUrlService`, so it unit-tests with recording fakes). Flow:
  `ShareRequestSchema.safeParse` (shape) → `checkReconstruction(page.fullText,
  phrases)` → **explicit `phrases[0].pageId === page.id` check** (checkReconstruction
  only asserts a *single* pageId, not that it matches this page) → all checks pass →
  mint code → `savePageWithPhrasesAndShare` (one transaction) → `201 { code, url,
  pageId }`. Any validation failure throws `validationError` (400) **before** the
  persist call, so a rejected payload writes nothing. No share-code collision guard
  (unconditional `Put`; see share-flow page).
- `src/handlers/shares-resolve.ts` — `makeSharesResolveHandler(deps)`: the
  `GET /shares/{code}` **read** handler (writes nothing). Deps `{ repository }`
  injected; `ShareResolver` is a structural subset of `PageRepository`
  (`resolveShare(code) → AnalyzedPage | undefined`) so it unit-tests with a
  recording fake. Flow: read `code` from `pathParameters` (absent/empty →
  `validationError` 400, **before** any query) → `repository.resolveShare(code)`
  → `undefined` (unknown / expired / dangling share whose page is gone) →
  `shareNotFound` (404, `details: { code }`) → otherwise `200` with the
  `AnalyzedPage` (`{ page, phrases }`, phrases already index-ordered by the repo).
  Note `pathParameters?.['code']` (bracket access — `noPropertyAccessFromIndexSignature`).
- `src/router.ts` — `makeRouter(handlers)`: the transport-agnostic routing core.
  Takes a `RouterHandlers` bundle (constructed `health`/`uploads`/`scan`/
  `sharesCreate`/`sharesResolve` handlers — injected, so the router is config-free)
  and returns `(RouterRequest) => Promise<RouterResponse>`. `RouterRequest` is
  `{ method, path, rawBody? }` (path WITHOUT query string). Five routes declared to
  match specs/03 exactly: `POST /uploads`, `POST /pages`, `POST /shares`,
  `GET /shares/{code}`, `GET /health`. Matching: method is case-insensitive; path is
  normalised (trailing slash stripped, except root); `exact()` for fixed paths and
  `oneParam('/shares','code')` for the single path param (regex-free — exactly one
  non-empty trailing segment, no nested path, so bare `GET /shares` does NOT match).
  Body parsing: only POSTs parse `rawBody` as JSON (empty/whitespace → `undefined`;
  invalid JSON → `validationError` 400). **The router owns the central catch**: the
  whole dispatch is wrapped in try/catch → `toErrorResponse(error)`, so an `ApiError`
  thrown by any handler keeps its status/code and anything else becomes a 500
  `internal_error`; the router itself never throws. Unknown method+path → `notFound()`
  → 404 with code `not_found` (a constant, see below).
- `src/handlers/pages-wiring.ts` — `makeScanHandlerWithLlm(presign, opts)`: the live
  adapter binding the real `@aya/llm` `runOcr`/`analyzeText` and
  `S3PresignService.getUploadedImage` to the injectable shapes. **This is the only
  place `@aya/api` imports `@aya/llm`** (dependency direction; added `@aya/llm` to
  package deps). Image bytes are passed as `{kind:'bytes', data, mediaType}` (default
  `image/jpeg`).

## Conventions (the todo handlers must follow)

- Handlers are **factories** (`makeUploadsHandler(presign)`) with services injected;
  config (bucket, table name, base URL) is resolved at the edge, never inside.
- Validate the body with the shared schema via `safeParse`; on failure throw
  `validationError('…', { issues: parsed.error.issues })`.
- Throwing `ApiError` is the canonical non-200 path; handlers return only success
  results. The router owns `toErrorResponse` (central catch in `makeRouter`).
- Empty/absent body on `POST /uploads` is valid (defaults to `{}` → image/jpeg).

## Not yet decided / watch out

- **Reconstruction is NOT enforced by `AnalyzedPageSchema`** (it only checks shape:
  `index` is a positive **1-based** int, fields nullable). The reconstruction invariant
  is enforced upstream inside `@aya/llm` `analyzeText`, which throws on mismatch; the
  scan handler relies on that throw → 502, not on the schema. Don't assume the shared
  schema guards reconstruction.
- **Token counts are `null` in the `page_scanned` log for now.** `runOcr`/`analyzeText`
  don't surface usage (it lives in LangSmith — specs/05). The handler/log line already
  carry `ocrTokens`/`analysisTokens` fields; populate them when the LLM calls return
  usage. Not a human blocker, so no handoff.
- Share creation (built) validates `checkReconstruction` **plus** `page.id` match
  before persisting, and is the **only** write path.
- **`NOT_FOUND_CODE = 'not_found'`** (in `errors.ts`, exported) is the router's
  unknown-route 404 code. Like `internal_error`, it is **intentionally outside** the
  PRD `ErrorCode` enum — an unknown route is "no such endpoint" (transport), distinct
  from resource-not-found states (`image_not_found`/`share_not_found`). So a 404 body
  does NOT necessarily parse against the closed-enum `ErrorEnvelopeSchema`; assert it
  structurally.
