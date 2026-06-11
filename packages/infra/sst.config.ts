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

    // Resources are added here by the downstream infra-* tasks:
    //   - infra-dynamodb-table    → sst.aws.Dynamo  (name: names.table)
    //   - infra-s3-bucket         → sst.aws.Bucket  (name: names.uploadBucket)
    //   - infra-api-gateway-lambda→ sst.aws.ApiGatewayV2 + Function
    //   - infra-web-hosting       → sst.aws.Nextjs

    return {
      stage,
      tableName: names.table,
      uploadBucketName: names.uploadBucket,
    };
  },
});
