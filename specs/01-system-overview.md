# System Overview

## The whole thing in one picture

```
┌─────────────┐         ┌─────────────┐
│  Mobile app │         │  Web reader │   ← clients
│ (React      │         │  (Next.js)  │
│  Native)    │         │             │
└──────┬──────┘         └──────┬──────┘
       │   same REST API, same shared types   │
       └──────────────┬───────────────────────┘
                      ▼
            ┌───────────────────┐
            │   API (Lambda +   │   ← single TypeScript backend
            │   API Gateway)    │
            └─────┬──────┬──────┘
                  │      │
        ┌─────────┘      └──────────┐
        ▼                           ▼
┌───────────────┐          ┌─────────────────┐
│  LLM pipeline │          │   Persistence   │
│  (LangChain   │          │  DynamoDB (data)│
│   + Claude)   │          │  S3 (ephemeral  │
│  ① OCR        │          │     images)     │
│  ② Analysis   │          └─────────────────┘
└───────┬───────┘
        │ traces, cost, latency, evals
        ▼
   ┌──────────┐
   │ LangSmith│
   └──────────┘
```

## Core idea: photo → value in two LLM calls

The entire pipeline from photo to a tappable reader is **two LLM calls**, orchestrated
server-side behind a single endpoint:

1. **OCR call** — Claude (vision) reads the photo and returns the raw text →
   `Page.fullText`. This raw text is also our ground-truth artifact for debugging and evals.
2. **Analysis call** — Claude (text, via LangChain structured output) turns `fullText` into
   an **ordered list of `Phrase` tokens**, each fully analysed at scan time (pinyin,
   translation, contextual meaning). Punctuation and line breaks are tokens too — they carry
   no analysis and render non-tappable.

Both calls happen inside one request so the client makes a single `POST /pages` and gets back
`{ page, phrases }`. Nothing is persisted to the cloud database on this path — see below.

See [`04-llm-pipeline.md`](./04-llm-pipeline.md) for the chains and prompts, and
[`02-data-model.md`](./02-data-model.md) for the shapes.

## Local-first, share-to-cloud

- The mobile app is **local-first**: scanned pages live on the device. (The specific on-device
  store is intentionally out of scope for this architecture — the client team owns it.)
- We write to **DynamoDB only when the user shares a page to the web reader.** At that moment
  the mobile app uploads the `Page` + its `Phrase`s, the backend persists them and mints a
  **short URL**, and the web reader serves that page to anyone who opens the link.
- This keeps the scan path stateless and cheap (North Star: *Fast & Efficient*) and means the
  cloud only ever holds data a user deliberately chose to share.

## Request flows (high level)

**Scan (stateless, no DB write):**
```
mobile → POST /uploads        → { uploadUrl, imageKey }     (presigned S3 PUT)
mobile → PUT  <uploadUrl>      → 200                          (photo straight to S3)
mobile → POST /pages {imageKey}→ { page, phrases }            (OCR → analysis, returned)
        (mobile stores result locally; nothing persisted server-side)
```

**Share (the only write path):**
```
mobile → POST /shares { page, phrases } → { code, url }       (persist + mint short URL)
browser→ GET  /s/{code}                 → web reader renders { page, phrases }
```

Full contracts are in [`03-api-design.md`](./03-api-design.md).

## Technology choices at a glance

| Concern | Choice | Why (North Star) |
|--------|--------|------------------|
| Language | TypeScript everywhere | Extensible (shared types across clients + backend) |
| Backend runtime | AWS Lambda + API Gateway | Fast & Efficient (scale-to-zero, pay-per-scan), Reliable (managed) |
| LLM orchestration | LangChain + Claude | Accurate (vision OCR + structured analysis), Extensible (isolated) |
| Database | DynamoDB (single-table) | Reliable (managed), Fast (single-key page reads) |
| Image transport | S3 presigned upload, ephemeral | Reliable (no payload limits), UX (robust on mobile networks) |
| Observability + evals | LangSmith (+ CloudWatch for infra) | Accurate + Fast & Efficient (measured quality & cost) |
| Web reader | Next.js | UX (large-screen reading), Extensible (same API/types) |
| Mobile | React Native | UX (native camera), Extensible (one codebase, two platforms) |
| Infra-as-code | SST | Reliable + Extensible (TS-native, one repo) — *revisable, see ADRs* |
| No auth/authz | Intentionally omitted | Out of scope per product direction (see PRD) |

## Monorepo layout

Turborepo workspaces under `packages/*` (see [`07-monorepo-and-deployment.md`](./07-monorepo-and-deployment.md)
for detail):

```
packages/
  shared/   — domain types (Page, Phrase) + Zod contracts shared by all packages
  llm/      — LangChain chains (OCR, analysis), prompts, output schemas, LangSmith wiring
  api/      — Lambda handlers, routing, DynamoDB repositories, S3 presign, short-URL service
  web/      — Next.js web reader (shared-URL viewer + hover-to-translate)
  mobile/   — React Native app (camera, local-first reader)  [client team owns internals]
  evals/    — eval datasets + scorers, run against the llm package via LangSmith
  infra/    — SST app defining Lambda, API Gateway, DynamoDB, S3, env config
```

The dependency direction is one-way: `shared` is depended on by everyone; `llm` is used by
`api` and `evals`; clients (`web`, `mobile`) depend only on `shared` and the HTTP API. This
keeps the LLM and persistence details out of the clients (North Star: *Extensible*).
