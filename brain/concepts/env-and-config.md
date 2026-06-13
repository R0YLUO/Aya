---
title: Environment variables & injected config
type: concept
packages: [llm, api, web, mobile, evals]
tasks: [llm-model-config, llm-langsmith-wiring, evals-scorer-translation-judge]
summary: Every env var the system reads today, who reads it, and the edge-injection convention (services never read env themselves).
updated: 2026-06-13
---

# Env & config (as built)

Convention: **only the edge reads the environment** (handlers' composition root,
Next server, config loaders). Services/repositories/clients receive values via
constructor/options. Env-reading functions take an injectable `env` parameter
defaulting to `process.env`, so tests pin values without mutating globals.

## Variables in use today

| Variable | Read by | Purpose |
|---|---|---|
| `AYA_OCR_MODEL` | `llm/src/config.ts` (required) | Claude model id, OCR stage |
| `AYA_ANALYSIS_MODEL` | `llm/src/config.ts` (required) | Claude model id, analysis stage |
| `AYA_JUDGE_MODEL` | `evals/src/translation.ts` (`loadJudgeConfig`, required for the real judge path) | Claude model id for the LLM-as-judge translation scorer |
| `ANTHROPIC_API_KEY` | `llm/src/config.ts` + `evals` judge (required) | Anthropic key (never logged) |
| `LANGCHAIN_TRACING_V2` | `llm/src/tracing.ts` (+ LangChain itself) | "true"/"1" enables LangSmith tracing |
| `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT` | LangChain directly | LangSmith destination |
| `AYA_ENV` | `llm/src/tracing.ts` | env tag on traces (defaults "dev") |
| `AYA_VERSION` | `api/src/handlers/health.ts` | reported by GET /health (defaults "0.1.0") |
| `AYA_TABLE_NAME` | `api/src/lambda.ts` (required) | DynamoDB table → `PageRepository` |
| `AYA_UPLOAD_BUCKET` | `api/src/lambda.ts` (required) | S3 bucket → `S3PresignService` |
| `AYA_WEB_BASE_URL` | `api/src/lambda.ts` (required) | share-link base → `ShortUrlService` |
| `AYA_API_BASE_URL` | `web/src/lib/api.ts` (SSR) | backend base URL |
| `NEXT_PUBLIC_AYA_API_BASE_URL` | `web/src/lib/api.ts` (fallback) | public backend base URL |

## The Lambda edge now reads these (was "injected-not-env")

`api/src/lambda.ts` (`buildRouter`) is the edge that resolves the three resource
vars and constructs the services — closing the loop the earlier infra tasks set up:

- `AYA_TABLE_NAME` → `PageRepository` (produced by `infra-dynamodb-table`).
- `AYA_UPLOAD_BUCKET` → `S3PresignService` (produced by `infra-s3-bucket`).
- `AYA_WEB_BASE_URL` → `ShortUrlService` (share-link base). Added by
  `infra-api-gateway-lambda`; non-secret config with a `https://<stage>.aya.example`
  synthesis placeholder.

`infra-api-gateway-lambda` sets all of the above on the Lambda's `environment`,
plus the model/LangSmith vars (`AYA_OCR_MODEL`, `AYA_ANALYSIS_MODEL`,
`LANGCHAIN_*`, `AYA_ENV`) `@aya/llm` reads, with `ANTHROPIC_API_KEY` /
`LANGCHAIN_API_KEY` sourced from `sst.Secret`s (`AnthropicApiKey`,
`LangsmithApiKey`).

`infra-web-hosting` wires the web hosting env (`sst.aws.Nextjs`): it injects
`AYA_API_BASE_URL` + `NEXT_PUBLIC_AYA_API_BASE_URL` (both = `api.url`) into the web
site, and feeds the web site's `web.url` back into the API Lambda's
`AYA_WEB_BASE_URL` (so minted share links point at the deployed reader). The
`webBaseUrl` default is now `web.url`, overridable via `process.env["AYA_WEB_BASE_URL"]`.

Still injected-not-env elsewhere:

- API base URL → mobile `AyaApiClient` (`config.baseUrl`; mobile has no env scheme
  yet — `mobile-share-flow` / app bootstrap will need one).

All infra resources are now defined; the cross-package env loop (web ↔ API) is closed.
**Update this table whenever a variable is added or renamed.**
