---
title: CI pipeline (GitHub Actions)
type: concept
packages: [evals]
tasks: [ci-core-pipeline, ci-evals-gate]
summary: .github/workflows/ci.yml runs npm ci → typecheck → lint → build on every PR and main push (Turborepo caching). .github/workflows/evals.yml is the accuracy gate — a path-filtered job (packages/llm|evals|shared) that runs the evals baseline-gate self-tests + `npm run eval` and fails on regression/threshold breach. The Playwright e2e gate is still NOT wired here.
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

## The eval gate workflow (ci-evals-gate)

`.github/workflows/evals.yml` — one job `evals` on `ubuntu-latest`. This is the
"no prompt/chain/model change without an eval run" gate (CLAUDE.md golden rule #2,
specs/06-evals.md).

- **Path-filtered at the trigger level**: `pull_request` and `push` to `main` both
  filter on `packages/llm/**`, `packages/evals/**`, `packages/shared/**`. The whole job
  is **skipped** (not early-exited) when the LLM pipeline / eval suite / shared contracts
  are untouched, so unrelated PRs stay fast. (Job-level `paths` doesn't exist in Actions —
  it's a trigger-level filter, which is why this is a separate workflow file from `ci.yml`,
  whose core pipeline must run on every PR.)
- Steps: checkout → setup-node 22 (npm cache) → restore `.turbo` cache → `npm ci` →
  **`npm run test -w @aya/evals`** (the baseline-gate self-tests) → **`npm run eval -w packages/evals`**.
- **Where the "simulated regression fails / passing run succeeds" guarantee lives:** the
  `npm run test -w @aya/evals` step. `packages/evals/src/report.test.ts` deterministically
  asserts `compareToBaseline` fails on a regression-beyond-tolerance, a "lower is better"
  metric rising, an absolute-threshold breach, and the idiom-split ceiling-0 / reconstruction
  floor-1.0 hard fails — and passes a within-tolerance run. This runs **offline** (no API
  key) so the gate's enforcement is proven on every CI run regardless of secrets.
- **Real model path:** `ANTHROPIC_API_KEY` is wired from a repo secret and the three model
  ids (`AYA_OCR_MODEL`/`AYA_ANALYSIS_MODEL`/`AYA_JUDGE_MODEL`) from repo `vars`. When the
  secret is absent the model stages are SKIPPED and not gated (`npm run eval` exits 0); when
  present, the eval CLI runs the real `runOcr`/`analyzeText` (+ judge), compares the six
  headline metrics to `datasets/baseline.json`, and exits non-zero on any regression or
  threshold breach.

## Not yet wired here

- **Playwright e2e gate** (`npm run test:e2e -w @aya/web`, ADR-0011) — not wired in either
  workflow; it would need `npx playwright install chromium` first.
- **Deploy** (SST to dev/prod) — out of scope; blocked on the aws-account handoff regardless.

## Verification status

Neither workflow has **ever run on GitHub** — there is no Actions history for this repo yet.
For `ci.yml`, the three commands each pass locally (`>>> FULL TURBO` on cached runs). For
`evals.yml`, both gate commands pass locally offline (`npm run test -w @aya/evals` = 69/69;
`npm run eval -w packages/evals` exits 0 with model stages skipped). First real CI run will
confirm the YAML, path filters, and cache wiring on a clean runner, and the real-model branch
of the eval gate stays pending the `anthropic-api-key` handoff (secret not set yet). See the
`ci-first-run` handoff.
