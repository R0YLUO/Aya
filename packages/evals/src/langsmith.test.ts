import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLangSmithEnabled, registerLangSmithDataset } from './langsmith.js';

test('isLangSmithEnabled: false when tracing/key absent', () => {
  assert.equal(isLangSmithEnabled({}), false);
  assert.equal(isLangSmithEnabled({ LANGCHAIN_TRACING_V2: 'true' }), false);
  assert.equal(isLangSmithEnabled({ LANGCHAIN_API_KEY: 'k' }), false);
});

test('isLangSmithEnabled: true with tracing + a key', () => {
  assert.equal(
    isLangSmithEnabled({ LANGCHAIN_TRACING_V2: 'true', LANGCHAIN_API_KEY: 'k' }),
    true,
  );
  assert.equal(
    isLangSmithEnabled({ LANGCHAIN_TRACING_V2: 'true', LANGSMITH_API_KEY: 'k' }),
    true,
  );
});

test('registerLangSmithDataset: no-ops (returns false) when disabled', async () => {
  const registered = await registerLangSmithDataset(
    { datasetName: 'aya-ocr-v1', examples: [] },
    {},
  );
  assert.equal(registered, false);
});
