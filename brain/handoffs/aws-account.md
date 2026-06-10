---
title: AWS account & credentials for the infra tasks
type: handoff
status: open
packages: [api]
tasks: [infra-package-scaffold, infra-dynamodb-table, infra-s3-bucket, infra-api-gateway-lambda, infra-web-hosting]
summary: All five infra-* tasks (SST, DynamoDB, S3, API Gateway, web hosting) need an AWS account, credentials, and a region choice before they can start.
updated: 2026-06-10
---

# AWS account & credentials

## What's needed

1. An AWS account agents may deploy dev resources into (DynamoDB on-demand, S3,
   Lambda, API Gateway — all scale-to-zero/pay-per-use, in line with North Star #1).
2. Local credentials (`aws configure` / SSO profile) available in the shell agents
   run in, plus a chosen default region.

## Why

The whole `infra-*` chain is `todo` and is the next backend frontier once
`api-router` lands — `sst diff`/`sst dev` cannot run without credentials. Until then
the API also can't be verified against real DynamoDB/S3 (repository and presign
tests use mocked clients only — see [testing & DI](../concepts/testing-and-di.md)).

## Verify after

`aws sts get-caller-identity` succeeds in the agent shell. Record the chosen region
and profile name here, then mark resolved.
