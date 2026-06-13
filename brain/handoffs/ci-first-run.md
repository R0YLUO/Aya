---
title: Confirm the CI workflow runs green on GitHub Actions
type: handoff
packages: []
tasks: [ci-core-pipeline]
status: open
updated: 2026-06-13
summary: .github/workflows/ci.yml (typecheck/lint/build + turbo cache) is committed but has never executed on GitHub Actions — its three steps were only verified locally. A real run on a clean runner is still pending.
---

# Confirm the CI workflow runs green on GitHub Actions

## What's needed

Push this commit (or open a PR) and confirm the **CI** workflow run on GitHub Actions
goes green. Ensure GitHub Actions is enabled for the `R0YLUO/Aya` repo. Optionally make
the `core` job a required status check on `main` so it actually gates PRs.

## Why

`.github/workflows/ci.yml` was authored and each of its commands (`npm run typecheck`,
`npm run lint`, `npm run build`) passes locally, but the workflow itself has never run on
a GitHub runner. A clean-runner run is the only thing that verifies: `npm ci` resolves on
CI, the `actions/cache` wiring over `.turbo` actually persists/restores, and the YAML is
accepted by Actions.

## Verify after

- The **CI** workflow appears under the repo's Actions tab and its latest run on `main`
  is green.
- A second run on an unrelated change shows Turbo cache hits (`>>> FULL TURBO` /
  "Cached: N total") for unaffected packages, confirming caching works on CI.
