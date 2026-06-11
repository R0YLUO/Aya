import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { buildRouter, toRouterRequest } from './lambda.js';

/** Minimal API Gateway v2 (HTTP API) event for the adapter under test. */
function makeEvent(
  overrides: Partial<APIGatewayProxyEventV2> & {
    method?: string;
    path?: string;
  } = {},
): APIGatewayProxyEventV2 {
  const { method = 'GET', path = '/health', ...rest } = overrides;
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 't' },
    },
    isBase64Encoded: false,
    ...rest,
  } as unknown as APIGatewayProxyEventV2;
}

const ENV = {
  AYA_TABLE_NAME: 'aya-test',
  AYA_UPLOAD_BUCKET: 'aya-uploads-test',
  AYA_WEB_BASE_URL: 'https://aya.test',
  AYA_OCR_MODEL: 'test-ocr',
  AYA_ANALYSIS_MODEL: 'test-analysis',
  ANTHROPIC_API_KEY: 'test-key',
} as NodeJS.ProcessEnv;

test('toRouterRequest maps method + rawPath and passes the body through', () => {
  const req = toRouterRequest(
    makeEvent({ method: 'POST', path: '/shares', body: '{"x":1}' }),
  );
  assert.equal(req.method, 'POST');
  assert.equal(req.path, '/shares');
  assert.equal(req.rawBody, '{"x":1}');
});

test('toRouterRequest decodes a base64-encoded body', () => {
  const req = toRouterRequest(
    makeEvent({
      method: 'POST',
      path: '/uploads',
      body: Buffer.from('{"a":2}', 'utf8').toString('base64'),
      isBase64Encoded: true,
    }),
  );
  assert.equal(req.rawBody, '{"a":2}');
});

test('buildRouter throws when a required env var is missing', () => {
  assert.throws(
    () => buildRouter({} as NodeJS.ProcessEnv),
    /Missing required environment variable AYA_TABLE_NAME/,
  );
});

test('buildRouter wires the health route end to end (no AWS calls)', async () => {
  const router = buildRouter(ENV);
  const res = await router(toRouterRequest(makeEvent({ method: 'GET', path: '/health' })));
  assert.equal(res.statusCode, 200);
  assert.deepEqual((res.body as { status: string }).status, 'ok');
});

test('buildRouter 404s an unknown route via the central catch', async () => {
  const router = buildRouter(ENV);
  const res = await router(toRouterRequest(makeEvent({ method: 'GET', path: '/nope' })));
  assert.equal(res.statusCode, 404);
});
