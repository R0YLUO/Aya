import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AyaApiClient, ApiError, type FetchLike, type FetchResponse } from './client.js';
import { makeAnalyzedPage, makePage } from '../test-support/fixtures.js';

function jsonResponse(status: number, body: unknown): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

interface Call {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

function recordingFetch(
  responder: (call: Call) => FetchResponse | Promise<FetchResponse>,
): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const call: Call = { url, ...init };
    calls.push(call);
    return responder(call);
  };
  return { fetch, calls };
}

const BASE = 'https://api.aya.test';

test('requestUpload posts to /uploads and validates the response', async () => {
  const { fetch, calls } = recordingFetch(() =>
    jsonResponse(200, {
      uploadUrl: 'https://s3.test/put',
      imageKey: 'uploads/2026/06/09/abc.jpg',
      expiresInSeconds: 300,
    }),
  );
  const client = new AyaApiClient({ baseUrl: BASE, fetch });
  const res = await client.requestUpload();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${BASE}/uploads`);
  assert.equal(calls[0]!.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0]!.body as string), { contentType: 'image/jpeg' });
  assert.equal(res.imageKey, 'uploads/2026/06/09/abc.jpg');
  assert.equal(res.expiresInSeconds, 300);
});

test('uploadImage PUTs raw bytes to the presigned URL', async () => {
  const { fetch, calls } = recordingFetch(() => jsonResponse(200, {}));
  const client = new AyaApiClient({ baseUrl: BASE, fetch });
  const bytes = new Uint8Array([1, 2, 3]);
  await client.uploadImage('https://s3.test/put', bytes);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://s3.test/put');
  assert.equal(calls[0]!.method, 'PUT');
  assert.equal(calls[0]!.body, bytes);
});

test('scanPage posts imageKey and returns a validated AnalyzedPage', async () => {
  const page = makeAnalyzedPage();
  const { fetch, calls } = recordingFetch(() => jsonResponse(200, page));
  const client = new AyaApiClient({ baseUrl: BASE, fetch });
  const res = await client.scanPage('uploads/2026/06/09/abc.jpg');

  assert.equal(calls[0]!.url, `${BASE}/pages`);
  assert.deepEqual(JSON.parse(calls[0]!.body as string), {
    imageKey: 'uploads/2026/06/09/abc.jpg',
  });
  assert.equal(res.page.fullText, page.page.fullText);
  assert.equal(res.phrases.length, 3);
});

test('sharePage posts page+phrases and returns the short url', async () => {
  const analyzed = makeAnalyzedPage();
  const { fetch, calls } = recordingFetch(() =>
    jsonResponse(201, {
      code: 'abcd1234',
      url: 'https://aya.test/s/abcd1234',
      pageId: analyzed.page.id,
    }),
  );
  const client = new AyaApiClient({ baseUrl: BASE, fetch });
  const res = await client.sharePage(analyzed.page, analyzed.phrases);

  assert.equal(calls[0]!.url, `${BASE}/shares`);
  const sent = JSON.parse(calls[0]!.body as string);
  assert.deepEqual(sent.page, analyzed.page);
  assert.deepEqual(sent.phrases, analyzed.phrases);
  assert.equal(res.code, 'abcd1234');
  assert.equal(res.url, 'https://aya.test/s/abcd1234');
});

test('error envelope is surfaced as a typed ApiError with its code', async () => {
  const { fetch } = recordingFetch(() =>
    jsonResponse(422, {
      error: { code: 'image_unreadable', message: 'Photo unclear, please retake' },
    }),
  );
  const client = new AyaApiClient({ baseUrl: BASE, fetch });
  await assert.rejects(
    () => client.scanPage('uploads/x.jpg'),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, 'image_unreadable');
      assert.equal(err.status, 422);
      return true;
    },
  );
});

test('transport failure becomes a network_error ApiError', async () => {
  const fetch: FetchLike = async () => {
    throw new Error('connection reset');
  };
  const client = new AyaApiClient({ baseUrl: BASE, fetch });
  await assert.rejects(
    () => client.scanPage('uploads/x.jpg'),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, 'network_error');
      assert.equal(err.status, null);
      return true;
    },
  );
});

test('an invalid scan response (bad payload) fails schema validation', async () => {
  const { fetch } = recordingFetch(() =>
    jsonResponse(200, { page: makePage() /* phrases missing */ }),
  );
  const client = new AyaApiClient({ baseUrl: BASE, fetch });
  await assert.rejects(() => client.scanPage('uploads/x.jpg'));
});

test('baseUrl trailing slashes are normalized', async () => {
  const { fetch, calls } = recordingFetch(() =>
    jsonResponse(200, {
      uploadUrl: 'u',
      imageKey: 'k',
      expiresInSeconds: 1,
    }),
  );
  const client = new AyaApiClient({ baseUrl: `${BASE}///`, fetch });
  await client.requestUpload();
  assert.equal(calls[0]!.url, `${BASE}/uploads`);
});
