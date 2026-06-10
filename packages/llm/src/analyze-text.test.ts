import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeText, AnalysisFailedError } from './analyze-text.js';
import type { AnalysisResult } from './analysis.js';
import type { StructuredRunner } from './model.js';

const noSleep = (_ms: number): Promise<void> => Promise.resolve();

/** A runner that returns a fixed result and counts invocations. */
function fixedRunner(
  result: AnalysisResult,
): StructuredRunner<AnalysisResult> & { calls: number } {
  return {
    calls: 0,
    async invoke() {
      this.calls += 1;
      return result;
    },
  };
}

const FULL_TEXT = '你好。';

const GOOD_TOKENS: AnalysisResult = {
  tokens: [
    { index: 1, original: '你好', pinyin: 'nǐ hǎo', translation: 'hello', contextualMeaning: 'greeting' },
    { index: 2, original: '。', pinyin: null, translation: null, contextualMeaning: null },
  ],
};

const BAD_TOKENS: AnalysisResult = {
  tokens: [
    { index: 1, original: 'WRONG', pinyin: 'cuò', translation: 'wrong', contextualMeaning: 'wrong' },
  ],
};

test('returns Phrase[] ordered by index with ids and pageId assigned', async () => {
  const runner = fixedRunner(GOOD_TOKENS);
  const phrases = await analyzeText(FULL_TEXT, 'page-1', { runner });

  assert.equal(phrases.length, 2);
  assert.equal(phrases[0]!.pageId, 'page-1');
  assert.equal(phrases[1]!.pageId, 'page-1');
  assert.ok(phrases[0]!.id.length > 0);
  assert.ok(phrases[1]!.id.length > 0);
  assert.notEqual(phrases[0]!.id, phrases[1]!.id);
  assert.equal(phrases[0]!.index, 1);
  assert.equal(phrases[1]!.index, 2);
  assert.equal(phrases[0]!.original, '你好');
  assert.equal(phrases[0]!.pinyin, 'nǐ hǎo');
  assert.equal(phrases[1]!.pinyin, null);
  assert.equal(runner.calls, 1);
});

test('first-attempt reconstruction mismatch triggers exactly one retry', async () => {
  let call = 0;
  const runner: StructuredRunner<AnalysisResult> & { calls: number } = {
    get calls() { return call; },
    async invoke() {
      call += 1;
      return call === 1 ? BAD_TOKENS : GOOD_TOKENS;
    },
  };
  const phrases = await analyzeText(FULL_TEXT, 'page-1', { runner });
  assert.equal(call, 2);
  assert.equal(phrases.length, 2);
  assert.equal(phrases[0]!.original, '你好');
});

test('persistent reconstruction mismatch throws AnalysisFailedError', async () => {
  const runner = fixedRunner(BAD_TOKENS);
  await assert.rejects(
    analyzeText(FULL_TEXT, 'page-1', { runner }),
    (err: unknown) => err instanceof AnalysisFailedError,
  );
  assert.equal(runner.calls, 2);
});

test('structured-output parse failure triggers one bounded retry then fails', async () => {
  let calls = 0;
  const runner: StructuredRunner<AnalysisResult> = {
    async invoke() {
      calls += 1;
      throw new Error('model parse error');
    },
  };
  await assert.rejects(
    analyzeText(FULL_TEXT, 'page-1', {
      runner,
      retry: { maxAttempts: 2, baseDelayMs: 0, sleep: noSleep },
    }),
    /model parse error/,
  );
  assert.equal(calls, 2);
});

test('returns phrases sorted by index even if model returns out of order', async () => {
  const runner = fixedRunner({
    tokens: [
      { index: 2, original: '。', pinyin: null, translation: null, contextualMeaning: null },
      { index: 1, original: '你好', pinyin: 'nǐ hǎo', translation: 'hello', contextualMeaning: 'greeting' },
    ],
  });
  const phrases = await analyzeText(FULL_TEXT, 'page-1', { runner });
  assert.equal(phrases[0]!.index, 1);
  assert.equal(phrases[1]!.index, 2);
});
