---
title: "infra-s3-bucket: ephemeral uploads S3 bucket in SST"
type: log
packages: [api]
tasks: [infra-s3-bucket]
summary: Defined the aya-uploads-<stage> S3 bucket in SST (lifecycle auto-delete on the uploads/ prefix, CORS allowing presigned PUT) and exposed AYA_UPLOAD_BUCKET to the future API Lambda.
updated: 2026-06-11
---

# infra-s3-bucket

Added the ephemeral uploads bucket to `packages/infra/sst.config.ts` inside `run()`:

- `new sst.aws.Bucket("Uploads", …)` with native high-level args:
  - `cors`: `allowMethods ["PUT","POST","GET","HEAD"]`, `allowOrigins ["*"]`,
    `allowHeaders ["*"]`, `exposeHeaders ["ETag"]` — permits the client's presigned PUT
    and preflight. Origins left `*` (auth out of scope; the URL is signed/short-lived).
  - `lifecycle [{ id "expire-uploads", prefix "uploads/", expiresIn "1 day" }]` —
    auto-deletes the image. Prefix matches the dated key written by
    `packages/api/src/services/s3-presign-service.ts` (`uploads/YYYY/MM/DD/<uuid>.jpg`).
  - Physical name pinned to `aya-uploads-<stage>` via `transform.bucket.bucket`.
- Added `AYA_UPLOAD_BUCKET: uploadBucket.name` to the `apiEnvironment` map (alongside
  `AYA_TABLE_NAME`) and returned `apiUploadBucketEnv` / a live `uploadBucketName` from
  `run()`. `infra-api-gateway-lambda` will `link: [table, uploadBucket]` and spread the env.

## Key findings / decisions

- S3 lifecycle expiration granularity is whole days (`expiresIn` is a `DurationDays`),
  so "shortly after creation" bottoms out at `"1 day"` — the shortest S3 supports.
- `sst.aws.Bucket` (v4.15) has native `cors`/`lifecycle`/`versioning` args; the
  physical-name transform target is `transform.bucket.bucket` (mirrors the table's
  `transform.table.name`).

## Verification

- `npm run typecheck` / `lint` / `build` pass (infra typecheck+lint run directly to
  bypass the turbo cache).
- `npx sst diff --stage dev` loads and evaluates the config (no config-shape errors) and
  stops at the AWS-credentials refresh — synthesis-only, the same ceiling as the prior
  infra tasks. Real deploy stays gated on the open
  [aws-account handoff](../handoffs/aws-account.md) (already lists this taskId).
