import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Phrase } from '@aya/shared';
import {
  editDistance,
  characterErrorRate,
  characterAccuracy,
  scoreCER,
  summariseCer,
  CER_ACCURACY_TARGET,
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

test('scoreCER: identical strings score CER 0 and accuracy 1.0', () => {
  const s = scoreCER('今天天气很好', '今天天气很好');
  assert.equal(s.cer, 0);
  assert.equal(s.accuracy, 1);
});

test('scoreCER: a single edit in four chars => CER 0.25, accuracy 0.75', () => {
  const s = scoreCER('今天天好', '今天天气');
  assert.equal(s.cer, 0.25);
  assert.equal(s.accuracy, 0.75);
});

test('scoreCER: empty-string cases', () => {
  // both empty => perfect.
  assert.deepEqual(scoreCER('', ''), { cer: 0, accuracy: 1 });
  // empty prediction vs non-empty gold => everything missed.
  assert.deepEqual(scoreCER('', '今天'), { cer: 1, accuracy: 0 });
  // non-empty prediction vs empty gold => fully wrong.
  assert.deepEqual(scoreCER('x', ''), { cer: 1, accuracy: 0 });
});

test('scoreCER: accuracy is clamped to [0, 1] even when CER exceeds 1', () => {
  // Prediction much longer than the gold => edit distance > gold length, so CER
  // exceeds 1 (standard, unnormalised-against-prediction CER); accuracy clamps to 0.
  const s = scoreCER('完全不同的文字内容', '今天');
  assert.ok(s.cer > 1);
  assert.equal(s.accuracy, 0);
});

test('summariseCer: flags examples below the 95% accuracy target', () => {
  const summary = summariseCer([
    { id: 'clean', predicted: '今天天气很好', expected: '今天天气很好' }, // 1.0
    { id: 'one-off', predicted: '今天天气很坏', expected: '今天天气很好' }, // 5/6 ≈ 0.833
    { id: 'near-miss', predicted: '今天天气很好啊呀哈嘿', expected: '今天天气很好啊呀哈嘿哈' }, // 9/10 = 0.9
  ]);
  assert.equal(summary.target, CER_ACCURACY_TARGET);
  assert.equal(summary.rows.length, 3);
  // clean passes; one-off and near-miss are below 0.95.
  assert.deepEqual(
    summary.belowTarget.map((r) => r.id),
    ['one-off', 'near-miss'],
  );
  assert.equal(summary.allPassed, false);
});

test('summariseCer: all-passing batch and empty batch', () => {
  const allPass = summariseCer([
    { id: 'a', predicted: '你好', expected: '你好' },
    { id: 'b', predicted: '世界', expected: '世界' },
  ]);
  assert.equal(allPass.allPassed, true);
  assert.equal(allPass.belowTarget.length, 0);
  assert.equal(allPass.meanAccuracy, 1);

  const empty = summariseCer([]);
  assert.equal(empty.allPassed, true);
  assert.equal(empty.meanAccuracy, 0);
  assert.equal(empty.belowTarget.length, 0);
});

test('summariseCer: respects a custom target threshold', () => {
  const examples = [{ id: 'x', predicted: '今天天好', expected: '今天天气' }]; // 0.75
  assert.equal(summariseCer(examples, 0.7).allPassed, true);
  assert.equal(summariseCer(examples, 0.8).allPassed, false);
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
