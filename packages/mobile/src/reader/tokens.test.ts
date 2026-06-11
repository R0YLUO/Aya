import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnalyzedPage, Phrase } from '@aya/shared';
import { isInteractive, readerTokens, reconstructText } from './tokens.js';

const PAGE_ID = '0f2e0000-0000-4000-8000-000000000000';

function word(index: number, original: string): Phrase {
  return {
    id: `w${index}`,
    pageId: PAGE_ID,
    index,
    original,
    pinyin: `pinyin-${index}`,
    translation: `translation-${index}`,
    contextualMeaning: `meaning-${index}`,
  };
}

function punct(index: number, original: string): Phrase {
  return {
    id: `p${index}`,
    pageId: PAGE_ID,
    index,
    original,
    pinyin: null,
    translation: null,
    contextualMeaning: null,
  };
}

// "他好\n吗？" — words 他 好 吗, a newline token, and a question mark.
const page: AnalyzedPage = {
  page: { id: PAGE_ID, fullText: '他好\n吗？', createdAt: '2026-06-09T00:00:00.000Z' },
  phrases: [word(1, '他'), word(2, '好'), punct(3, '\n'), word(4, '吗'), punct(5, '？')],
};

test('isInteractive is true for pinyin-bearing phrases, false for null analysis', () => {
  assert.equal(isInteractive(word(1, '他')), true);
  assert.equal(isInteractive(punct(1, '，')), false);
});

test('readerTokens marks pinyin-bearing phrases tappable and null tokens plain', () => {
  const tokens = readerTokens(page);
  assert.deepEqual(
    tokens.map((t) => [t.phrase.original, t.interactive]),
    [
      ['他', true],
      ['好', true],
      ['\n', false],
      ['吗', true],
      ['？', false],
    ],
  );
  assert.equal(tokens.filter((t) => t.interactive).length, 3);
});

test('readerTokens orders by index even when input is unordered', () => {
  const shuffled: AnalyzedPage = {
    ...page,
    phrases: [page.phrases[4]!, page.phrases[1]!, page.phrases[3]!, page.phrases[0]!, page.phrases[2]!],
  };
  assert.deepEqual(
    readerTokens(shuffled).map((t) => t.phrase.original),
    ['他', '好', '\n', '吗', '？'],
  );
});

test('reconstructText reproduces fullText including line breaks', () => {
  assert.equal(reconstructText(page), page.page.fullText);
  assert.equal(reconstructText(page), '他好\n吗？');
});

test('reconstructText handles a long (120-token) page', () => {
  const phrases: Phrase[] = [];
  let expected = '';
  let i = 1;
  for (let n = 0; n < 60; n++) {
    phrases.push(word(i, '学'));
    expected += '学';
    i++;
    phrases.push(punct(i, '，'));
    expected += '，';
    i++;
  }
  const longPage: AnalyzedPage = {
    page: { id: PAGE_ID, fullText: expected, createdAt: '2026-06-09T00:00:00.000Z' },
    phrases,
  };
  assert.equal(readerTokens(longPage).filter((t) => t.interactive).length, 60);
  assert.equal(reconstructText(longPage), expected);
});
