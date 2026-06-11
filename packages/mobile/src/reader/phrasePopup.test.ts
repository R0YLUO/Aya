import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Phrase } from '@aya/shared';
import {
  closePhrasePopup,
  closedPhrasePopup,
  isPhrasePopupOpen,
  openPhrasePopup,
  phrasePopupContent,
} from './phrasePopup.js';

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

test('popup starts closed', () => {
  assert.equal(isPhrasePopupOpen(closedPhrasePopup), false);
});

test('tapping an interactive phrase opens the popup carrying that phrase', () => {
  const phrase = word(1, '你好');
  const state = openPhrasePopup(closedPhrasePopup, phrase);
  assert.equal(isPhrasePopupOpen(state), true);
  assert.equal(state?.phrase, phrase);
});

test('tapping a non-tappable token is a no-op and leaves state unchanged', () => {
  // Closed stays closed.
  assert.equal(openPhrasePopup(closedPhrasePopup, punct(1, '，')), closedPhrasePopup);

  // An already-open popup is not disturbed by tapping a plain token.
  const open = openPhrasePopup(closedPhrasePopup, word(1, '你好'));
  const after = openPhrasePopup(open, punct(2, '。'));
  assert.equal(after, open);
});

test('opening for a different phrase swaps the shown phrase', () => {
  const a = word(1, '你好');
  const b = word(2, '世界');
  let state = openPhrasePopup(closedPhrasePopup, a);
  state = openPhrasePopup(state, b);
  assert.equal(state?.phrase, b);
});

test('any dismissal affordance closes the popup', () => {
  const open = openPhrasePopup(closedPhrasePopup, word(1, '你好'));
  assert.equal(isPhrasePopupOpen(open), true);
  // tap-outside / swipe-down / close button all route through closePhrasePopup.
  const closed = closePhrasePopup();
  assert.equal(isPhrasePopupOpen(closed), false);
});

test('phrasePopupContent surfaces the MVP fields for an interactive phrase', () => {
  const phrase: Phrase = {
    id: 'w',
    pageId: PAGE_ID,
    index: 1,
    original: '画蛇添足',
    pinyin: 'huà shé tiān zú',
    translation: 'to overdo it',
    contextualMeaning: 'ruining something by adding what is superfluous',
  };
  assert.deepEqual(phrasePopupContent(phrase), {
    pinyin: 'huà shé tiān zú',
    translation: 'to overdo it',
    contextualMeaning: 'ruining something by adding what is superfluous',
  });
});

test('phrasePopupContent is null for a non-analysed token', () => {
  assert.equal(phrasePopupContent(punct(1, '，')), null);
});
