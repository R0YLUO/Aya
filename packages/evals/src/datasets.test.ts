import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadOcrDataset,
  loadAnalysisDataset,
  loadTranslationDataset,
  AnalysisExampleSchema,
  TranslationExampleSchema,
} from './datasets.js';

test('loadOcrDataset: loads and validates the v1 fixture', async () => {
  const ds = await loadOcrDataset();
  assert.equal(ds.name, 'ocr');
  assert.equal(ds.version, 'v1');
  assert.ok(ds.examples.length >= 1);
  // Includes the hard PRD cases.
  const statuses = new Set(ds.examples.map((e) => e.expected.status));
  assert.ok(statuses.has('ok'));
  assert.ok(statuses.has('unreadable'));
  assert.ok(statuses.has('no_chinese_text'));
});

test('loadAnalysisDataset: loads and validates the v1 fixture', async () => {
  const ds = await loadAnalysisDataset();
  assert.equal(ds.name, 'analysis');
  // Every example's gold reconstructs its fullText.
  for (const ex of ds.examples) {
    assert.equal(ex.goldBoundaries.join(''), ex.fullText);
  }
  // At least one four-character idiom is expected to stay whole as a single token.
  const allTokens = ds.examples.flatMap((e) => e.goldBoundaries);
  assert.ok(
    allTokens.includes('画蛇添足'),
    'analysis set should keep a four-character idiom whole',
  );
});

test('loadTranslationDataset: loads and validates the v1 fixture', async () => {
  const ds = await loadTranslationDataset();
  assert.equal(ds.name, 'translation');
  assert.ok(ds.examples.length >= 1);
  // Every phrase under evaluation occurs verbatim in its passage.
  for (const ex of ds.examples) {
    assert.ok(
      ex.fullText.includes(ex.phrase),
      `phrase ${ex.phrase} should occur in its fullText`,
    );
    assert.ok(ex.referenceTranslation.length > 0);
    assert.ok(ex.referenceContextualMeaning.length > 0);
    assert.ok(ex.rubricNotes.length > 0);
  }
});

test('TranslationExampleSchema: rejects a phrase absent from fullText', () => {
  assert.throws(() =>
    TranslationExampleSchema.parse({
      id: 'x',
      fullText: '今天天气很好。',
      phrase: '不存在',
      referenceTranslation: 'does not exist',
      referenceContextualMeaning: 'n/a',
      rubricNotes: 'n/a',
    }),
  );
});

test('AnalysisExampleSchema: rejects gold boundaries that do not reconstruct', () => {
  const bad = {
    id: 'x',
    pageId: 'p',
    fullText: '今天好',
    goldBoundaries: ['今天', '坏'],
  };
  assert.throws(() => AnalysisExampleSchema.parse(bad));
});

test('AnalysisExampleSchema: defaults goldPinyin to {}', () => {
  const ex = AnalysisExampleSchema.parse({
    id: 'x',
    pageId: 'p',
    fullText: '好',
    goldBoundaries: ['好'],
  });
  assert.deepEqual(ex.goldPinyin, {});
});
