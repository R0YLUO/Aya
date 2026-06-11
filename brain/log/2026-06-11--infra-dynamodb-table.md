---
title: "infra-dynamodb-table: DynamoDB single-table in SST"
type: log
packages: [api]
tasks: [infra-dynamodb-table]
summary: Defined the aya-<stage> DynamoDB single-table in SST (string PK/SK, on-demand, no GSI, TTL disabled) and exposed AYA_TABLE_NAME for the future API Lambda.
updated: 2026-06-11
---

# infra-dynamodb-table

Added the DynamoDB single-table to `packages/infra/sst.config.ts` inside `run()`:

- `new sst.aws.Dynamo("Table", …)` with `fields: { PK: "string", SK: "string" }` and
  `primaryIndex { hashKey: "PK", rangeKey: "SK" }`. **No** `globalIndexes`/`localIndexes`
  — the single-table design has exactly three access patterns, all GetItem/single-partition.
- Billing is `PAY_PER_REQUEST` (the `sst.aws.Dynamo` default — scale-to-zero, North Star #1).
- Physical name pinned to `aya-<stage>` via `transform.table.name` (SST otherwise
  auto-generates a stage-suffixed name).
- TTL left **disabled** (no `ttl` arg); the convention attribute name is recorded as a
  `TTL_ATTRIBUTE = "expiresAt"` const (with `void TTL_ATTRIBUTE` to keep lint quiet) so a
  future task can enable it additively.
- `apiEnvironment = { AYA_TABLE_NAME: table.name }` is the contract
  `infra-api-gateway-lambda` will spread into the Lambda `environment` (plus `link: [table]`
  for IAM). Returned `tableName`/`tableArn`/`apiTableNameEnv` as stack outputs.

## Key finding

The repository (`packages/api/src/repositories/keys.ts`) writes **uppercase** `PK`/`SK`
attributes. DynamoDB attribute names are case-sensitive, so the table key schema had to use
`PK`/`SK`, not `pk`/`sk` — fixed before completing.

## Verification

typecheck + lint + repo-wide build all pass. `sst diff --stage dev` loads and synthesizes the
config (the new Dynamo resource evaluates without error) and stops only at the AWS-credentials
refresh — the expected synthesis-only level, gated on the open
[aws-account handoff](../handoffs/aws-account.md). No real deploy/end-to-end yet.
