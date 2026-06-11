---
title: "@aya/api"
type: package
packages: [api]
tasks: [api-package-scaffold, api-error-envelope, api-dynamodb-repository, api-s3-presign-service, api-short-url-service, api-handler-health, api-handler-uploads, api-handler-pages, api-handler-shares-create]
summary: Transport-agnostic handlers (health, uploads, pages/scan, shares-create built; shares-resolve/router todo), ApiError→envelope mapping, DynamoDB repository, S3 presign, short-URL service.
updated: 2026-06-11
---

# @aya/api (as built)

Lambda-destined backend. **No router yet** (task `api-router` todo): handlers are
transport-agnostic functions; API Gateway adaptation and the central error catch will
live in the router.

## Status

- Built: `errors.ts`, `repositories/`, `services/`, handlers for `GET /health`,
  `POST /uploads`, `POST /pages` (the scan orchestration), and `POST /shares` (the
  create handler — the only write path).
- Todo: `api-handler-shares-resolve`, `api-router`. The `infra-*` tasks (SST) are all
  todo.

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
  results. The router will own `toErrorResponse`.
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
