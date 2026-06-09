import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OcrResultSchema, buildOcrSystemPrompt } from './ocr.js';

test('accepts status "ok" with transcribed fullText', () => {
  const r = OcrResultSchema.parse({ status: 'ok', fullText: '他好。\n第二行' });
  assert.equal(r.status, 'ok');
  assert.equal(r.fullText, '他好。\n第二行');
});

test('accepts status "unreadable" with empty fullText', () => {
  const r = OcrResultSchema.parse({ status: 'unreadable', fullText: '' });
  assert.equal(r.status, 'unreadable');
  assert.equal(r.fullText, '');
});

test('accepts status "no_chinese_text" with empty fullText', () => {
  const r = OcrResultSchema.parse({ status: 'no_chinese_text', fullText: '' });
  assert.equal(r.status, 'no_chinese_text');
});

test('rejects non-ok status carrying non-empty fullText', () => {
  const r = OcrResultSchema.safeParse({ status: 'unreadable', fullText: 'x' });
  assert.equal(r.success, false);
});

test('rejects an unknown status value', () => {
  const r = OcrResultSchema.safeParse({ status: 'maybe', fullText: '' });
  assert.equal(r.success, false);
});

test('rejects a missing fullText field', () => {
  const r = OcrResultSchema.safeParse({ status: 'ok' });
  assert.equal(r.success, false);
});

test('OCR prompt encodes the required intent', () => {
  const p = buildOcrSystemPrompt().toLowerCase();
  assert.match(p, /simplified-chinese/);
  assert.match(p, /line break/);
  assert.match(p, /punctuation/);
  assert.match(p, /not translate/);
  assert.match(p, /unreadable/);
  assert.match(p, /no_chinese_text/);
});
