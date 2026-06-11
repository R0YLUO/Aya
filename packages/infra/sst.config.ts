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

    // ---- Secrets & config the API Lambda needs (no literals; CLAUDE.md #7) ----
    //
    // True secrets (the Anthropic + LangSmith API keys) are SST Secrets — set
    // out of band with `sst secret set <NAME> <value>` per stage and never
    // committed. Model ids and the LangSmith project/toggle are non-secret
    // *config*, sourced from the deploy environment with safe per-stage
    // defaults so synthesis never depends on a committed account value.
    const anthropicApiKey = new sst.Secret("AnthropicApiKey");
    const langsmithApiKey = new sst.Secret("LangsmithApiKey");

    // The public web reader's base URL (used to compose share links). Defaults
    // to a stage-scoped placeholder for synthesis; the real value is set per
    // stage via env (or, once infra-web-hosting lands, the Nextjs site URL).
    const webBaseUrl =
      process.env["AYA_WEB_BASE_URL"] ?? `https://${stage}.aya.example`;

    // Environment injected into the API Lambda. The repository reads the table
    // name from `AYA_TABLE_NAME`, the presign/scan path reads the bucket name
    // from `AYA_UPLOAD_BUCKET`, the short-URL service reads `AYA_WEB_BASE_URL`,
    // and @aya/llm reads the model ids + keys (brain/concepts/env-and-config.md).
    // `link: [table, uploadBucket]` grants the Lambda least-privilege IAM to
    // exactly those two resources (SST derives the policy from the links).
    const apiEnvironment = {
      AYA_TABLE_NAME: table.name,
      AYA_UPLOAD_BUCKET: uploadBucket.name,
      AYA_WEB_BASE_URL: webBaseUrl,
      // Model ids are config, not literals (CLAUDE.md #9): sourced from the
      // deploy env. Placeholders keep synthesis self-contained; a real deploy
      // sets the actual Claude ids per stage.
      AYA_OCR_MODEL: process.env["AYA_OCR_MODEL"] ?? "set-AYA_OCR_MODEL",
      AYA_ANALYSIS_MODEL:
        process.env["AYA_ANALYSIS_MODEL"] ?? "set-AYA_ANALYSIS_MODEL",
      ANTHROPIC_API_KEY: anthropicApiKey.value,
      // LangSmith tracing — off unless explicitly enabled per stage. The key is
      // a Secret; the project/toggle are non-secret config.
      LANGCHAIN_TRACING_V2: process.env["LANGCHAIN_TRACING_V2"] ?? "false",
      LANGCHAIN_API_KEY: langsmithApiKey.value,
      LANGCHAIN_PROJECT: process.env["LANGCHAIN_PROJECT"] ?? `aya-${stage}`,
      AYA_ENV: stage,
    } as const;

    // ---- HTTP API + the single API Lambda (specs/03, specs/07) ----------------
    //
    // One Lambda serves every route: the @aya/api router does method+path
    // dispatch internally (packages/api/src/lambda.ts is the composition root +
    // API Gateway v2 adapter). Each of the five product routes is declared
    // explicitly (matching specs/03-api-design.md) and points at that handler.
    //
    // The heavy POST /pages route runs two Claude calls (~15s budget), so it
    // gets a generous timeout — comfortably above the budget, under API
    // Gateway's hard 29s integration limit — and raised memory for image
    // handling. The other routes keep lightweight defaults.
    const api = new sst.aws.ApiGatewayV2("Api");

    // Shared Lambda config for the lightweight routes: links (least-privilege
    // IAM to the table + bucket) and the env above. `handler` resolves to the
    // built @aya/api entry point.
    const apiHandler = "../api/src/lambda.handler";
    const baseFn = {
      link: [table, uploadBucket],
      environment: apiEnvironment,
    } as const;

    // Heavy scan route: 25s timeout (> ~15s LLM budget, < 29s API GW limit) and
    // 1024 MB memory for decoding/holding the uploaded image bytes.
    const scanFn = {
      ...baseFn,
      timeout: "25 seconds",
      memory: "1024 MB",
    } as const;

    api.route("POST /uploads", { handler: apiHandler, ...baseFn });
    api.route("POST /pages", { handler: apiHandler, ...scanFn });
    api.route("POST /shares", { handler: apiHandler, ...baseFn });
    api.route("GET /shares/{code}", { handler: apiHandler, ...baseFn });
    api.route("GET /health", { handler: apiHandler, ...baseFn });

    // Resources still to be added by the downstream infra-* task:
    //   - infra-web-hosting → sst.aws.Nextjs

    return {
      stage,
      tableName: table.name,
      tableArn: table.arn,
      uploadBucketName: uploadBucket.name,
      apiUrl: api.url,
      apiTableNameEnv: apiEnvironment.AYA_TABLE_NAME,
      apiUploadBucketEnv: apiEnvironment.AYA_UPLOAD_BUCKET,
    };
  },
});
