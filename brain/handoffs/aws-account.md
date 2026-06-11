---
title: AWS account & credentials for the infra tasks
type: handoff
status: open
packages: [api]
tasks: [infra-package-scaffold, infra-dynamodb-table, infra-s3-bucket, infra-api-gateway-lambda, infra-web-hosting]
summary: The infra-* chain needs an AWS account, credentials, and a region choice. The SST app now defines the DynamoDB table, the uploads S3 bucket, and the HTTP API + scan Lambda, and synthesizes config, but no infra can deploy or be verified end-to-end without credentials (and two SST secrets must be set before deploy).
updated: 2026-06-11
---

# AWS account & credentials

## What's needed

1. An AWS account agents may deploy dev resources into (DynamoDB on-demand, S3,
   Lambda, API Gateway — all scale-to-zero/pay-per-use, in line with North Star #1).
2. Local credentials (`aws configure` / SSO profile) available in the shell agents
   run in, plus a chosen default region.
3. Two SST secrets set before the first deploy (per stage):
   `sst secret set AnthropicApiKey <key>` and `sst secret set LangsmithApiKey <key>`.
   The model ids (`AYA_OCR_MODEL`, `AYA_ANALYSIS_MODEL`) and `AYA_WEB_BASE_URL`
   are non-secret config read from the deploy environment (placeholders are used
   for synthesis); set the real values per stage at deploy time.

## Why

The `infra-*` chain is underway: `infra-package-scaffold`,
`infra-dynamodb-table`, `infra-s3-bucket`, and `infra-api-gateway-lambda` are done —
the SST app (`packages/infra/sst.config.ts`) loads, defines the `aya-<stage>` DynamoDB
table, the `aya-uploads-<stage>` S3 bucket (lifecycle + CORS), and the HTTP API
(`sst.aws.ApiGatewayV2`) with the five routes wired to one `@aya/api` Lambda (the heavy
`POST /pages` route at 25s/1024 MB), linked least-privilege to the table + bucket, and
synthesizes its config — but `sst diff`/`sst dev`/`sst deploy` stop at the
AWS-credentials refresh and cannot run without credentials. The only remaining infra
task (web hosting) can author resources, but none can be deployed or verified end-to-end
until this is provided. Until then the API also can't be verified against real
DynamoDB/S3/Lambda (repository, presign, and the new lambda-adapter tests use mocked
clients / stub events only — see [testing & DI](../concepts/testing-and-di.md)).

## Verify after

`aws sts get-caller-identity` succeeds in the agent shell. Record the chosen region
and profile name here, then mark resolved.
