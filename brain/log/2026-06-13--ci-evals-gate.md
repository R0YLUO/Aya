---
title: "ci-evals-gate: CI accuracy gate on packages/llm changes"
type: log
packages: [evals]
tasks: [ci-evals-gate]
summary: Added .github/workflows/evals.yml — a path-filtered GitHub Actions job (packages/llm|evals|shared) that runs the evals baseline-gate self-tests + `npm run eval` and fails on regression/threshold breach, enforcing "no prompt/chain/model change without an eval run".
updated: 2026-06-13
---

# ci-evals-gate

Wired the eval/accuracy CI gate the spec (07-monorepo-and-deployment.md CI/CD table,
06-evals.md "Lifecycle integration") and CLAUDE.md golden rule #2 call for.

## What was built

- `.github/workflows/evals.yml` — job `evals` on ubuntu-latest. Trigger-level
  `paths` filter on `packages/llm/**`, `packages/evals/**`, `packages/shared/**` for both
  `pull_request` and `push` to `main`, so the whole job is **skipped** (not early-exited) when
  the LLM pipeline / eval suite / shared contracts are untouched. Separate file from `ci.yml`
  because Actions has no job-level `paths` and the core pipeline must run on every PR.
- Steps: checkout → setup-node 22 (npm cache) → restore `.turbo` cache (same keys as `ci.yml`)
  → `npm ci` → `npm run test -w @aya/evals` → `npm run eval -w packages/evals`.
- `ANTHROPIC_API_KEY` from a repo secret; `AYA_OCR_MODEL`/`AYA_ANALYSIS_MODEL`/`AYA_JUDGE_MODEL`
  from repo `vars`. Absent the secret, model stages are skipped and the eval CLI exits 0 — but
  the baseline-gate self-tests still run, so the gate's enforcement is proven on every run.

## How it meets the acceptance criteria

- *Triggered (path filter) when packages/llm changes & runs the suite*: the `paths` trigger
  filter includes `packages/llm/**`; the job runs `npm run eval -w packages/evals`.
- *A simulated regression fails the job; a passing run succeeds*: proven offline and
  deterministically by the `npm run test -w @aya/evals` step. `packages/evals/src/report.test.ts`
  already asserts `compareToBaseline` fails on a regression-beyond-tolerance, a "lower is better"
  metric rising, an absolute-threshold breach, and the idiom-split ceiling-0 / reconstruction
  floor-1.0 hard fails, and passes a within-tolerance run. (The real-model CLI run additionally
  exits non-zero on a live regression once `ANTHROPIC_API_KEY` is set.)
- *Enforces "no prompt/chain/model change without an eval run"*: that is the path filter + gate.
- *Documented in the repo*: the spec CI/CD table now points at `evals.yml`; the workflow file
  carries a thorough header; brain ci-pipeline concept + evals package page updated.

## Verification

- `npm run test -w @aya/evals` → 69/69 pass (offline).
- `npm run eval -w packages/evals` → exits 0 offline (model stages skipped, baseline comparison PASS).
- Specific regression test runs green: `compareToBaseline: a regression beyond tolerance fails`.
- `npm run typecheck` + `npm run lint` green (workflow file doesn't touch them).
- `evals.yml` parses as valid YAML (jobs/paths/steps confirmed).

## Pending / handoff

Neither CI workflow has run on GitHub yet, and the real-model branch of the eval gate needs the
`ANTHROPIC_API_KEY` secret + model-id vars. Folded into the existing `ci-first-run` handoff
(updated to cover `evals.yml`, its path-filter behaviour, and the secret/vars needed) and the
`anthropic-api-key` handoff remains the source for the real API run.
