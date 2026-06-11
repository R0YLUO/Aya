---
title: "infra-api-gateway-lambda: HTTP API + scan Lambda + composition root"
type: log
packages: [api]
tasks: [infra-api-gateway-lambda]
summary: Built the @aya/api Lambda composition root + API Gateway v2 adapter and wired the SST HTTP API with five routes to one Lambda (heavy POST /pages at 25s/1024 MB), linked least-privilege to the table + bucket, with secrets/env injected.
updated: 2026-06-11
---

# infra-api-gateway-lambda

## What was built

Two halves, code + infra:

1. **`packages/api/src/lambda.ts`** — the composition root and API Gateway v2
   (HTTP API) adapter. The only place `@aya/api` instantiates real AWS clients
   (`DynamoDBDocumentClient`, `S3Client`) and reads the env. `buildRouter(env)`
   `requireEnv`s `AYA_TABLE_NAME`/`AYA_UPLOAD_BUCKET`/`AYA_WEB_BASE_URL`, builds
   `PageRepository`/`S3PresignService`/`ShortUrlService`, and wires the five
   handlers into `makeRouter` (scan via `makeScanHandlerWithLlm(presign,{env})`).
   `toRouterRequest` maps `requestContext.http.method` + `rawPath` and
   base64-decodes the body. `handler` lazily builds+caches the router on first
   invocation (so importing the module in tests doesn't need the Lambda env) and
   returns a JSON proxy result. Exported from the index barrel.
   `lambda.test.ts` adds 5 tests (adapter mapping, base64 body, env-validation
   throw, health dispatch, 404) — all offline, no AWS calls.

2. **`packages/infra/sst.config.ts`** — `new sst.aws.ApiGatewayV2("Api")` + five
   explicit `api.route()` calls (`POST /uploads`, `POST /pages`, `POST /shares`,
   `GET /shares/{code}`, `GET /health`) all pointing at `"../api/src/lambda.handler"`.
   `POST /pages` gets `timeout: "25 seconds"` (> ~15s LLM budget, < 29s API GW
   limit) + `memory: "1024 MB"`; others use shared `baseFn`. Every route
   `link: [table, uploadBucket]` (SST-derived least-privilege IAM). Env map injects
   the resource names + `AYA_WEB_BASE_URL` + model ids + `LANGCHAIN_*`/`AYA_ENV`,
   with `ANTHROPIC_API_KEY`/`LANGCHAIN_API_KEY` from `new sst.Secret(...)`
   (`AnthropicApiKey`, `LangsmithApiKey`). Added `api.url` stack output.

## Verification

- `npm run typecheck && npm run lint && npm run build` — all green (8/8, 8/8, 5/5).
- `@aya/api` tests: 71 pass (5 new).
- `sst diff --stage dev`: config loads and synthesizes, stops at the AWS-credentials
  refresh (no account) — exactly the documented synthesis-only level.

## Handoff

Updated [aws-account](../handoffs/aws-account.md): added `infra-api-gateway-lambda`
context + the two `sst secret set` steps (AnthropicApiKey, LangsmithApiKey) required
before a real deploy. Real end-to-end (deploy + live HTTP) stays gated on that handoff.

## Notes / decisions

- One Lambda serves all five routes (router dispatches) — not five functions.
- Lambda handler path is relative to `sst.config.ts` (infra dir), hence `"../api/...".
- Secrets vs config split: only API keys are `sst.Secret`; model ids + web base URL
  are non-secret env with real-string synthesis placeholders.
