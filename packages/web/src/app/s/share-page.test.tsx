import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { resolveSharePage } from '../../lib/resolveSharePage';
import { SharePageView } from '../../components/SharePageView';
import type { AnalyzedPage } from '@aya/shared';

const PAGE_ID = '0f2e0000-0000-4000-8000-000000000000';

const validPage: AnalyzedPage = {
  page: { id: PAGE_ID, fullText: '他好', createdAt: '2026-06-08T10:12:00.000Z' },
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
      contextualMeaning: 'doing well',
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const okFetch = (async () => jsonResponse(validPage)) as unknown as typeof fetch;
const notFoundFetch = (async () =>
  jsonResponse(
    { error: { code: 'share_not_found', message: 'Not found.' } },
    404,
  )) as unknown as typeof fetch;
const serverErrorFetch = (async () =>
  jsonResponse(
    { error: { code: 'analysis_failed', message: 'boom' } },
    502,
  )) as unknown as typeof fetch;

describe('resolveSharePage (server-side)', () => {
  it('returns a found state with the analysed page for a valid code', async () => {
    const state = await resolveSharePage('k7Qm2pX9', {
      fetchImpl: okFetch,
      baseUrl: 'https://api.test',
    });
    expect(state).toEqual({ status: 'found', page: validPage });
  });

  it('returns a not_found state for an unknown code', async () => {
    const state = await resolveSharePage('nope', {
      fetchImpl: notFoundFetch,
      baseUrl: 'https://api.test',
    });
    expect(state).toEqual({ status: 'not_found' });
  });

  it('re-throws unexpected (non share_not_found) errors', async () => {
    await expect(
      resolveSharePage('x', { fetchImpl: serverErrorFetch, baseUrl: 'https://api.test' }),
    ).rejects.toBeDefined();
  });
});

describe('SharePageView render paths', () => {
  it('renders the reader populated with the page text on found', () => {
    const { container } = render(
      <SharePageView state={{ status: 'found', page: validPage }} />,
    );
    expect(container.querySelector('article')!.textContent).toBe('他好');
    expect(screen.getAllByTestId('phrase')).toHaveLength(2);
  });

  it('renders a friendly not-found page (no stack trace) on not_found', () => {
    render(<SharePageView state={{ status: 'not_found' }} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/isn’t available/i)).toBeInTheDocument();
    // No reader content is shown.
    expect(screen.queryByTestId('phrase')).toBeNull();
  });
});
