import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadLlmConfig,
  OCR_MAX_TOKENS,
  ANALYSIS_MAX_TOKENS,
  type Env,
} from './config.js';

const fullEnv: Env = {
  AYA_OCR_MODEL: 'test-ocr-model',
  AYA_ANALYSIS_MODEL: 'test-analysis-model',
  ANTHROPIC_API_KEY: 'sk-test-key',
};

test('resolves config from env with temperature 0 for both stages', () => {
  const cfg = loadLlmConfig(fullEnv);
  assert.deepEqual(cfg.ocr, {
    model: 'test-ocr-model',
    temperature: 0,
    maxTokens: OCR_MAX_TOKENS,
  });
  assert.deepEqual(cfg.analysis, {
    model: 'test-analysis-model',
    temperature: 0,
    maxTokens: ANALYSIS_MAX_TOKENS,
  });
  assert.equal(cfg.apiKey, 'sk-test-key');
});

test('throws a clear error when the OCR model id is missing', () => {
  const env: Env = { ...fullEnv, AYA_OCR_MODEL: undefined };
  assert.throws(() => loadLlmConfig(env), /AYA_OCR_MODEL/);
});

test('throws when the analysis model id is missing', () => {
  const env: Env = { ...fullEnv, AYA_ANALYSIS_MODEL: undefined };
  assert.throws(() => loadLlmConfig(env), /AYA_ANALYSIS_MODEL/);
});

test('throws when the API key is missing', () => {
  const env: Env = { ...fullEnv, ANTHROPIC_API_KEY: undefined };
  assert.throws(() => loadLlmConfig(env), /ANTHROPIC_API_KEY/);
});

test('treats blank/whitespace-only values as missing', () => {
  const env: Env = { ...fullEnv, AYA_OCR_MODEL: '   ' };
  assert.throws(() => loadLlmConfig(env), /AYA_OCR_MODEL/);
});
