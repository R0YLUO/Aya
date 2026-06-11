import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Phrase } from '@aya/shared';
import {
  editDistance,
  characterErrorRate,
  characterAccuracy,
  boundaryF1,
  idiomSplitCount,
  reconstructionPass,
} from './scorers.js';

test('editDistance: identical strings are 0', () => {
  assert.equal(editDistance('画蛇添足', '画蛇添足'), 0);
  assert.equal(editDistance('', ''), 0);
});

test('editDistance: single substitution / insertion / deletion', () => {
  assert.equal(editDistance('今天', '明天'), 1); // substitution
  assert.equal(editDistance('天气', '天'), 1); // deletion
  assert.equal(editDistance('天', '天气'), 1); // insertion
});

test('characterErrorRate: perfect is 0, accuracy is 1', () => {
  assert.equal(characterErrorRate('今天天气', '今天天气'), 0);
  assert.equal(characterAccuracy('今天天气', '今天天气'), 1);
});

test('characterErrorRate: one wrong char in four => 0.25', () => {
  assert.equal(characterErrorRate('今天天好', '今天天气'), 0.25);
  assert.equal(characterAccuracy('今天天好', '今天天气'), 0.75);
});

test('characterErrorRate: empty gold edge cases', () => {
  assert.equal(characterErrorRate('', ''), 0);
  assert.equal(characterErrorRate('x', ''), 1);
});

test('boundaryF1: identical segmentation is perfect', () => {
  const s = boundaryF1(['今天', '天气', '很', '好'], ['今天', '天气', '很', '好']);
  assert.equal(s.precision, 1);
  assert.equal(s.recall, 1);
  assert.equal(s.f1, 1);
});

test('boundaryF1: a split idiom lowers precision and recall', () => {
  // gold keeps 画蛇添足 whole; prediction splits it into characters.
  const gold = ['他', '画蛇添足'];
  const pred = ['他', '画', '蛇', '添', '足'];
  const s = boundaryF1(pred, gold);
  // gold interior boundary at offset 1; pred has boundaries at 1,2,3,4.
  assert.equal(s.recall, 1); // the gold boundary (offset 1) is found
  assert.ok(s.precision < 1); // pred added 3 spurious boundaries
  assert.ok(s.f1 < 1);
});

test('boundaryF1: single token both sides => 1', () => {
  const s = boundaryF1(['好'], ['好']);
  assert.equal(s.f1, 1);
});

test('idiomSplitCount: counts gold idioms not kept whole', () => {
  assert.equal(idiomSplitCount(['他', '画蛇添足'], ['画蛇添足']), 0);
  assert.equal(idiomSplitCount(['他', '画', '蛇', '添', '足'], ['画蛇添足']), 1);
  // single-character "idioms" are ignored.
  assert.equal(idiomSplitCount(['好'], ['好']), 0);
});

function phrase(index: number, original: string): Phrase {
  return {
    id: `p${index}`,
    pageId: 'page-1',
    index,
    original,
    pinyin: null,
    translation: null,
    contextualMeaning: null,
  };
}

test('reconstructionPass: true when phrases rebuild fullText', () => {
  const phrases = [phrase(1, '今天'), phrase(2, '好'), phrase(3, '。')];
  assert.equal(reconstructionPass('今天好。', phrases), true);
});

test('reconstructionPass: false on text mismatch', () => {
  const phrases = [phrase(1, '今天'), phrase(2, '坏'), phrase(3, '。')];
  assert.equal(reconstructionPass('今天好。', phrases), false);
});
