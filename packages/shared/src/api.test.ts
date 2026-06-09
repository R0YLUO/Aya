import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ErrorCodeSchema,
  ErrorEnvelopeSchema,
  UploadRequestSchema,
  UploadResponseSchema,
  ScanRequestSchema,
  ScanResponseSchema,
  ShareRequestSchema,
  ShareResponseSchema,
  ShareResolveResponseSchema,
  HealthResponseSchema,
} from './api.js';

const PAGE_ID = '0f2e0000-0000-4000-8000-000000000000';

const examplePage = {
  id: PAGE_ID,
  fullText: '他三天打鱼两天晒网，怎么可能学好中文？',
  createdAt: '2026-06-08T10:12:00.000Z',
};

const examplePhrases = [
  {
    id: 'p1',
    pageId: PAGE_ID,
    index: 1,
    original: '他',
    pinyin: 'tā',
    translation: 'he',
    contextualMeaning: 'the person being described',
  },
  {
    id: 'p2',
    pageId: PAGE_ID,
    index: 2,
    original: '三天打鱼两天晒网',
    pinyin: 'sān tiān dǎ yú liǎng tiān shài wǎng',
    translation: 'to work in fits and starts (idiom)',
    contextualMeaning: 'here: lacking the discipline to study consistently',
  },
  {
    id: 'p3',
    pageId: PAGE_ID,
    index: 3,
    original: '，',
    pinyin: null,
    translation: null,
    contextualMeaning: null,
  },
];

test('UploadRequest parses (with and without contentType)', () => {
  assert.equal(UploadRequestSchema.safeParse({ contentType: 'image/jpeg' }).success, true);
  assert.equal(UploadRequestSchema.safeParse({}).success, true);
});

test('UploadResponse example parses', () => {
  const ok = UploadResponseSchema.safeParse({
    uploadUrl: 'https://aya-uploads-dev.s3...&X-Amz-Signature=...',
    imageKey: 'uploads/2026/06/08/9b1c....jpg',
    expiresInSeconds: 300,
  });
  assert.equal(ok.success, true);
});

test('ScanRequest example parses', () => {
  assert.equal(
    ScanRequestSchema.safeParse({ imageKey: 'uploads/2026/06/08/9b1c....jpg' }).success,
    true,
  );
});

test('ScanResponse (AnalyzedPage) example parses', () => {
  const r = ScanResponseSchema.safeParse({ page: examplePage, phrases: examplePhrases });
  assert.equal(r.success, true);
});

test('ShareRequest example parses', () => {
  const r = ShareRequestSchema.safeParse({ page: examplePage, phrases: examplePhrases });
  assert.equal(r.success, true);
});

test('ShareResponse example parses', () => {
  const r = ShareResponseSchema.safeParse({
    code: 'k7Qm2pX9',
    url: 'https://aya.app/s/k7Qm2pX9',
    pageId: PAGE_ID,
  });
  assert.equal(r.success, true);
});

test('ShareResolveResponse (AnalyzedPage) example parses', () => {
  const r = ShareResolveResponseSchema.safeParse({
    page: examplePage,
    phrases: examplePhrases,
  });
  assert.equal(r.success, true);
});

test('HealthResponse example parses', () => {
  assert.equal(HealthResponseSchema.safeParse({ status: 'ok', version: '0.1.0' }).success, true);
});

test('ErrorEnvelope example parses (with and without details)', () => {
  assert.equal(
    ErrorEnvelopeSchema.safeParse({
      error: { code: 'image_unreadable', message: 'Photo unclear, please retake.', details: {} },
    }).success,
    true,
  );
  assert.equal(
    ErrorEnvelopeSchema.safeParse({
      error: { code: 'share_not_found', message: 'Not found.' },
    }).success,
    true,
  );
});

test('ErrorCode enum includes every PRD code and rejects unknowns', () => {
  for (const code of [
    'image_unreadable',
    'no_chinese_text',
    'image_not_found',
    'analysis_failed',
    'validation_error',
    'share_not_found',
  ]) {
    assert.equal(ErrorCodeSchema.safeParse(code).success, true, code);
  }
  assert.equal(ErrorCodeSchema.safeParse('teapot').success, false);
});

test('ErrorEnvelope rejects an unknown error code', () => {
  const r = ErrorEnvelopeSchema.safeParse({
    error: { code: 'kaboom', message: 'x' },
  });
  assert.equal(r.success, false);
});
