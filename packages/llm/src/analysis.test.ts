import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnalysisResultSchema, buildAnalysisSystemPrompt } from './analysis.js';

test('validates a sample token array with word and punctuation tokens', () => {
  const result = AnalysisResultSchema.parse({
    tokens: [
      {
        index: 1,
        original: '画蛇添足',
        pinyin: 'huà shé tiān zú',
        translation: 'to ruin something by adding superfluous detail',
        contextualMeaning: 'here, overdoing a task that was already complete',
      },
      {
        index: 2,
        original: '。',
        pinyin: null,
        translation: null,
        contextualMeaning: null,
      },
    ],
  });
  assert.equal(result.tokens.length, 2);
  assert.equal(result.tokens[0]!.original, '画蛇添足');
  assert.equal(result.tokens[1]!.pinyin, null);
});

test('rejects a non-positive or non-integer index', () => {
  assert.equal(
    AnalysisResultSchema.safeParse({
      tokens: [{ index: 0, original: 'x', pinyin: null, translation: null, contextualMeaning: null }],
    }).success,
    false,
  );
  assert.equal(
    AnalysisResultSchema.safeParse({
      tokens: [{ index: 1.5, original: 'x', pinyin: null, translation: null, contextualMeaning: null }],
    }).success,
    false,
  );
});

test('rejects a token missing a nullable analysis field', () => {
  const r = AnalysisResultSchema.safeParse({
    tokens: [{ index: 1, original: '好', pinyin: 'hǎo', translation: 'good' }],
  });
  assert.equal(r.success, false);
});

test('accepts an empty token list', () => {
  assert.deepEqual(AnalysisResultSchema.parse({ tokens: [] }), { tokens: [] });
});

test('analysis prompt encodes the required intent', () => {
  const p = buildAnalysisSystemPrompt();
  const lower = p.toLowerCase();
  assert.match(lower, /reproduce the input passage/);
  assert.match(lower, /punctuation/);
  assert.match(lower, /line break/);
  assert.match(p, /成语/);
  assert.match(lower, /proper noun/);
  assert.match(lower, /character-by-character/);
  assert.match(lower, /pinyin with tone marks/);
  assert.match(lower, /contextualmeaning/);
  assert.match(lower, /null/);
  assert.match(lower, /starting at 1/);
});
