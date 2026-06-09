import { describe, it, expect } from 'vitest';
import { fetchSharedPage, ApiError } from './api';
import type { AnalyzedPage } from '@aya/shared';

const PAGE_ID = '0f2e0000-0000-4000-8000-000000000000';

const validPage: AnalyzedPage = {
  page: {
    id: PAGE_ID,
    fullText: '他好',
    createdAt: '2026-06-08T10:12:00.000Z',
  },
  phrases: [
    {
      id: 'p1',
      pageId: PAGE_ID,
      index: 1,
      original: '他',
      pinyin: 'tā',
      translation: 'he',
      contextualMeaning: 'the person described',
    },
    {
      id: 'p2',
      pageId: PAGE_ID,
      index: 2,
      original: '好',
      pinyin: 'hǎo',
      translation: 'good',
      contextualMeaning: 'is doing well',
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchSharedPage', () => {
  it('returns a validated AnalyzedPage on 200', async () => {
    const fetchImpl = (async () => jsonResponse(validPage)) as unknown as typeof fetch;
    const result = await fetchSharedPage('k7Qm2pX9', {
      baseUrl: 'https://api.test',
      fetchImpl,
    });
    expect(result).toEqual(validPage);
  });

  it('calls GET /shares/{code} against the base URL', async () => {
    let calledUrl = '';
    const fetchImpl = (async (url: string) => {
      calledUrl = url;
      return jsonResponse(validPage);
    }) as unknown as typeof fetch;
    await fetchSharedPage('k7 Qm', { baseUrl: 'https://api.test/', fetchImpl });
    expect(calledUrl).toBe('https://api.test/shares/k7%20Qm');
  });

  it('throws a typed ApiError with share_not_found on 404', async () => {
    const fetchImpl = (async () =>
      jsonResponse(
        { error: { code: 'share_not_found', message: 'Not found.' } },
        404,
      )) as unknown as typeof fetch;

    await expect(
      fetchSharedPage('nope', { baseUrl: 'https://api.test', fetchImpl }),
    ).rejects.toMatchObject({ code: 'share_not_found' });

    try {
      await fetchSharedPage('nope', { baseUrl: 'https://api.test', fetchImpl });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).isShareNotFound).toBe(true);
      expect((err as ApiError).status).toBe(404);
    }
  });

  it('throws a generic ApiError when the error body is not a valid envelope', async () => {
    const fetchImpl = (async () =>
      new Response('<html>oops</html>', { status: 500 })) as unknown as typeof fetch;

    await expect(
      fetchSharedPage('x', { baseUrl: 'https://api.test', fetchImpl }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects a malformed 200 body that fails schema validation', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ page: { id: PAGE_ID }, phrases: [] })) as unknown as typeof fetch;
    await expect(
      fetchSharedPage('x', { baseUrl: 'https://api.test', fetchImpl }),
    ).rejects.toBeDefined();
  });
});
