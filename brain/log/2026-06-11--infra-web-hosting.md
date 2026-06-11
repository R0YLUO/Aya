---
title: "infra-web-hosting: Next.js web reader hosting in SST"
type: log
packages: [api]
tasks: [infra-web-hosting]
summary: Added sst.aws.Nextjs hosting for @aya/web (SSR for /s/{code}); cross-wired the API base URL into the web app and the deployed web URL back into the API Lambda's AYA_WEB_BASE_URL so minted share links point at the deployed reader.
updated: 2026-06-11
---

# infra-web-hosting

Completed the final `infra-*` task: web reader hosting in `packages/infra/sst.config.ts`.

## What was built

- `new sst.aws.Nextjs("Web", { path: "../web", environment: {...} })` — hosts the
  `@aya/web` workspace. SSR by default (OpenNext: server Lambda + CloudFront/S3 for
  assets); the `/s/{code}` route is `force-dynamic`, so it's server-rendered per
  request.
- Web app env: `AYA_API_BASE_URL` and `NEXT_PUBLIC_AYA_API_BASE_URL` both set to
  `api.url` (the two vars `web/src/lib/api.ts` reads, SSR + public fallback).
- API Lambda env: `AYA_WEB_BASE_URL` now defaults to `web.url` (the deployed reader),
  still overridable via `process.env["AYA_WEB_BASE_URL"]` for a custom domain. The
  short-URL service composes `/s/{code}` links off this, so shared URLs point at the
  deployed web host.

## Key decision — declaration order

`api` (ApiGatewayV2 component) is created first → `web` (Nextjs, reads `api.url`) →
`webBaseUrl` (= `web.url`) → `apiEnvironment` map → the five `api.route(...)` calls.
The routes are declared *after* `web` so the Lambda env can reference `web.url`. This
closes the env loop both directions with no committed host. Added `webUrl` to the
stack outputs.

## Verification

- `npm run typecheck` (incl. @aya/infra sst.config.ts), `npm run lint`,
  `npm run build` (web `/s/[code]` reported as Dynamic/SSR) — all pass.
- `npx sst diff --stage dev` loads and evaluates the config (the new Nextjs component
  parses/typechecks), then stops at the AWS-credentials refresh — same
  synthesis-only level as every prior infra task.

## Handoff

No new handoff. Real deploy/end-to-end verification stays gated on the existing
[aws-account handoff](../handoffs/aws-account.md), which already lists this task and
was updated: the `infra-*` chain is now complete at config-synthesis level.
