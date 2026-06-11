import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnalyzedPage, Page, Phrase, ShareResponse } from '@aya/shared';
import { AyaApiClient, type FetchLike } from '../api/client.js';
import { runShare, type ShareDeps } from './runShare.js';
import { shareReducer, initialShareState } from './shareState.js';
import { makeAnalyzedPage } from '../test-support/index.js';

interface SharePageCall {
  page: Page;
  phrases: Phrase[];
}

function makeDeps(response: ShareResponse): {
  deps: ShareDeps;
  calls: SharePageCall[];
} {
  const calls: SharePageCall[] = [];
  const deps: ShareDeps = {
    api: {
      sharePage: async (page, phrases) => {
        calls.push({ page, phrases });
        return response;
      },
    },
  };
  return { deps, calls };
}

const RESPONSE: ShareResponse = {
  code: 'abc12345',
  url: 'https://aya.example/s/abc12345',
  pageId: 'page-1',
};

test('runShare POSTs exactly the stored page + phrases as the request body', async () => {
  const stored: AnalyzedPage = makeAnalyzedPage();
  const { deps, calls } = makeDeps(RESPONSE);

  await runShare(deps, stored);

  assert.equal(calls.length, 1);
  // The request body equals the stored AnalyzedPage, split into { page, phrases }.
  assert.deepEqual(calls[0]!.page, stored.page);
  assert.deepEqual(calls[0]!.phrases, stored.phrases);
});

test('runShare returns the minted ShareResponse (code, url, pageId)', async () => {
  const { deps } = makeDeps(RESPONSE);
  const result = await runShare(deps, makeAnalyzedPage());
  assert.deepEqual(result, RESPONSE);
});

test('runShare makes exactly one POST /shares call', async () => {
  const { deps, calls } = makeDeps(RESPONSE);
  await runShare(deps, makeAnalyzedPage());
  assert.equal(calls.length, 1);
});

test('runShare propagates a failure (no swallowing) for the inline error UI', async () => {
  const deps: ShareDeps = {
    api: {
      sharePage: async () => {
        throw new Error('share failed');
      },
    },
  };
  await assert.rejects(() => runShare(deps, makeAnalyzedPage()), /share failed/);
});

test('shareReducer: start -> sharing, succeeded -> success carries the URL', () => {
  const sharing = shareReducer(initialShareState, { type: 'start' });
  assert.equal(sharing.status, 'sharing');

  const success = shareReducer(sharing, {
    type: 'succeeded',
    share: RESPONSE,
  });
  assert.equal(success.status, 'success');
  // The minted short URL is held in state for display.
  assert.equal(
    success.status === 'success' ? success.share.url : null,
    RESPONSE.url,
  );
});

test('shareReducer: failed carries the error code for the inline retry UI', () => {
  const failed = shareReducer(
    { status: 'sharing' },
    { type: 'failed', code: 'network_error', message: 'offline' },
  );
  assert.equal(failed.status, 'error');
  assert.equal(failed.status === 'error' ? failed.code : null, 'network_error');
});

test('shareReducer: reset returns to idle (for retry)', () => {
  const reset = shareReducer(
    { status: 'error', code: 'network_error', message: 'offline' },
    { type: 'reset' },
  );
  assert.deepEqual(reset, initialShareState);
});

// End-to-end through the real client with a mocked fetch: the serialized HTTP
// request body must equal the stored AnalyzedPage, and the returned short URL
// is surfaced for display (acceptance criteria).
test('runShare through AyaApiClient: POST /shares body == stored page, URL returned', async () => {
  const stored: AnalyzedPage = makeAnalyzedPage();
  const requests: { url: string; method: string; body: string }[] = [];

  const fetch: FetchLike = async (url, init) => {
    requests.push({
      url,
      method: init?.method ?? 'GET',
      body: String(init?.body ?? ''),
    });
    return {
      ok: true,
      status: 201,
      json: async () => RESPONSE,
      text: async () => JSON.stringify(RESPONSE),
    };
  };

  const api = new AyaApiClient({ baseUrl: 'https://api.aya.test', fetch });
  const result = await runShare({ api }, stored);

  assert.equal(requests.length, 1);
  const req = requests[0]!;
  assert.equal(req.url, 'https://api.aya.test/shares');
  assert.equal(req.method, 'POST');
  // The on-the-wire body is exactly { page, phrases } of the stored page.
  assert.deepEqual(JSON.parse(req.body), {
    page: stored.page,
    phrases: stored.phrases,
  });
  // The minted short URL is returned for the success UI to display.
  assert.equal(result.url, RESPONSE.url);
});

test('runShare through AyaApiClient surfaces the error code on a failed share', async () => {
  const fetch: FetchLike = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: { code: 'validation_error', message: 'bad page' },
    }),
    text: async () => '',
  });
  const api = new AyaApiClient({ baseUrl: 'https://api.aya.test', fetch });

  await assert.rejects(() => runShare({ api }, makeAnalyzedPage()), (err) => {
    assert.ok(err instanceof Error);
    assert.equal((err as { code?: string }).code, 'validation_error');
    return true;
  });
});
