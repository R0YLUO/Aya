---
title: Environment variables & injected config
type: concept
packages: [llm, api, web, mobile]
tasks: [llm-model-config, llm-langsmith-wiring]
summary: Every env var the system reads today, who reads it, and the edge-injection convention (services never read env themselves).
updated: 2026-06-10
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
| `ANTHROPIC_API_KEY` | `llm/src/config.ts` (required) | Anthropic key (never logged) |
| `LANGCHAIN_TRACING_V2` | `llm/src/tracing.ts` (+ LangChain itself) | "true"/"1" enables LangSmith tracing |
| `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT` | LangChain directly | LangSmith destination |
| `AYA_ENV` | `llm/src/tracing.ts` | env tag on traces (defaults "dev") |
| `AYA_VERSION` | `api/src/handlers/health.ts` | reported by GET /health (defaults "0.1.0") |
| `AYA_API_BASE_URL` | `web/src/lib/api.ts` (SSR) | backend base URL |
| `NEXT_PUBLIC_AYA_API_BASE_URL` | `web/src/lib/api.ts` (fallback) | public backend base URL |

## Injected-not-env (constructor params today; infra will wire them from env)

- DynamoDB table name → `PageRepository`.
- S3 bucket → `S3PresignService`.
- Web base URL (for share links) → `ShortUrlService`.
- API base URL → mobile `AyaApiClient` (`config.baseUrl`; mobile has no env scheme
  yet — `mobile-share-flow` / app bootstrap will need one).

The `infra-*` tasks (all todo) own actually setting these in Lambda/hosting env.
**Update this table whenever a variable is added or renamed.**
