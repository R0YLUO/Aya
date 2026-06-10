---
title: "web e2e: Playwright harness + ui-verify skill (ADR-0011)"
type: log
packages: [web, shared]
tasks: []
summary: Added the hermetic Playwright e2e harness (stub API + next dev), 6 share-reader specs, the ui-verify skill, Playwright MCP registration, and the e2e gate in golden rule 2.
updated: 2026-06-10
---

# 2026-06-10 — Playwright e2e harness & UI-verification lifecycle

User-directed work (not an `implementation_plan.json` task): make Playwright part of the
development lifecycle so agents can run e2e tests and UI verifications.

- `packages/web/e2e/`: `stub-server.mjs` (fixture API, schema + reconstruction validated
  at startup), `fixtures/e2etest1.json`, `share-reader.spec.ts` (6 specs, all green,
  ~10 s), `screenshot.mjs` (ad-hoc PNGs for visual judgement).
- `packages/web/playwright.config.ts` boots stub (4545) + `next dev` (3100,
  `AYA_API_BASE_URL` → stub); failure screenshots/traces retained.
- Wiring: `test:e2e` script in web + root, turbo task (`dependsOn: ^build`, no cache),
  gitignored artifacts, `@playwright/test` devDep, chromium via
  `npx playwright install chromium`.
- Lifecycle: new `ui-verify` skill; `product-implementation` step 4 now requires the e2e
  suite for web-touching tasks; CLAUDE.md golden rule 2 extended; Playwright MCP server
  registered in `.mcp.json`; ADR-0011 records Playwright-over-BrowserStack (BrowserStack
  deferred until cross-browser/device risk exists post `infra-web-hosting`).
- Details: [web-e2e-playwright](../concepts/web-e2e-playwright.md).
