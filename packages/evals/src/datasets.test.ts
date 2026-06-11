import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadOcrDataset,
  loadAnalysisDataset,
  AnalysisExampleSchema,
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
