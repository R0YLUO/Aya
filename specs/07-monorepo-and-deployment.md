# Monorepo & Deployment

Aya is a **Turborepo + npm workspaces** monorepo, TypeScript end to end, deployed to AWS as
serverless infrastructure defined in code with **SST**.

## Packages

```
packages/
  shared/   — domain types (Page, Phrase, Share) + Zod request/response contracts
  llm/      — LangChain chains (runOcr, analyzeText), prompts, output schemas, LangSmith wiring
  api/      — Lambda handlers, routing, DynamoDB repositories, S3 presign, short-URL service
  web/      — Next.js web reader (the /s/{code} viewer + hover-to-translate)
  mobile/   — React Native app (camera, local-first reader)  [client team owns internals]
  evals/    — eval datasets + scorers, run against packages/llm via LangSmith
  infra/    — SST app: Lambda, API Gateway, DynamoDB table, S3 bucket, env wiring
```

**Dependency direction (one-way, enforced):**

```
shared  ◀── llm ◀── api ◀── infra
   ▲        ▲
   │        └── evals
   └── web
   └── mobile
```

- `shared` is the only thing everyone depends on — the single definition of the domain and the
  API contract.
- `llm` is used by `api` (production) and `evals` (testing) — identical code path, so evals test
  what ships (North Star: *Accurate*).
- Clients (`web`, `mobile`) depend on `shared` and talk to the API over HTTP only. They never
  import `llm`, `api`, or persistence code (North Star: *Extensible*).

Existing root config (`package.json`, `turbo.json`) already sets up workspaces and the
`build`/`dev`/`lint`/`typecheck`/`clean` tasks; new packages slot under `packages/*`.

## AWS resources (per stage)

| Resource | Purpose |
|----------|---------|
| **API Gateway (HTTP API)** | Public REST surface; routes to Lambda |
| **Lambda functions** | `POST /uploads`, `POST /pages`, `POST /shares`, `GET /shares/{code}`, `GET /health` |
| **DynamoDB table** `aya-<stage>` | Single-table store for `Page`/`Phrase`/`Share` (on-demand billing) |
| **S3 bucket** `aya-uploads-<stage>` | Ephemeral image uploads via presigned PUT; lifecycle rule auto-deletes objects |
| **(Web) Next.js hosting** | The web reader; SSR for `/s/{code}` |

The heavy `POST /pages` Lambda needs a generous timeout (comfortably above the ~15s LLM budget,
under the API Gateway 29s integration limit) and enough memory for image handling.

## Configuration (environment)

No secrets in code. Per-stage config via SST/Lambda environment:

```
# Model + LLM
ANTHROPIC_API_KEY=...
AYA_OCR_MODEL=claude-...
AYA_ANALYSIS_MODEL=claude-...

# Observability / evals
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=...
LANGCHAIN_PROJECT=aya-<stage>

# AWS resources (injected by SST)
AYA_TABLE_NAME=aya-<stage>
AYA_UPLOAD_BUCKET=aya-uploads-<stage>
```

Security/auth is intentionally out of scope, so there is no auth provider, token store, or
per-user config to manage.

## Environments

- **dev** — for development and eval iteration.
- **prod** — public.

Each stage is a fully isolated SST deployment (own table, bucket, functions, LangSmith project),
so dev traffic and dev evals never touch prod data or prod dashboards.

## CI/CD

| Step | What runs |
|------|-----------|
| `typecheck` | `turbo run typecheck` — the shared-types contract holds across all packages |
| `lint` | `turbo run lint` |
| `build` | `turbo run build` |
| **evals** | `npm run eval -w packages/evals` — **required on any PR touching `packages/llm`** (see [`06-evals.md`](./06-evals.md)) |
| deploy | SST deploy to `dev`, then promote to `prod` |

Turborepo caching keeps CI fast by only rebuilding/testing what changed (North Star:
*Fast & Efficient* — applied to our own dev loop).

## Why SST (and how to revisit)

SST is TypeScript-native, models Lambda + API Gateway + DynamoDB + S3 + Next.js in one app, and
keeps infra in the same repo and language as the code (North Stars: *Reliable*, *Extensible*).
It's a **chosen default, not a hard requirement** — AWS CDK is the obvious alternative if the
team prefers it. See [ADR-0007](./08-decisions-log.md).
