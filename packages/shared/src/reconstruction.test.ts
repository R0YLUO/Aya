import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReconstruction } from './reconstruction.js';
import type { Phrase } from './domain.js';

const PAGE_ID = '0f2e0000-0000-4000-8000-000000000000';

function phrase(index: number, original: string, pageId = PAGE_ID): Phrase {
  return {
    id: `id-${index}`,
    pageId,
    index,
    original,
    pinyin: null,
    translation: null,
    contextualMeaning: null,
  };
}

// fullText = "他好。"
const validPhrases: Phrase[] = [phrase(1, '他'), phrase(2, '好'), phrase(3, '。')];
const FULL_TEXT = '他好。';

test('valid set passes', () => {
  assert.deepEqual(checkReconstruction(FULL_TEXT, validPhrases), { ok: true });
});

test('valid set passes regardless of input order (sorts a copy)', () => {
  const shuffled = [phrase(3, '。'), phrase(1, '他'), phrase(2, '好')];
  assert.deepEqual(checkReconstruction(FULL_TEXT, shuffled), { ok: true });
});

test('empty phrases fails', () => {
  assert.deepEqual(checkReconstruction('', []), { ok: false, reason: 'empty' });
});

test('gap in index fails', () => {
  const withGap = [phrase(1, '他'), phrase(3, '。')]; // missing index 2
  const r = checkReconstruction('他。', withGap);
  assert.deepEqual(r, { ok: false, reason: 'index_not_contiguous_from_1' });
});

test('duplicate index fails', () => {
  const dup = [phrase(1, '他'), phrase(1, '好'), phrase(2, '。')];
  assert.deepEqual(checkReconstruction(FULL_TEXT, dup), {
    ok: false,
    reason: 'duplicate_index',
  });
});

test('concatenation mismatch fails', () => {
  const r = checkReconstruction('他好吗？', validPhrases);
  assert.deepEqual(r, { ok: false, reason: 'text_mismatch' });
});

test('wrong pageId fails', () => {
  const mixed = [phrase(1, '他'), phrase(2, '好', 'other-page'), phrase(3, '。')];
  assert.deepEqual(checkReconstruction(FULL_TEXT, mixed), {
    ok: false,
    reason: 'mixed_page_id',
  });
});

test('does not mutate inputs', () => {
  const input = [phrase(3, '。'), phrase(1, '他'), phrase(2, '好')];
  const snapshot = input.map((p) => p.index);
  checkReconstruction(FULL_TEXT, input);
  assert.deepEqual(
    input.map((p) => p.index),
    snapshot,
  );
});
