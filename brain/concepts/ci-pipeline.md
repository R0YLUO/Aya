---
title: CI pipeline (GitHub Actions)
type: concept
packages: []
tasks: [ci-core-pipeline]
summary: .github/workflows/ci.yml runs npm ci → typecheck → lint → build on every PR and main push, with Turborepo caching via actions/cache on .turbo. Eval and e2e gates are NOT wired here yet.
updated: 2026-06-13
---

# CI pipeline (GitHub Actions)

Intent: `specs/07-monorepo-and-deployment.md` (CI/CD table). This page is the as-built map.

## The workflow

`.github/workflows/ci.yml` — one job `core` on `ubuntu-latest`:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` with `node-version: 22` and `cache: npm` (caches the npm
   download cache keyed on `package-lock.json`).
3. `actions/cache@v4` over `.turbo` — Turborepo's local filesystem cache lives in
   `.turbo/cache` (verified locally). Key is busted on `package-lock.json`/`turbo.json`
   change, with `restore-keys` falling back to the latest cache for the OS. This is what
   makes re-runs hit `>>> FULL TURBO` and only rebuild changed packages (North Star:
   Fast & Efficient).
4. `npm ci`
5. `npm run typecheck` → `npm run lint` → `npm run build` (each its own step so the red
   step is obvious). Any non-zero exit fails the job.

Triggers: `pull_request` (all branches) and `push` to `main`. `concurrency` cancels
superseded runs on the same ref.

## Why these three steps enforce the shared-types contract

`typecheck`/`lint`/`build` all declare `dependsOn: ["^build"]` in `turbo.json`, so a
package is checked against its dependencies' **built** output. `@aya/shared` is the root
of the dependency graph; a breaking change to its types fails `tsc` in every dependent
(`llm`, `api`, `web`, `mobile`, `evals`) — the acceptance-criteria "breaking @aya/shared
fails typecheck in dependents" guarantee. No extra config needed; it falls out of the
existing turbo task graph.

## Not yet wired here

- **Eval gate** (`npm run eval -w packages/evals`, required on PRs touching
  `packages/llm`) — the spec calls for it but it is not in this workflow. It needs the
  Anthropic + LangSmith keys (see those handoffs) to run for real; offline `npm run eval`
  works but wasn't added as a job. Future task.
- **Playwright e2e gate** (`npm run test:e2e -w @aya/web`, ADR-0011) — also not wired
  here; it would need `npx playwright install chromium` first.
- **Deploy** (SST to dev/prod) — out of scope for this task; blocked on the aws-account
  handoff regardless.

## Verification status

Workflow has **never run on GitHub** — there is no Actions history for this repo yet.
The three commands were each run locally and pass (`>>> FULL TURBO` on cached runs). First
real CI run will confirm the YAML and cache wiring on a clean runner. See the
`ci-first-run` handoff.
