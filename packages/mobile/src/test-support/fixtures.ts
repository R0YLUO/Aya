// Shared test fixtures: a small, valid AnalyzedPage that satisfies the
// reconstruction invariant. Used across mobile unit tests.

import type { AnalyzedPage, Page, Phrase } from '@aya/shared';

export const PAGE_ID = '0f2e0000-0000-4000-8000-000000000000';
export const FULL_TEXT = '他好。';

export function makePhrase(
  index: number,
  original: string,
  analyzed: boolean,
  pageId = PAGE_ID,
): Phrase {
  return {
    id: `phrase-${index}`,
    pageId,
    index,
    original,
    pinyin: analyzed ? `pinyin-${index}` : null,
    translation: analyzed ? `translation-${index}` : null,
    contextualMeaning: analyzed ? `meaning-${index}` : null,
  };
}

export function makePage(): Page {
  return {
    id: PAGE_ID,
    fullText: FULL_TEXT,
    createdAt: '2026-06-09T00:00:00.000Z',
  };
}

/** A valid AnalyzedPage: "他" + "好" are words, "。" is punctuation (null analysis). */
export function makeAnalyzedPage(): AnalyzedPage {
  return {
    page: makePage(),
    phrases: [
      makePhrase(1, '他', true),
      makePhrase(2, '好', true),
      makePhrase(3, '。', false),
    ],
  };
}
