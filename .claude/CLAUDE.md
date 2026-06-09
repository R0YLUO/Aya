# CLAUDE.md

Guidance for Claude Code (and any contributor) working in this repository. Read this first.

## What Aya is

Aya is a **Chinese Reading Companion**. An intermediate Mandarin learner photographs a page of a
physical Simplified-Chinese book; Aya extracts the text, segments it into meaningful **phrases**
(idioms and compounds kept whole — never character-by-character), and renders a clean, tappable
reader. Tapping a phrase shows its pinyin, translation, and contextual meaning. A shared **short
URL** opens the same analysed page in a web reader.

- Product spec: [`specs/reading-companion-prd.md`](./specs/reading-companion-prd.md)
- **Architecture (source of truth): [`architecture/`](./architecture/) — read [`architecture/README.md`](./architecture/README.md) before making design decisions.**

## North Stars — the bar for every decision

Every non-trivial change must visibly serve at least one and contradict none. Full definitions in
[`architecture/00-north-stars.md`](./architecture/00-north-stars.md).

1. **Fast & Efficient** — few LLM calls, scale-to-zero infra, measured cost.
2. **User-Experience-Centric** — clean tappable phrases, instant taps, clear errors.
3. **Extensible** — one backend, shared types, isolated LLM logic, additive schema.
4. **Reliable & Stable** — validated structured output, handled edge cases, managed infra.
5. **Accurate** — ≥95% OCR, idioms kept whole, contextual translations, **evals gate changes**.

If a change can't be justified against these, don't make it.

## Architecture in one breath

Photo → **two LLM calls**: ① Claude-vision **OCR** → `Page.fullText`; ② Claude **analysis** →
ordered `Phrase[]` (pinyin, translation, contextual meaning), computed **eagerly** at scan. The
scan endpoint (`POST /pages`) is **stateless — it persists nothing**. We write to **DynamoDB only
when a user shares** a page (`POST /shares`), which mints a short URL the web reader serves. Auth
is intentionally out of scope.

Key docs:
- System & flows → [`architecture/01-system-overview.md`](./architecture/01-system-overview.md)
- Data model (`Page`/`Phrase`/`Share`, DynamoDB single-table) → [`architecture/02-data-model.md`](./architecture/02-data-model.md)
- REST API contracts → [`architecture/03-api-design.md`](./architecture/03-api-design.md)
- LLM chains & prompts → [`architecture/04-llm-pipeline.md`](./architecture/04-llm-pipeline.md)
- Observability → [`architecture/05-observability.md`](./architecture/05-observability.md)
- Evals → [`architecture/06-evals.md`](./architecture/06-evals.md)
- Monorepo & deploy → [`architecture/07-monorepo-and-deployment.md`](./architecture/07-monorepo-and-deployment.md)
- Decisions log (ADRs) → [`architecture/08-decisions-log.md`](./architecture/08-decisions-log.md)

## Repository layout

Turborepo + npm workspaces, TypeScript everywhere. Packages live under `packages/*`:

```
shared/  domain types (Page, Phrase, Share) + Zod contracts — depended on by everyone
llm/     LangChain chains (runOcr, analyzeText), prompts, output schemas, LangSmith wiring
api/     Lambda handlers, routing, DynamoDB repositories, S3 presign, short-URL service
web/     Next.js web reader (/s/{code} viewer + hover-to-translate)
mobile/  React Native app (camera, local-first reader) — client team owns internals
evals/   eval datasets + scorers, run against packages/llm via LangSmith
infra/   SST app: Lambda, API Gateway, DynamoDB, S3, env wiring
```

Dependency direction is one-way: `shared` ← `llm` ← `api`/`evals`; clients depend only on
`shared` + the HTTP API. **Never** import `llm`/`api`/persistence into `web` or `mobile`.

> Most `packages/*` don't exist yet — this is the initial architecture. When you create a
> package, follow this layout and the dependency rules.

## Commands

From the repo root (Turborepo orchestrates per-package tasks):

```bash
npm install            # install workspace deps
npm run build          # turbo run build
npm run dev            # turbo run dev
npm run typecheck      # turbo run typecheck  ← shared-types contract holds across packages
npm run lint           # turbo run lint
npm run clean          # turbo run clean
npm run eval -w packages/evals   # run the LLM eval suite (once packages/evals exists)
```

Node >= 22, npm 10.9.x (see root `package.json`).

## Golden rules for changes

1. **Read the relevant `architecture/` doc before designing.** It is the source of truth.
2. **No prompt/chain/model change without an eval run.** Anything touching `packages/llm`
   (prompts, output schemas, model config) must run the eval suite and not regress. Accuracy is
   non-negotiable — see [`architecture/06-evals.md`](./architecture/06-evals.md).
3. **LLM output is always structured and Zod-validated.** Never render or trust raw model text.
   The analysis call must pass the **reconstruction check**
   (`tokens.join("") === fullText`) — this guarantees faithful page rebuilds.
4. **Keep it two LLM calls.** Don't add model round-trips to the scan path without an ADR.
5. **Types are defined once, in `packages/shared`.** Don't duplicate `Page`/`Phrase`/`Share` or
   API contracts. A contract change should ripple through `typecheck`, not fail in production.
6. **Don't persist on the scan path.** Writes happen only at `POST /shares`.
7. **No secrets in code.** Model keys, LangSmith keys, and resource names come from env
   (see [`architecture/07-monorepo-and-deployment.md`](./architecture/07-monorepo-and-deployment.md)).
8. **Record non-trivial decisions** as a new ADR in
   [`architecture/08-decisions-log.md`](./architecture/08-decisions-log.md), referencing the
   North Stars. If you change an existing decision, update its ADR (status `superseded`) and the
   affected doc(s).
9. **When picking/updating a Claude model id,** consult the `claude-api` skill / current
   Anthropic model list rather than hard-coding from memory. Model ids are config, not literals.

## Out of scope (don't build unless the PRD changes)

Auth/authz, user accounts, traditional Chinese, audio/TTS, vocab saving/flashcards, reading
history, the mobile on-device store internals, per-character breakdown & example sentences
(deferred — see [ADR-0003](./architecture/08-decisions-log.md)).

## Conventions

- TypeScript, strict. Validate at boundaries with Zod (shared schemas).
- REST, JSON, consistent error envelope with machine-readable `code`s mapped to PRD error states.
- DynamoDB single-table; repositories in `packages/api` translate between items and domain types.
- Keep docs honest: if behaviour changes, update `architecture/` in the same change.
