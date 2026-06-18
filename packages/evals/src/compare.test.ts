import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnalysisResult, StructuredRunner } from '@aya/llm';
import { runEvalsMatrix, loadCompareConfig } from './compare.js';

// A fixed analysis runner: lets the matrix run offline (no network, no keys) so we
// test the comparison WIRING rather than real model differences.
function fixedAnalysisRunner(): StructuredRunner<AnalysisResult> {
  return {
    invoke: async () =>
      ({ tokens: [{ index: 1, original: 'x', pinyin: null, translation: null, contextualMeaning: null }] }) as AnalysisResult,
  };
}

test('runEvalsMatrix: runs once per config and labels each report', async () => {
  const results = await runEvalsMatrix(
    [
      { label: 'model-a', env: { AYA_LLM_PROVIDER: 'anthropic' } },
      { label: 'model-b', env: { AYA_LLM_PROVIDER: 'google-genai' } },
    ],
    { analysisRunner: fixedAnalysisRunner(), baseEnv: {} },
  );
  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((r) => r.label),
    ['model-a', 'model-b'],
  );
  // The injected analysis runner ran for both (rows present), proving shared options
  // apply to every config.
  const [a, b] = results;
  assert.ok(a && b);
  assert.ok(a.report.analysis.rows.length > 0);
  assert.ok(b.report.analysis.rows.length > 0);
});

test('runEvalsMatrix: with no runners and empty base env, every stage is skipped', async () => {
  const results = await runEvalsMatrix([{ label: 'm', env: {} }], { baseEnv: {} });
  const [r] = results;
  assert.ok(r);
  assert.equal(r.report.ocr.rows.length, 0);
  assert.equal(r.report.analysis.rows.length, 0);
  assert.equal(r.report.translation.rows.length, 0);
});

test('loadCompareConfig: the committed template parses and lists labelled models', async () => {
  const cfg = await loadCompareConfig();
  assert.ok(Array.isArray(cfg.models) && cfg.models.length >= 1);
  for (const m of cfg.models) {
    assert.equal(typeof m.label, 'string');
    assert.ok(m.env && typeof m.env['AYA_LLM_PROVIDER'] === 'string');
  }
});
