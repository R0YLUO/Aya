---
title: "ci-core-pipeline: GitHub Actions core pipeline (typecheck/lint/build)"
type: log
packages: []
tasks: [ci-core-pipeline]
summary: Added .github/workflows/ci.yml — npm ci → typecheck → lint → build on every PR and main push, with npm + Turborepo (.turbo) caching. Shared-types contract enforced via the existing turbo ^build task graph.
updated: 2026-06-13
---

# ci-core-pipeline

Added the first CI config: `.github/workflows/ci.yml`. One `core` job on
`ubuntu-latest` — `actions/checkout` → `setup-node@22` (npm cache) →
`actions/cache@v4` over `.turbo` → `npm ci` → `npm run typecheck` → `npm run lint`
→ `npm run build`. Triggers on `pull_request` and `push` to `main`; `concurrency`
cancels superseded runs.

- The shared-types contract enforcement falls out for free: turbo's
  `typecheck`/`lint`/`build` tasks all `dependsOn: ^build`, so a breaking
  `@aya/shared` change fails `tsc` in every dependent. No extra config.
- Turbo caches into `.turbo/cache` (verified locally); the workflow persists `.turbo`.
- Verified locally: typecheck/lint/build all pass (`>>> FULL TURBO` on cached runs).
  The workflow has never run on a real GitHub runner — recorded the `ci-first-run`
  handoff.

Brain pages touched: new `concepts/ci-pipeline.md`, new `handoffs/ci-first-run.md`,
this log. Eval and e2e CI gates deliberately left out of scope (noted in the concept page).
