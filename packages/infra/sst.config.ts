/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Aya infrastructure — the SST (Ion) app.
 *
 * This file is the *scaffold*: it wires the AWS account/region, the per-stage
 * naming convention (`aya-<stage>`, `aya-uploads-<stage>`), and stage-aware
 * safety defaults. The concrete resources (DynamoDB table, S3 bucket, API
 * Gateway + Lambdas, web hosting) are added by the downstream `infra-*` tasks
 * inside `run()`.
 *
 * No secrets live here — model keys, LangSmith keys, and resource names are
 * sourced from the environment / SST config at deploy time
 * (see specs/07-monorepo-and-deployment.md).
 */
export default $config({
  app(input) {
    const stage = input?.stage ?? "dev";
    const isProd = stage === "prod";

    return {
      name: "aya",
      // Only `prod` is protected and retains resources; every other stage
      // (dev, PR/preview stages) is fully removable so it can scale to zero
      // and be torn down cheaply (North Star: Fast & Efficient).
      removal: isProd ? "retain" : "remove",
      protect: isProd,
      home: "aws",
      providers: {
        aws: {
          // Region comes from the environment so no account-specific value is
          // committed; defaults to us-east-1 for local synthesis.
          region: (process.env["AWS_REGION"] ?? "us-east-1") as
            | "us-east-1"
            | "us-east-2"
            | "us-west-1"
            | "us-west-2"
            | "eu-west-1"
            | "eu-central-1"
            | "ap-southeast-1"
            | "ap-southeast-2"
            | "ap-northeast-1",
        },
      },
    };
  },

  async run() {
    const stage = $app.stage;

    // The per-stage naming convention every Aya resource follows. Downstream
    // infra-* tasks read these so the table is `aya-<stage>` and the upload
    // bucket is `aya-uploads-<stage>` (specs/07-monorepo-and-deployment.md).
    const names = {
      table: `aya-${stage}`,
      uploadBucket: `aya-uploads-${stage}`,
    } as const;

    // DynamoDB single-table store for Page / Phrase / Share
    // (specs/02-data-model.md, brain/concepts/dynamodb-single-table.md).
    //
    //   - Composite key only: string PK + string SK. Every access pattern is a
    //     GetItem or a single-partition query, so there are NO GSIs.
    //   - PAY_PER_REQUEST (on-demand) billing — scale-to-zero, no provisioned
    //     capacity to pay for when idle (North Star: Fast & Efficient). This is
    //     sst.aws.Dynamo's default billing mode.
    //   - `transform.table.name` pins the physical table name to the
    //     `aya-<stage>` convention rather than SST's auto-generated name, so
    //     AYA_TABLE_NAME is predictable across stages.
    //   - TTL is intentionally left DISABLED (no `ttl` arg) today; nothing in the
    //     data model expires. The attribute name we'd use is recorded in
    //     `TTL_ATTRIBUTE` so a future task can enable it additively
    //     (`ttl: TTL_ATTRIBUTE`) without re-deciding the convention.
    const TTL_ATTRIBUTE = "expiresAt";
    void TTL_ATTRIBUTE; // documented convention; TTL stays disabled for now.

    // Key attribute names are UPPERCASE `PK`/`SK` to match exactly what the API
    // repository writes (packages/api/src/repositories/keys.ts) — DynamoDB
    // attribute names are case-sensitive.
    const table = new sst.aws.Dynamo("Table", {
      fields: {
        PK: "string",
        SK: "string",
      },
      primaryIndex: { hashKey: "PK", rangeKey: "SK" },
      // No globalIndexes / localIndexes — single-table, three access patterns.
      // No `ttl` — disabled by default (see TTL_ATTRIBUTE above).
      transform: {
        table: {
          name: names.table,
        },
      },
    });

    // Ephemeral uploads bucket (specs/02-data-model.md, specs/07-monorepo-and-deployment.md).
    //
    //   - Clients PUT the photo directly via a presigned URL minted by the API
    //     (packages/api/src/services/s3-presign-service.ts), under the dated
    //     `uploads/YYYY/MM/DD/<uuid>.jpg` key. The object only has to survive
    //     long enough for the stateless POST /pages scan to read it back, so a
    //     lifecycle rule auto-deletes it.
    //   - CORS must allow the browser/RN client's presigned PUT (and the HEAD/GET
    //     preflight). Origins are left `*` for now — auth is out of scope and the
    //     URL is already signed/short-lived; a future task can pin web/app origins.
    //   - `transform.bucket.bucket` pins the physical name to the
    //     `aya-uploads-<stage>` convention so AYA_UPLOAD_BUCKET is predictable
    //     across stages (otherwise SST auto-generates a suffixed name).
    //
    // NOTE: S3 lifecycle expiration granularity is whole days (minimum 1 day);
    // "shortly after creation" is therefore one day — the shortest S3 supports.
    const uploadBucket = new sst.aws.Bucket("Uploads", {
      cors: {
        allowMethods: ["PUT", "POST", "GET", "HEAD"],
        allowOrigins: ["*"],
        allowHeaders: ["*"],
        exposeHeaders: ["ETag"],
      },
      lifecycle: [
        {
          id: "expire-uploads",
          prefix: "uploads/",
          expiresIn: "1 day",
        },
      ],
      transform: {
        bucket: {
          bucket: names.uploadBucket,
        },
      },
    });

    // Environment injected into the API Lambda(s). The repository layer reads
    // the table name from `AYA_TABLE_NAME`, and the presign/scan path reads the
    // bucket name from `AYA_UPLOAD_BUCKET`, at the edge (brain/concepts/env-and-config.md).
    // The Lambda itself is created by `infra-api-gateway-lambda`, which spreads
    // this map into its `environment` and links the table + bucket for IAM access.
    const apiEnvironment = {
      AYA_TABLE_NAME: table.name,
      AYA_UPLOAD_BUCKET: uploadBucket.name,
    } as const;

    // Resources still to be added by the downstream infra-* tasks:
    //   - infra-api-gateway-lambda→ sst.aws.ApiGatewayV2 + Function
    //                               (link: [table, uploadBucket]; environment: apiEnvironment)
    //   - infra-web-hosting       → sst.aws.Nextjs

    return {
      stage,
      tableName: table.name,
      tableArn: table.arn,
      uploadBucketName: uploadBucket.name,
      apiTableNameEnv: apiEnvironment.AYA_TABLE_NAME,
      apiUploadBucketEnv: apiEnvironment.AYA_UPLOAD_BUCKET,
    };
  },
});
