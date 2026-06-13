import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePinyin,
  referencePinyin,
  characterReadings,
  stripTones,
  scorePinyin,
  summarisePinyin,
  DEFAULT_POLYPHONE_EXCEPTIONS,
} from './pinyin.js';

test('normalizePinyin: lower-cases, collapses whitespace, trims', () => {
  assert.equal(normalizePinyin('  Lǔ   Xùn '), 'lǔ xùn');
  assert.equal(normalizePinyin('huà shé tiān zú'), 'huà shé tiān zú');
});

test('referencePinyin: library reading matches gold for common vocabulary', () => {
  assert.equal(referencePinyin('画蛇添足'), 'huà shé tiān zú');
  assert.equal(referencePinyin('天气'), 'tiān qì');
});

test('characterReadings: lists every valid reading of a polyphone char', () => {
  const readings = characterReadings('长');
  assert.ok(readings.includes('cháng'));
  assert.ok(readings.includes('zhǎng'));
  // multi-char input returns nothing (use referencePinyin there).
  assert.deepEqual(characterReadings('天气'), []);
});

test('stripTones: removes tone marks but keeps base syllables', () => {
  assert.equal(stripTones('yì qǐ'), 'yi qi');
  assert.equal(stripTones('huà shé tiān zú'), 'hua she tian zu');
});

test('scorePinyin: exact match against the library reference', () => {
  const s = scorePinyin('画蛇添足', 'huà shé tiān zú');
  assert.equal(s.match, true);
  assert.equal(s.polyphoneException, false);
  assert.equal(s.reference, 'huà shé tiān zú');
});

test('scorePinyin: match is case- and spacing-insensitive (proper noun)', () => {
  // gold capitalises proper nouns; the library lower-cases. Not a mismatch.
  const s = scorePinyin('鲁迅', 'Lǔ Xùn');
  assert.equal(s.match, true);
  assert.equal(s.polyphoneException, false);
});

test('scorePinyin: a clear wrong reading is a mismatch', () => {
  // 天气 is tiān qì; predicting tiān xì is plainly wrong.
  const s = scorePinyin('天气', 'tiān xì');
  assert.equal(s.match, false);
  assert.equal(s.polyphoneException, false);
});

test('scorePinyin: single-char polyphone alternate reading is forgiven', () => {
  // 长 reads cháng or zhǎng; the library picks one, but the other is still a
  // valid reading of the character, so it is NOT counted as a mismatch.
  const s = scorePinyin('长', 'zhǎng');
  assert.equal(s.match, true);
  assert.equal(s.polyphoneException, true);
});

test('scorePinyin: a listed token forgives a tone-only difference', () => {
  // 一起 takes tone sandhi (yì qǐ); plain yī qǐ differs only in tone and is
  // listed as a known polyphone exception, so it is excused.
  const s = scorePinyin('一起', 'yī qǐ');
  assert.equal(s.match, true);
  assert.equal(s.polyphoneException, true);
});

test('summarisePinyin: reports a mismatch rate excluding polyphone exceptions', () => {
  const summary = summarisePinyin([
    { token: '画蛇添足', predicted: 'huà shé tiān zú' }, // match
    { token: '天气', predicted: 'tiān qì' }, // match
    { token: '长', predicted: 'zhǎng' }, // polyphone exception (excused)
    { token: '天气', predicted: 'tiān xì' }, // genuine mismatch
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.matched, 3); // two exact + one polyphone
  assert.equal(summary.polyphoneExceptions, 1);
  assert.equal(summary.mismatches, 1);
  // denominator excludes the polyphone exception: 1 mismatch / (4 - 1) = 1/3.
  assert.ok(Math.abs(summary.mismatchRate - 1 / 3) < 1e-9);
});

test('summarisePinyin: a clean common-vocabulary batch has a 0 mismatch rate', () => {
  const summary = summarisePinyin([
    { token: '今天', predicted: 'jīn tiān' },
    { token: '天气', predicted: 'tiān qì' },
    { token: '公园', predicted: 'gōng yuán' },
    { token: '散步', predicted: 'sàn bù' },
  ]);
  assert.equal(summary.mismatches, 0);
  assert.equal(summary.mismatchRate, 0);
});

test('summarisePinyin: empty batch is a 0 mismatch rate, not NaN', () => {
  const summary = summarisePinyin([]);
  assert.equal(summary.total, 0);
  assert.equal(summary.mismatchRate, 0);
});

test('DEFAULT_POLYPHONE_EXCEPTIONS includes the documented entries', () => {
  assert.ok('一起' in DEFAULT_POLYPHONE_EXCEPTIONS);
  assert.ok('的' in DEFAULT_POLYPHONE_EXCEPTIONS);
});
