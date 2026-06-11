import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ShareResolveResponseSchema,
  checkReconstruction,
  type AnalyzedPage,
  type Page,
  type Phrase,
} from '@aya/shared';
import { ApiError } from '../errors.js';
import {
  makeSharesResolveHandler,
  type ShareResolver,
} from './shares-resolve.js';

const PAGE_ID = '0f2e0000-0000-4000-8000-000000000000';
const FULL_TEXT = '春眠不觉晓';
const CODE = 'k7Qm2pX9';

function makePage(): Page {
  return {
    id: PAGE_ID,
    fullText: FULL_TEXT,
    createdAt: '2026-06-08T10:12:00.000Z',
  };
}

/** Phrases that reconstruct FULL_TEXT exactly, in index order. */
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

interface Harness {
  handler: ReturnType<typeof makeSharesResolveHandler>;
  resolveCalls: string[];
}

/** A recording resolver returning the given AnalyzedPage (or undefined). */
function makeHarness(resolved: AnalyzedPage | undefined): Harness {
  const resolveCalls: string[] = [];
  const repository: ShareResolver = {
    async resolveShare(code) {
      resolveCalls.push(code);
      return resolved;
    },
  };
  return { handler: makeSharesResolveHandler({ repository }), resolveCalls };
}

test('known code -> 200 with the AnalyzedPage, queried by that code', async () => {
  const analyzed: AnalyzedPage = { page: makePage(), phrases: goodPhrases() };
  const { handler, resolveCalls } = makeHarness(analyzed);

  const res = await handler({ pathParameters: { code: CODE } });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(resolveCalls, [CODE], 'resolved exactly the requested code');

  const parsed = ShareResolveResponseSchema.safeParse(res.body);
  assert.equal(parsed.success, true, 'response matches ShareResolveResponseSchema');
});

test('returned phrases are index-ordered and satisfy the reconstruction invariant', async () => {
  const analyzed: AnalyzedPage = { page: makePage(), phrases: goodPhrases() };
  const { handler } = makeHarness(analyzed);

  const res = await handler({ pathParameters: { code: CODE } });

  const indexes = res.body.phrases.map((p) => p.index);
  assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b), 'phrases ordered by index');

  const recon = checkReconstruction(res.body.page.fullText, res.body.phrases);
  assert.equal(recon.ok, true, 'phrases reconstruct fullText');
});

test('unknown code -> 404 share_not_found in the standard envelope', async () => {
  const { handler, resolveCalls } = makeHarness(undefined);

  await assert.rejects(
    () => Promise.resolve(handler({ pathParameters: { code: 'nope0000' } })),
    (err: unknown) =>
      err instanceof ApiError &&
      err.code === 'share_not_found' &&
      err.statusCode === 404,
  );
  assert.deepEqual(resolveCalls, ['nope0000']);
});

test('dangling share (page gone) -> 404 share_not_found', async () => {
  // resolveShare returns undefined for a dangling code as well — same 404 path.
  const { handler } = makeHarness(undefined);
  await assert.rejects(
    () => Promise.resolve(handler({ pathParameters: { code: CODE } })),
    (err: unknown) => err instanceof ApiError && err.code === 'share_not_found',
  );
});

test('missing code path param -> validation_error (400)', async () => {
  const { handler, resolveCalls } = makeHarness(undefined);
  await assert.rejects(
    () => Promise.resolve(handler({ pathParameters: {} })),
    (err: unknown) =>
      err instanceof ApiError &&
      err.code === 'validation_error' &&
      err.statusCode === 400,
  );
  assert.equal(resolveCalls.length, 0, 'no query attempted without a code');
});
