import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadLlmConfig,
  hasModelCredentials,
  OCR_MAX_TOKENS,
  ANALYSIS_MAX_TOKENS,
  type Env,
} from './config.js';

const anthropicEnv: Env = {
  AYA_LLM_PROVIDER: 'anthropic',
  AYA_OCR_MODEL: 'test-ocr-model',
  AYA_ANALYSIS_MODEL: 'test-analysis-model',
  ANTHROPIC_API_KEY: 'sk-test-key',
};

test('resolves Anthropic config: temperature 0, key folded in, temperature not sent', () => {
  const cfg = loadLlmConfig(anthropicEnv);
  assert.deepEqual(cfg.ocr, {
    provider: 'anthropic',
    model: 'test-ocr-model',
    temperature: 0,
    maxTokens: OCR_MAX_TOKENS,
    apiKey: 'sk-test-key',
    sendTemperature: false,
    maxTokensField: 'maxTokens',
  });
  assert.deepEqual(cfg.analysis, {
    provider: 'anthropic',
    model: 'test-analysis-model',
    temperature: 0,
    maxTokens: ANALYSIS_MAX_TOKENS,
    apiKey: 'sk-test-key',
    sendTemperature: false,
    maxTokensField: 'maxTokens',
  });
});

test('resolves Gemini config: GOOGLE_API_KEY, sends temperature, maxOutputTokens field', () => {
  const cfg = loadLlmConfig({
    AYA_LLM_PROVIDER: 'google-genai',
    AYA_OCR_MODEL: 'gemini-ocr',
    AYA_ANALYSIS_MODEL: 'gemini-analysis',
    GOOGLE_API_KEY: 'g-key',
  });
  assert.equal(cfg.ocr.provider, 'google-genai');
  assert.equal(cfg.ocr.apiKey, 'g-key');
  assert.equal(cfg.ocr.sendTemperature, true);
  assert.equal(cfg.ocr.maxTokensField, 'maxOutputTokens');
});

test('resolves OpenAI config from OPENAI_API_KEY', () => {
  const cfg = loadLlmConfig({
    AYA_LLM_PROVIDER: 'openai',
    AYA_OCR_MODEL: 'gpt-ocr',
    AYA_ANALYSIS_MODEL: 'gpt-analysis',
    OPENAI_API_KEY: 'o-key',
  });
  assert.equal(cfg.analysis.provider, 'openai');
  assert.equal(cfg.analysis.apiKey, 'o-key');
  assert.equal(cfg.analysis.sendTemperature, true);
  assert.equal(cfg.analysis.maxTokensField, 'maxTokens');
});

test('per-stage provider override lets one run mix providers across stages', () => {
  const cfg = loadLlmConfig({
    AYA_LLM_PROVIDER: 'anthropic',
    AYA_ANALYSIS_PROVIDER: 'google-genai',
    AYA_OCR_MODEL: 'claude-ocr',
    AYA_ANALYSIS_MODEL: 'gemini-analysis',
    ANTHROPIC_API_KEY: 'sk-test',
    GOOGLE_API_KEY: 'g-key',
  });
  assert.equal(cfg.ocr.provider, 'anthropic');
  assert.equal(cfg.ocr.apiKey, 'sk-test');
  assert.equal(cfg.analysis.provider, 'google-genai');
  assert.equal(cfg.analysis.apiKey, 'g-key');
});

test('throws a clear error when the provider is missing', () => {
  const env: Env = { ...anthropicEnv, AYA_LLM_PROVIDER: undefined };
  assert.throws(() => loadLlmConfig(env), /AYA_LLM_PROVIDER/);
});

test('throws a clear error listing supported providers on an unknown provider', () => {
  const env: Env = { ...anthropicEnv, AYA_LLM_PROVIDER: 'gemini' };
  assert.throws(() => loadLlmConfig(env), /Unsupported LLM provider/);
});

test('throws when the OCR model id is missing', () => {
  const env: Env = { ...anthropicEnv, AYA_OCR_MODEL: undefined };
  assert.throws(() => loadLlmConfig(env), /AYA_OCR_MODEL/);
});

test('throws when the analysis model id is missing', () => {
  const env: Env = { ...anthropicEnv, AYA_ANALYSIS_MODEL: undefined };
  assert.throws(() => loadLlmConfig(env), /AYA_ANALYSIS_MODEL/);
});

test("throws on the selected provider's missing API key", () => {
  const env: Env = { ...anthropicEnv, ANTHROPIC_API_KEY: undefined };
  assert.throws(() => loadLlmConfig(env), /ANTHROPIC_API_KEY/);
});

test('treats blank/whitespace-only values as missing', () => {
  const env: Env = { ...anthropicEnv, AYA_OCR_MODEL: '   ' };
  assert.throws(() => loadLlmConfig(env), /AYA_OCR_MODEL/);
});

test('hasModelCredentials: true when the selected provider key is present', () => {
  assert.equal(hasModelCredentials(anthropicEnv), true);
  assert.equal(
    hasModelCredentials({ AYA_LLM_PROVIDER: 'google-genai', GOOGLE_API_KEY: 'g' }),
    true,
  );
});

test('hasModelCredentials: false when provider unset, unknown, or key missing', () => {
  assert.equal(hasModelCredentials({}), false);
  assert.equal(hasModelCredentials({ AYA_LLM_PROVIDER: 'gemini' }), false);
  assert.equal(hasModelCredentials({ AYA_LLM_PROVIDER: 'anthropic' }), false);
});

test('hasModelCredentials: explicit provider arg overrides AYA_LLM_PROVIDER', () => {
  const env: Env = { AYA_LLM_PROVIDER: 'anthropic', OPENAI_API_KEY: 'o' };
  assert.equal(hasModelCredentials(env, 'openai'), true);
  assert.equal(hasModelCredentials(env, 'anthropic'), false);
});
