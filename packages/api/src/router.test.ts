// Integration-style tests for the routing layer: each route is exercised through
// makeRouter (not by calling handlers directly), so this covers method+path
// resolution, JSON body parsing, path-parameter extraction, the unknown-route
// 404, and the central error catch that converts thrown ApiErrors and unexpected
// errors into the standard envelope.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HealthResponseSchema,
  UploadResponseSchema,
  ScanResponseSchema,
  ShareResponseSchema,
  ShareResolveResponseSchema,
  ErrorEnvelopeSchema,
  type AnalyzedPage,
  type Page,
  type Phrase,
  type Share,
} from '@aya/shared';
import { healthHandler } from './handlers/health.js';
import { makeUploadsHandler } from './handlers/uploads.js';
import { makeScanHandler } from './handlers/pages.js';
import { makeSharesCreateHandler } from './handlers/shares.js';
import { makeSharesResolveHandler } from './handlers/shares-resolve.js';
import { validationError } from './errors.js';
import { makeRouter, type RouterHandlers } from './router.js';

const PAGE_ID = '0f2e0000-0000-4000-8000-000000000000';
const FULL_TEXT = '春眠不觉晓';
const CODE = 'k7Qm2pX9';

function makePage(): Page {
  return { id: PAGE_ID, fullText: FULL_TEXT, createdAt: '2026-06-08T10:12:00.000Z' };
}

function goodPhrases(): Phrase[] {
  return [
    {
      id: 'p1',
      pageId: PAGE_ID,
      index: 1,
      original: '春眠',
      pinyin: 'chūn mián',
      translation: 'spring sleep',
      contextualMeaning: 'sleeping in spring',
    },
    {
      id: 'p2',
      pageId: PAGE_ID,
      index: 2,
      original: '不觉晓',
      pinyin: 'bù jué xiǎo',
      translation: 'unaware of dawn',
      contextualMeaning: 'not noticing daybreak',
    },
  ];
}

/**
 * Build a router whose handlers are real, wired to in-memory fakes. Returns the
 * router plus the fakes/spies so tests can assert dispatch reached the handler.
 */
function makeHarness(opts?: { scanThrows?: unknown }) {
  const presign = {
    presignUpload: async () => ({
      uploadUrl: 'https://example.com/put',
      imageKey: 'uploads/2026/06/08/abc.jpg',
      expiresInSeconds: 300,
    }),
  };

  const scanHandler = makeScanHandler({
    fetchImage: async () => ({ data: new Uint8Array([1]), mediaType: 'image/jpeg' }),
    runOcr: async () => {
      if (opts?.scanThrows !== undefined) throw opts.scanThrows;
      return { status: 'ok' as const, fullText: FULL_TEXT };
    },
    analyzeText: async () => ({ phrases: goodPhrases() }),
  });

  const savedShares: Share[] = [];
  const sharesCreate = makeSharesCreateHandler({
    repository: {
      savePageWithPhrasesAndShare: async (_p, _ph, share) => {
        savedShares.push(share);
      },
    },
    shortUrls: {
      generateShareCode: () => CODE,
      buildShareUrl: (code) => `https://aya.app/s/${code}`,
    },
    now: () => new Date('2026-06-08T10:12:00.000Z'),
  });

  const resolveCalls: string[] = [];
  const sharesResolve = makeSharesResolveHandler({
    repository: {
      resolveShare: async (code): Promise<AnalyzedPage | undefined> => {
        resolveCalls.push(code);
        return code === CODE ? { page: makePage(), phrases: goodPhrases() } : undefined;
      },
    },
  });

  const handlers: RouterHandlers = {
    health: () => healthHandler(),
    uploads: makeUploadsHandler(presign as never),
    scan: scanHandler,
    sharesCreate,
    sharesResolve,
  };

  return { router: makeRouter(handlers), savedShares, resolveCalls };
}

test('GET /health resolves to the health handler (200)', async () => {
  const { router } = makeHarness();
  const res = await router({ method: 'GET', path: '/health' });
  assert.equal(res.statusCode, 200);
  assert.equal(HealthResponseSchema.safeParse(res.body).success, true);
});

test('POST /uploads resolves and parses an empty body (200)', async () => {
  const { router } = makeHarness();
  const res = await router({ method: 'POST', path: '/uploads', rawBody: '' });
  assert.equal(res.statusCode, 200);
  assert.equal(UploadResponseSchema.safeParse(res.body).success, true);
});

test('POST /pages resolves to the scan handler with a parsed body (200)', async () => {
  const { router } = makeHarness();
  const res = await router({
    method: 'POST',
    path: '/pages',
    rawBody: JSON.stringify({ imageKey: 'uploads/2026/06/08/abc.jpg' }),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(ScanResponseSchema.safeParse(res.body).success, true);
});

test('POST /shares resolves to the create handler and persists (201)', async () => {
  const { router, savedShares } = makeHarness();
  const res = await router({
    method: 'POST',
    path: '/shares',
    rawBody: JSON.stringify({ page: makePage(), phrases: goodPhrases() }),
  });
  assert.equal(res.statusCode, 201);
  assert.equal(ShareResponseSchema.safeParse(res.body).success, true);
  assert.equal(savedShares.length, 1, 'reached the persist path through the router');
});

test('GET /shares/{code} extracts the path param and resolves (200)', async () => {
  const { router, resolveCalls } = makeHarness();
  const res = await router({ method: 'GET', path: `/shares/${CODE}` });
  assert.equal(res.statusCode, 200);
  assert.equal(ShareResolveResponseSchema.safeParse(res.body).success, true);
  assert.deepEqual(resolveCalls, [CODE], 'path param passed through to the handler');
});

test('unknown route -> 404 with a standard error envelope', async () => {
  const { router } = makeHarness();
  const res = await router({ method: 'GET', path: '/nope' });
  assert.equal(res.statusCode, 404);
  // The envelope shape holds, though the code (`not_found`) is outside the closed
  // ErrorCode enum, so assert structurally rather than with the enum schema.
  assert.equal(typeof res.body, 'object');
  const body = res.body as { error: { code: string; message: string } };
  assert.equal(body.error.code, 'not_found');
  assert.equal(typeof body.error.message, 'string');
});

test('known path but wrong method -> 404 (no cross-method match)', async () => {
  const { router } = makeHarness();
  // /uploads is POST-only; a GET must not match it.
  const res = await router({ method: 'GET', path: '/uploads' });
  assert.equal(res.statusCode, 404);
});

test('GET /shares (no code segment) does not match the {code} route -> 404', async () => {
  const { router, resolveCalls } = makeHarness();
  const res = await router({ method: 'GET', path: '/shares' });
  assert.equal(res.statusCode, 404);
  assert.equal(resolveCalls.length, 0, 'resolve handler never invoked');
});

test('malformed JSON body on a POST route -> 400 validation_error', async () => {
  const { router } = makeHarness();
  const res = await router({ method: 'POST', path: '/pages', rawBody: '{not json' });
  assert.equal(res.statusCode, 400);
  const parsed = ErrorEnvelopeSchema.safeParse(res.body);
  assert.equal(parsed.success, true);
  assert.equal((res.body as { error: { code: string } }).error.code, 'validation_error');
});

test('a thrown ApiError from a handler is mapped to its status + envelope', async () => {
  // A handler throwing an ApiError must surface its status/code through the
  // router's central catch (here the scan stage throws a validation_error -> 400).
  const { router } = makeHarness({ scanThrows: validationError('boom from ocr') });
  const res = await router({
    method: 'POST',
    path: '/pages',
    rawBody: JSON.stringify({ imageKey: 'uploads/2026/06/08/abc.jpg' }),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(ErrorEnvelopeSchema.safeParse(res.body).success, true);
});

test('an unexpected (non-ApiError) throw becomes a 500 internal_error envelope', async () => {
  const { router } = makeHarness({ scanThrows: new Error('kaboom') });
  const res = await router({
    method: 'POST',
    path: '/pages',
    rawBody: JSON.stringify({ imageKey: 'uploads/2026/06/08/abc.jpg' }),
  });
  assert.equal(res.statusCode, 500);
  const body = res.body as { error: { code: string; message: string } };
  assert.equal(body.error.code, 'internal_error');
  // The generic message must not leak the original error text.
  assert.ok(!body.error.message.includes('kaboom'));
});

test('trailing slash is normalised (GET /health/ -> health, 200)', async () => {
  const { router } = makeHarness();
  const res = await router({ method: 'GET', path: '/health/' });
  assert.equal(res.statusCode, 200);
});

test('method is matched case-insensitively (post /uploads -> 200)', async () => {
  const { router } = makeHarness();
  const res = await router({ method: 'post', path: '/uploads', rawBody: '{}' });
  assert.equal(res.statusCode, 200);
});
