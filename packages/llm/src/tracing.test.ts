import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRunConfig,
  buildRunMetadata,
  isTracingEnabled,
} from './tracing.js';

test('buildRunMetadata captures stage/model/env and pageId', () => {
  const md = buildRunMetadata(
    { stage: 'ocr', pageId: '0f2e', model: 'test-model', env: 'prod' },
    {},
  );
  assert.deepEqual(md, {
    stage: 'ocr',
    model: 'test-model',
    env: 'prod',
    pageId: '0f2e',
  });
});

test('buildRunMetadata omits pageId when absent and defaults env', () => {
  const md = buildRunMetadata({ stage: 'analysis', model: 'm' }, {});
  assert.deepEqual(md, { stage: 'analysis', model: 'm', env: 'dev' });
  assert.equal('pageId' in md, false);
});

test('buildRunMetadata falls back to AYA_ENV from the environment', () => {
  const md = buildRunMetadata({ stage: 'ocr', model: 'm' }, { AYA_ENV: 'staging' });
  assert.equal(md.env, 'staging');
});

test('buildRunConfig produces tags and metadata for a tagged run', () => {
  const cfg = buildRunConfig(
    { stage: 'analysis', pageId: '0f2e', model: 'test-model', env: 'prod' },
    {},
  );
  assert.equal(cfg.runName, 'aya-analysis');
  assert.deepEqual(cfg.tags, [
    'stage:analysis',
    'model:test-model',
    'env:prod',
    'pageId:0f2e',
  ]);
  assert.deepEqual(cfg.metadata, {
    stage: 'analysis',
    model: 'test-model',
    env: 'prod',
    pageId: '0f2e',
  });
});

test('buildRunConfig omits the pageId tag when no pageId is given', () => {
  const cfg = buildRunConfig({ stage: 'ocr', model: 'm', env: 'dev' }, {});
  assert.deepEqual(cfg.tags, ['stage:ocr', 'model:m', 'env:dev']);
});

test('isTracingEnabled reflects LANGCHAIN_TRACING_V2', () => {
  assert.equal(isTracingEnabled({}), false);
  assert.equal(isTracingEnabled({ LANGCHAIN_TRACING_V2: 'false' }), false);
  assert.equal(isTracingEnabled({ LANGCHAIN_TRACING_V2: 'true' }), true);
  assert.equal(isTracingEnabled({ LANGCHAIN_TRACING_V2: '1' }), true);
  assert.equal(isTracingEnabled({ LANGCHAIN_TRACING_V2: 'TRUE' }), true);
});
