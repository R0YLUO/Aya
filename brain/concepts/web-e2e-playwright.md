---
title: Web e2e & UI verification (Playwright)
type: concept
packages: [web, shared]
tasks: []
summary: The hermetic Playwright harness in packages/web/e2e — stub API on 4545, next dev on 3100, fixture-filename-is-the-share-code, and the ui-verify skill that gates web changes.
updated: 2026-06-10
---

# Web e2e & UI verification (Playwright)

Decision and rationale: ADR-0011 in `specs/08-decisions-log.md`. Agent workflow: the
`ui-verify` skill (`.claude/skills/ui-verify/SKILL.md`). This page is the as-built map.

## How a run works

`npm run test:e2e -w @aya/web` → `playwright test` with
`packages/web/playwright.config.ts`, whose `webServer` array boots **two** processes:

1. `e2e/stub-server.mjs` on **127.0.0.1:4545** — plain `node:http`, serves
   `GET /shares/{code}` from `e2e/fixtures/*.json` plus a `/health` readiness route.
2. `npx next dev --port 3100` with **`AYA_API_BASE_URL=http://127.0.0.1:4545`** — the
   SSR share page fetches from the stub. (Mocking via `page.route()` can't work here:
   the fetch is server-side, so substitution happens at the process boundary.)

Hermetic: no deployed backend, no network, no LLM calls. ~10 s for the suite.
`reuseExistingServer` is on outside CI, so already-running servers on those ports are
picked up rather than respawned.

## Fixtures

- **Filename = share code**: `fixtures/e2etest1.json` → `/shares/e2etest1` → app URL
  `/s/e2etest1`. Each file is one `AnalyzedPage`.
- The stub validates every fixture at startup with `ShareResolveResponseSchema` **and**
  `checkReconstruction` (both from `@aya/shared`) and refuses to start on violation —
  fixtures cannot drift from the contract or break the reconstruction invariant.
- `e2etest1` is the canonical fixture the specs assert against by content (it contains
  the idiom 风雨无阻, a `\n` token, and null-analysis punctuation). Add new files for new
  scenarios; don't mutate it.

## What lives where

- `packages/web/playwright.config.ts` — ports, webServer wiring, chromium-only project,
  `screenshot: only-on-failure` + `trace: retain-on-failure`.
- `packages/web/e2e/share-reader.spec.ts` — DOM reconstruction (exact `textContent`
  match incl. newlines), phrase buttons in index order, hover popup content with a
  zero-`/shares/`-requests assertion, Escape/blur dismissal, focus opens, not-found page.
- `packages/web/e2e/screenshot.mjs` — ad-hoc full-page PNG (`node e2e/screenshot.mjs
  /s/e2etest1` → `e2e-artifacts/…png`) for agents to Read; expects the two servers to be
  running already.

## Gotchas

- **Browser install is one-time and not part of `npm install`:**
  `npx playwright install chromium`.
- The stub imports `@aya/shared`'s **dist** — shared must be built first (the turbo
  `test:e2e` task declares `dependsOn: ^build`; running `playwright test` directly after
  a `clean` will fail at stub startup).
- Vitest and Playwright coexist in the package because vitest's `include` is scoped to
  `src/**` — keep e2e specs out of `src/` and unit tests out of `e2e/`.
- `getByRole('alert')` is ambiguous on the not-found page: Next.js injects its own
  `role=alert` route announcer. Target the heading instead.
- Artifacts (`playwright-report/`, `test-results/`, `e2e-artifacts/`) are gitignored and
  removed by the package `clean` script.
