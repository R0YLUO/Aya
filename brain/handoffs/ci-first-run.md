---
title: Confirm the CI workflows run green on GitHub Actions
type: handoff
packages: [evals]
tasks: [ci-core-pipeline, ci-evals-gate]
status: open
updated: 2026-06-13
summary: .github/workflows/ci.yml (typecheck/lint/build + turbo cache) and .github/workflows/evals.yml (path-filtered eval/accuracy gate) are committed but have never executed on GitHub Actions — all steps were only verified locally. A real run on a clean runner is still pending, plus Actions must be enabled and (optionally) the jobs made required checks.
---

# Confirm the CI workflows run green on GitHub Actions

## What's needed

Push these commits (or open a PR) and confirm both the **CI** workflow and the **Evals gate**
workflow run on GitHub Actions go green. Ensure GitHub Actions is enabled for the
`R0YLUO/Aya` repo. Optionally make the `core` job (and the `evals` job, on PRs touching the
LLM pipeline) required status checks on `main` so they actually gate PRs.

To exercise the **real-model** branch of the eval gate (not just the offline baseline-gate
self-tests), set the `ANTHROPIC_API_KEY` repo secret and the `AYA_OCR_MODEL` /
`AYA_ANALYSIS_MODEL` / `AYA_JUDGE_MODEL` repo `vars` — see the `anthropic-api-key` handoff.
Without them the eval job still runs and passes (model stages skipped), but it never hits the
real API.

## Why

`.github/workflows/ci.yml` and `.github/workflows/evals.yml` were authored and each of their
commands passes locally (`npm run typecheck`/`lint`/`build`; `npm run test -w @aya/evals` =
69/69; `npm run eval -w packages/evals` exits 0 offline), but neither workflow has ever run on
a GitHub runner. A clean-runner run is the only thing that verifies: `npm ci` resolves on CI,
the `actions/cache` wiring over `.turbo` actually persists/restores, the YAML is accepted, and
the evals.yml **path filter** behaves (the eval job triggers on a `packages/llm` change and is
skipped otherwise).

## Verify after

- The **CI** workflow appears under the repo's Actions tab and its latest run on `main`
  is green.
- The **Evals gate** workflow triggers on a PR that touches `packages/llm` (or `evals`/`shared`)
  and is skipped on a PR that touches nothing under those paths.
- A second run on an unrelated change shows Turbo cache hits (`>>> FULL TURBO` /
  "Cached: N total") for unaffected packages, confirming caching works on CI.
