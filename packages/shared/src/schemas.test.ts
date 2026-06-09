import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PageSchema,
  PhraseSchema,
  ShareSchema,
  AnalyzedPageSchema,
} from './schemas.js';

const validPage = {
  id: '0f2e0000-0000-4000-8000-000000000000',
  fullText: '他三天打鱼两天晒网。',
  createdAt: '2026-06-08T10:12:00.000Z',
};

const validWordPhrase = {
  id: '0f2e0000-0000-4000-8000-000000000001',
  pageId: validPage.id,
  index: 1,
  original: '他',
  pinyin: 'tā',
  translation: 'he',
  contextualMeaning: 'the person being described',
};

const validPunctPhrase = {
  id: '0f2e0000-0000-4000-8000-000000000002',
  pageId: validPage.id,
  index: 2,
  original: '。',
  pinyin: null,
  translation: null,
  contextualMeaning: null,
};

test('PageSchema accepts a valid page', () => {
  assert.equal(PageSchema.safeParse(validPage).success, true);
});

test('PageSchema rejects a non-ISO createdAt', () => {
  const r = PageSchema.safeParse({ ...validPage, createdAt: 'June 8 2026' });
  assert.equal(r.success, false);
});

test('PageSchema rejects a missing field', () => {
  const { fullText: _omit, ...rest } = validPage;
  assert.equal(PageSchema.safeParse(rest).success, false);
});

test('PhraseSchema accepts a word phrase and a punctuation phrase', () => {
  assert.equal(PhraseSchema.safeParse(validWordPhrase).success, true);
  assert.equal(PhraseSchema.safeParse(validPunctPhrase).success, true);
});

test('PhraseSchema rejects a negative index', () => {
  const r = PhraseSchema.safeParse({ ...validWordPhrase, index: -1 });
  assert.equal(r.success, false);
});

test('PhraseSchema rejects a zero index (must be positive)', () => {
  assert.equal(PhraseSchema.safeParse({ ...validWordPhrase, index: 0 }).success, false);
});

test('PhraseSchema rejects a non-integer index', () => {
  assert.equal(PhraseSchema.safeParse({ ...validWordPhrase, index: 1.5 }).success, false);
});

test('PhraseSchema rejects a missing field', () => {
  const { original: _omit, ...rest } = validWordPhrase;
  assert.equal(PhraseSchema.safeParse(rest).success, false);
});

test('ShareSchema accepts a valid share and rejects a bad timestamp', () => {
  const share = {
    code: 'k7Qm2pX9',
    pageId: validPage.id,
    createdAt: '2026-06-08T10:12:00.000Z',
  };
  assert.equal(ShareSchema.safeParse(share).success, true);
  assert.equal(ShareSchema.safeParse({ ...share, createdAt: 'nope' }).success, false);
});

test('AnalyzedPageSchema accepts a page with phrases', () => {
  const r = AnalyzedPageSchema.safeParse({
    page: validPage,
    phrases: [validWordPhrase, validPunctPhrase],
  });
  assert.equal(r.success, true);
});

test('AnalyzedPageSchema rejects a phrase with a bad index', () => {
  const r = AnalyzedPageSchema.safeParse({
    page: validPage,
    phrases: [{ ...validWordPhrase, index: 0 }],
  });
  assert.equal(r.success, false);
});
