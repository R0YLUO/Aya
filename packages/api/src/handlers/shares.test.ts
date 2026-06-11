import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ShareResponseSchema,
  type Page,
  type Phrase,
  type Share,
} from '@aya/shared';
import { ApiError } from '../errors.js';
import {
  makeSharesCreateHandler,
  type SharePersister,
  type ShareUrlMinter,
} from './shares.js';

const PAGE_ID = '0f2e0000-0000-4000-8000-000000000000';
const FULL_TEXT = '春眠不觉晓';
const CODE = 'k7Qm2pX9';

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: PAGE_ID,
    fullText: FULL_TEXT,
    createdAt: '2026-06-08T10:12:00.000Z',
    ...overrides,
  };
}

/** Phrases that reconstruct FULL_TEXT exactly for the given page. */
function goodPhrases(pageId: string = PAGE_ID): Phrase[] {
  return [
    {
      id: 'p1',
      pageId,
      index: 1,
      original: '春眠',
      pinyin: 'chūn mián',
      translation: 'spring sleep',
      contextualMeaning: 'sleeping in spring',
    },
    {
      id: 'p2',
      pageId,
      index: 2,
      original: '不觉晓',
      pinyin: 'bù jué xiǎo',
      translation: 'unaware of dawn',
      contextualMeaning: 'not noticing daybreak',
    },
  ];
}

interface SavedCall {
  page: Page;
  phrases: readonly Phrase[];
  share: Share;
}

/** A recording persister + minter pair, so tests can assert "writes nothing". */
function makeHarness(saveError?: Error): {
  handler: ReturnType<typeof makeSharesCreateHandler>;
  saves: SavedCall[];
  codeCalls: number;
} {
  const saves: SavedCall[] = [];
  let codeCalls = 0;

  const repository: SharePersister = {
    async savePageWithPhrasesAndShare(page, phrases, share) {
      if (saveError) throw saveError;
      saves.push({ page, phrases, share });
    },
  };

  const shortUrls: ShareUrlMinter = {
    generateShareCode() {
      codeCalls += 1;
      return CODE;
    },
    buildShareUrl(code) {
      return `https://aya.app/s/${code}`;
    },
  };

  const handler = makeSharesCreateHandler({
    repository,
    shortUrls,
    now: () => new Date('2026-06-11T00:00:00.000Z'),
  });

  return {
    handler,
    saves,
    get codeCalls() {
      return codeCalls;
    },
  };
}

/** Assert the handler rejects with a 400 validation_error and persisted nothing. */
async function assertValidationRejected(
  handler: ReturnType<typeof makeSharesCreateHandler>,
  saves: SavedCall[],
  body: unknown,
): Promise<void> {
  await assert.rejects(
    () => Promise.resolve(handler({ body })),
    (err: unknown) =>
      err instanceof ApiError && err.code === 'validation_error' && err.statusCode === 400,
  );
  assert.equal(saves.length, 0, 'no write on a validation failure');
}

test('happy path: 201 { code, url, pageId } and one transactional write', async () => {
  const { handler, saves } = makeHarness();
  const page = makePage();
  const phrases = goodPhrases();

  const res = await handler({ body: { page, phrases } });

  assert.equal(res.statusCode, 201);
  const parsed = ShareResponseSchema.safeParse(res.body);
  assert.equal(parsed.success, true, 'response matches ShareResponseSchema');
  assert.equal(res.body.code, CODE);
  assert.equal(res.body.url, `https://aya.app/s/${CODE}`);
  assert.equal(res.body.pageId, PAGE_ID);

  // Exactly one write: the Page, all N phrases, and one Share.
  assert.equal(saves.length, 1);
  const saved = saves[0]!;
  assert.deepEqual(saved.page, page);
  assert.equal(saved.phrases.length, phrases.length);
  assert.deepEqual(saved.share, {
    code: CODE,
    pageId: PAGE_ID,
    createdAt: '2026-06-11T00:00:00.000Z',
  });
});

test('invalid shape -> validation_error (400), writes nothing', async () => {
  const { handler, saves } = makeHarness();
  await assertValidationRejected(handler, saves, { page: makePage() }); // no phrases
});

test('empty phrases -> validation_error (400), writes nothing', async () => {
  const { handler, saves } = makeHarness();
  await assertValidationRejected(handler, saves, { page: makePage(), phrases: [] });
});

test('concatenation != fullText -> validation_error (400), writes nothing', async () => {
  const { handler, saves } = makeHarness();
  const phrases = goodPhrases();
  phrases[1] = { ...phrases[1]!, original: '不觉' }; // drops 晓, breaks reconstruction
  await assertValidationRejected(handler, saves, { page: makePage(), phrases });
});

test('index gap -> validation_error (400), writes nothing', async () => {
  const { handler, saves } = makeHarness();
  const phrases = goodPhrases();
  phrases[1] = { ...phrases[1]!, index: 3 }; // 1,3 — not contiguous from 1
  await assertValidationRejected(handler, saves, { page: makePage(), phrases });
});

test('duplicate index -> validation_error (400), writes nothing', async () => {
  const { handler, saves } = makeHarness();
  const phrases = goodPhrases();
  phrases[1] = { ...phrases[1]!, index: 1 }; // both index 1
  await assertValidationRejected(handler, saves, { page: makePage(), phrases });
});

test('mismatched pageId (phrases point at a different page) -> validation_error (400), writes nothing', async () => {
  const { handler, saves } = makeHarness();
  // Phrases reconstruct fullText and are internally consistent, but reference
  // a different pageId than page.id.
  const otherId = '11111111-1111-4111-8111-111111111111';
  const phrases = goodPhrases(otherId);
  await assertValidationRejected(handler, saves, { body: { page: makePage(), phrases } }.body);
});

test('mixed pageId across phrases -> validation_error (400), writes nothing', async () => {
  const { handler, saves } = makeHarness();
  const phrases = goodPhrases();
  phrases[1] = { ...phrases[1]!, pageId: '22222222-2222-4222-8222-222222222222' };
  await assertValidationRejected(handler, saves, { page: makePage(), phrases });
});

test('absent body -> validation_error (400), writes nothing', async () => {
  const { handler, saves } = makeHarness();
  await assertValidationRejected(handler, saves, undefined);
});
