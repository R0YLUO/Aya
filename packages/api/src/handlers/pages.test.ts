import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnalyzedPageSchema, type Phrase } from '@aya/shared';
import { ApiError } from '../errors.js';
import {
  makeScanHandler,
  type AnalysisStageResult,
  type OcrStageResult,
  type ScanHandlerDeps,
  type ScanImageInput,
} from './pages.js';

const FULL_TEXT = '春眠不觉晓';

/** Phrases that reconstruct FULL_TEXT exactly (satisfies the invariant). */
function goodPhrases(pageId: string): Phrase[] {
  return [
    {
      id: 'p1',
      pageId,
      index: 1,
      original: '春眠',
      pinyin: 'chūn mián',
      translation: 'spring sleep',
      contextualMeaning: 'sleeping in spring',
    },
    {
      id: 'p2',
      pageId,
      index: 2,
      original: '不觉晓',
      pinyin: 'bù jué xiǎo',
      translation: 'unaware of dawn',
      contextualMeaning: 'not noticing daybreak',
    },
  ];
}

interface Calls {
  fetchImage: number;
  runOcr: number;
  analyzeText: number;
}

type LogLine = Record<string, unknown>;

/** Read the single emitted log line, asserting exactly one was emitted. */
function onlyLog(logs: LogLine[]): LogLine {
  assert.equal(logs.length, 1, 'exactly one page_scanned line');
  const line = logs[0];
  assert.ok(line);
  return line;
}

/**
 * Build a handler with fully mocked deps. The handler takes NO repository — so
 * "no persistence" is structural; tests additionally assert that only the two
 * LLM calls + the image fetch ever run on the happy path.
 */
function makeHarness(
  overrides: {
    ocr?: OcrStageResult;
    ocrError?: Error;
    analysis?: AnalysisStageResult;
    analyzeError?: Error;
    fetchError?: Error;
  } = {},
): { handler: ReturnType<typeof makeScanHandler>; calls: Calls; logs: LogLine[] } {
  const calls: Calls = { fetchImage: 0, runOcr: 0, analyzeText: 0 };
  const logs: LogLine[] = [];
  const image: ScanImageInput = { data: new Uint8Array([1, 2, 3]), mediaType: 'image/jpeg' };

  let tick = 0;
  const deps: ScanHandlerDeps = {
    fetchImage: async () => {
      calls.fetchImage += 1;
      if (overrides.fetchError) throw overrides.fetchError;
      return image;
    },
    runOcr: async (_img, _pageId) => {
      calls.runOcr += 1;
      if (overrides.ocrError) throw overrides.ocrError;
      return (
        overrides.ocr ?? {
          status: 'ok',
          fullText: FULL_TEXT,
          tokens: { input: 100, output: 20 },
        }
      );
    },
    analyzeText: async (_text, pageId) => {
      calls.analyzeText += 1;
      if (overrides.analyzeError) throw overrides.analyzeError;
      return (
        overrides.analysis ?? {
          phrases: goodPhrases(pageId),
          tokens: { input: 200, output: 80 },
        }
      );
    },
    log: (line) => logs.push(line),
    // Deterministic, monotonic clock so latency fields are stable and ordered.
    clock: () => (tick += 10),
    now: () => new Date('2026-06-11T00:00:00.000Z'),
  };

  return { handler: makeScanHandler(deps), calls, logs };
}

test('happy path: 200 with a valid AnalyzedPage, reconstruction holds, nothing persisted', async () => {
  const { handler, calls, logs } = makeHarness();

  const res = await handler({ body: { imageKey: 'uploads/2026/06/11/abc.jpg' } });

  assert.equal(res.statusCode, 200);
  const parsed = AnalyzedPageSchema.safeParse(res.body);
  assert.equal(parsed.success, true, 'response is a valid AnalyzedPage (incl. reconstruction)');
  assert.equal(res.body.page.fullText, FULL_TEXT);
  assert.equal(res.body.page.createdAt, '2026-06-11T00:00:00.000Z');
  assert.equal(res.body.phrases.length, 2);

  // Exactly the two LLM calls + one image fetch; no repo dependency exists at all.
  assert.deepEqual(calls, { fetchImage: 1, runOcr: 1, analyzeText: 1 });

  // One page_scanned log line with all required fields and outcome ok.
  const line = onlyLog(logs);
  assert.equal(line['event'], 'page_scanned');
  assert.equal(line['outcome'], 'ok');
  assert.equal(line['ocrStatus'], 'ok');
  assert.equal(line['phraseCount'], 2);
  assert.equal(typeof line['ocrLatencyMs'], 'number');
  assert.equal(typeof line['analysisLatencyMs'], 'number');
  assert.equal(typeof line['totalLatencyMs'], 'number');
  assert.deepEqual(line['ocrTokens'], { input: 100, output: 20 });
  assert.deepEqual(line['analysisTokens'], { input: 200, output: 80 });
});

test('invalid body -> validation_error (400), no LLM calls', async () => {
  const { handler, calls, logs } = makeHarness();
  await assert.rejects(
    () => Promise.resolve(handler({ body: { notImageKey: 'x' } })),
    (err: unknown) =>
      err instanceof ApiError && err.code === 'validation_error' && err.statusCode === 400,
  );
  assert.deepEqual(calls, { fetchImage: 0, runOcr: 0, analyzeText: 0 });
  assert.equal(logs.length, 0, 'no scan log before a pageId/fetch even starts');
});

test('missing/expired image key -> image_not_found (404) propagated from fetchImage', async () => {
  const { handler, calls } = makeHarness({
    fetchError: new ApiError('image_not_found', undefined, { imageKey: 'gone.jpg' }),
  });
  await assert.rejects(
    () => Promise.resolve(handler({ body: { imageKey: 'gone.jpg' } })),
    (err: unknown) =>
      err instanceof ApiError && err.code === 'image_not_found' && err.statusCode === 404,
  );
  assert.equal(calls.runOcr, 0);
  assert.equal(calls.analyzeText, 0);
});

test('OCR unreadable -> image_unreadable (422), logs outcome, skips analysis', async () => {
  const { handler, calls, logs } = makeHarness({
    ocr: { status: 'unreadable', fullText: '', tokens: { input: 50, output: 5 } },
  });
  await assert.rejects(
    () => Promise.resolve(handler({ body: { imageKey: 'k.jpg' } })),
    (err: unknown) =>
      err instanceof ApiError && err.code === 'image_unreadable' && err.statusCode === 422,
  );
  assert.equal(calls.analyzeText, 0, 'no second LLM call when OCR fails');
  const line = onlyLog(logs);
  assert.equal(line['outcome'], 'image_unreadable');
  assert.equal(line['ocrStatus'], 'unreadable');
});

test('OCR no_chinese_text -> no_chinese_text (422), logs outcome, skips analysis', async () => {
  const { handler, calls, logs } = makeHarness({
    ocr: { status: 'no_chinese_text', fullText: '', tokens: null },
  });
  await assert.rejects(
    () => Promise.resolve(handler({ body: { imageKey: 'k.jpg' } })),
    (err: unknown) =>
      err instanceof ApiError && err.code === 'no_chinese_text' && err.statusCode === 422,
  );
  assert.equal(calls.analyzeText, 0);
  const line = onlyLog(logs);
  assert.equal(line['outcome'], 'no_chinese_text');
});

test('analysis throws -> analysis_failed (502), logs outcome', async () => {
  const { handler, logs } = makeHarness({ analyzeError: new Error('reconstruction mismatch') });
  await assert.rejects(
    () => Promise.resolve(handler({ body: { imageKey: 'k.jpg' } })),
    (err: unknown) =>
      err instanceof ApiError && err.code === 'analysis_failed' && err.statusCode === 502,
  );
  const line = onlyLog(logs);
  assert.equal(line['outcome'], 'analysis_failed');
  assert.equal(line['ocrStatus'], 'ok');
});

test('analysis returns a malformed phrase (bad index) -> analysis_failed (502) via response validation', async () => {
  // The shared schema rejects this (index must be a positive 1-based int), so the
  // handler maps an unparseable analysis result to analysis_failed rather than 500.
  const { handler, logs } = makeHarness({
    analysis: {
      phrases: [
        {
          id: 'p1',
          pageId: 'x',
          index: 0,
          original: '完全不同的文本',
          pinyin: 'x',
          translation: 'x',
          contextualMeaning: 'x',
        },
      ],
      tokens: null,
    },
  });
  await assert.rejects(
    () => Promise.resolve(handler({ body: { imageKey: 'k.jpg' } })),
    (err: unknown) =>
      err instanceof ApiError && err.code === 'analysis_failed' && err.statusCode === 502,
  );
  const line = onlyLog(logs);
  assert.equal(line['outcome'], 'analysis_failed');
});
