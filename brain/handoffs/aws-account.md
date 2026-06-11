---
title: AWS account & credentials for the infra tasks
type: handoff
status: open
packages: [api]
tasks: [infra-package-scaffold, infra-dynamodb-table, infra-s3-bucket, infra-api-gateway-lambda, infra-web-hosting]
summary: The infra-* chain needs an AWS account, credentials, and a region choice. The SST app now defines the DynamoDB table and synthesizes config, but no infra can deploy or be verified end-to-end without credentials.
updated: 2026-06-11
---

# AWS account & credentials

## What's needed

1. An AWS account agents may deploy dev resources into (DynamoDB on-demand, S3,
   Lambda, API Gateway — all scale-to-zero/pay-per-use, in line with North Star #1).
2. Local credentials (`aws configure` / SSO profile) available in the shell agents
   run in, plus a chosen default region.

## Why

The `infra-*` chain is underway: `infra-package-scaffold` and
`infra-dynamodb-table` are done — the SST app (`packages/infra/sst.config.ts`) loads,
defines the `aya-<stage>` DynamoDB table, and synthesizes its config, but `sst diff`
/`sst dev`/`sst deploy` stop at the AWS-credentials refresh and cannot run without
credentials. The remaining infra tasks (S3, API Gateway, web hosting) can author
resources, but none can be deployed or verified end-to-end until this is provided. Until then the API also can't be verified against real DynamoDB/S3
(repository and presign tests use mocked clients only — see
[testing & DI](../concepts/testing-and-di.md)).

## Verify after

`aws sts get-caller-identity` succeeds in the agent shell. Record the chosen region
and profile name here, then mark resolved.
