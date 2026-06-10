---
title: Testing & dependency-injection conventions
type: concept
packages: [shared, llm, api, web, mobile]
tasks: []
summary: How every package tests (node:test vs vitest), and the pervasive inject-everything pattern that keeps tests offline and device-free.
updated: 2026-06-10
---

# Testing & DI (the house style)

## Test runners

- **Non-React packages** (`shared`, `llm`, `api`, `mobile` core logic): compile tests
  with `tsconfig.test.json` then run `node --test dist-test/**/*.test.js`. No jest.
  Mobile's *logic* is testable this way precisely because it is framework-free.
- **Web**: vitest + @testing-library/react (`vitest.setup.ts`).

## The DI pattern (used everywhere — keep it up)

Every external effect is an injectable seam with a production default:

- LLM: `runner?: StructuredRunner` (fake runner in tests; no live model calls ever),
  `env?: Env`, `sleep?` in `withRetry`.
- API: services injected into handler **factories** (`makeUploadsHandler(presign)`);
  `DynamoDBDocumentClient`, bucket/table names, `presigner`, `now()` all injected.
- Mobile: `FetchLike`, `CameraService`, `StorageBackend` interfaces; orchestration
  (`runScan`) takes a `deps` object of narrowed `Pick<>`s.
- Web: `fetchImpl`/`baseUrl` options on the API client.

Corollaries: module import must never require env vars (resolve config lazily inside
functions); pure reducers/state machines first, framework wrappers second; UI
components stay thin over unit-tested logic.

## Verification gate

Per task: `npm run typecheck && npm run lint && npm run build` plus the package's
tests — all from the repo root (turbo fans out). Don't mark plan tasks done if any
fail (skill guardrail).
