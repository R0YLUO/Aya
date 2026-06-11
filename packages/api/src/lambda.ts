// Lambda composition root + API Gateway (HTTP API v2) adapter.
//
// This is the only place @aya/api instantiates real AWS clients and reads the
// environment. It builds every service from injected config, wires the five
// handlers into the transport-agnostic router (src/router.ts), and adapts an
// API Gateway v2 (HTTP API) proxy event into a RouterRequest and the
// RouterResponse back into a proxy result.
//
// The infra layer (packages/infra) deploys this single handler behind an HTTP
// API with a catch-all route ($default), so one Lambda serves all five routes;
// the router does method+path dispatch. Resource names and the model/LangSmith
// secrets come from the Lambda environment (CLAUDE.md golden rule #7) — never
// literals. See specs/03-api-design.md and specs/07-monorepo-and-deployment.md.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from 'aws-lambda';

import { PageRepository } from './repositories/page-repository.js';
import { S3PresignService } from './services/s3-presign-service.js';
import { ShortUrlService } from './services/short-url-service.js';
import { healthHandler } from './handlers/health.js';
import { makeUploadsHandler } from './handlers/uploads.js';
import { makeScanHandlerWithLlm } from './handlers/pages-wiring.js';
import { makeSharesCreateHandler } from './handlers/shares.js';
import { makeSharesResolveHandler } from './handlers/shares-resolve.js';
import { makeRouter, type RouterHandlers, type RouterRequest } from './router.js';

/** Read a required env var or throw a clear, secret-free error. */
function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in the deployment environment (no secrets or resource names in code).`,
    );
  }
  return value;
}

/**
 * Build the full router (all five handlers wired with real services) from the
 * environment. Pure composition: the only side effect is constructing AWS SDK
 * clients. Exported for tests/local invocation that want a router without the
 * API Gateway adapter.
 */
export function buildRouter(env: NodeJS.ProcessEnv = process.env) {
  const tableName = requireEnv(env, 'AYA_TABLE_NAME');
  const uploadBucket = requireEnv(env, 'AYA_UPLOAD_BUCKET');
  const webBaseUrl = requireEnv(env, 'AYA_WEB_BASE_URL');

  // DynamoDB document client — marshals plain JS values to/from attribute maps.
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const repository = new PageRepository(doc, tableName);

  // S3 presign service for POST /uploads and the scan path's image fetch.
  const presign = new S3PresignService(new S3Client({}), uploadBucket);

  // Short-URL service for the share-link base (env, never a literal).
  const shortUrls = new ShortUrlService(webBaseUrl);

  const handlers: RouterHandlers = {
    health: () => healthHandler(),
    uploads: makeUploadsHandler(presign),
    // The scan handler binds the real @aya/llm calls; @aya/llm reads its own
    // model/key env (AYA_OCR_MODEL, AYA_ANALYSIS_MODEL, ANTHROPIC_API_KEY) via
    // loadLlmConfig, so we pass it through unchanged.
    scan: makeScanHandlerWithLlm(presign, { env }),
    sharesCreate: makeSharesCreateHandler({ repository, shortUrls }),
    sharesResolve: makeSharesResolveHandler({ repository }),
  };

  return makeRouter(handlers);
}

/**
 * Translate an API Gateway v2 (HTTP API) proxy event into the router's
 * transport-agnostic RouterRequest. Path comes from `rawPath` (query string is
 * carried separately and the router ignores it).
 */
export function toRouterRequest(event: APIGatewayProxyEventV2): RouterRequest {
  const method = event.requestContext.http.method;
  const path = event.rawPath;
  const rawBody =
    event.body !== undefined && event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
  return { method, path, ...(rawBody !== undefined ? { rawBody } : {}) };
}

/** JSON response headers for every reply. */
const JSON_HEADERS = { 'content-type': 'application/json' } as const;

// Build the router lazily on the first invocation and cache it for the life of
// the warm container, so subsequent requests reuse the AWS clients. Lazy (not
// module-scope) so merely importing this module — e.g. in unit tests — does not
// require the Lambda environment to be set.
let cachedRouter: ReturnType<typeof buildRouter> | undefined;

function getRouter(): ReturnType<typeof buildRouter> {
  cachedRouter ??= buildRouter();
  return cachedRouter;
}

/**
 * The Lambda entry point behind the HTTP API. Adapts the proxy event, dispatches
 * through the router (which owns the central error catch and never throws), and
 * serialises the RouterResponse as a JSON proxy result.
 */
export async function handler(
  event: APIGatewayProxyEventV2,
  _context?: Context,
): Promise<APIGatewayProxyResultV2> {
  const response = await getRouter()(toRouterRequest(event));
  return {
    statusCode: response.statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(response.body),
  };
}
