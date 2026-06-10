import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOcr, buildOcrMessages, type OcrImageInput } from './run-ocr.js';
import { withRetry } from './model.js';
import type { OcrResult } from './ocr.js';
import type { StructuredRunner } from './model.js';

const URL_IMAGE: OcrImageInput = { kind: 'url', url: 'https://s3/x.png' };

/** A runner that returns a fixed result and counts invocations. */
function fixedRunner(result: OcrResult): StructuredRunner<OcrResult> & { calls: number } {
  return {
    calls: 0,
    async invoke() {
      this.calls += 1;
      return result;
    },
  };
}

/** A runner that throws a transient error N-1 times, then returns the result. */
function flakyRunner(
  failures: number,
  result: OcrResult,
): StructuredRunner<OcrResult> & { calls: number } {
  return {
    calls: 0,
    async invoke() {
      this.calls += 1;
      if (this.calls <= failures) throw new Error('ECONNRESET transient');
      return result;
    },
  };
}

const noSleep = (_ms: number): Promise<void> => Promise.resolve();

test('returns ok + fullText for a good response', async () => {
  const runner = fixedRunner({ status: 'ok', fullText: '他好。' });
  const r = await runOcr(URL_IMAGE, { runner });
  assert.deepEqual(r, { status: 'ok', fullText: '他好。' });
  assert.equal(runner.calls, 1);
});

test('faithfully returns unreadable status', async () => {
  const runner = fixedRunner({ status: 'unreadable', fullText: '' });
  const r = await runOcr(URL_IMAGE, { runner });
  assert.equal(r.status, 'unreadable');
});

test('faithfully returns no_chinese_text status', async () => {
  const runner = fixedRunner({ status: 'no_chinese_text', fullText: '' });
  const r = await runOcr(URL_IMAGE, { runner });
  assert.equal(r.status, 'no_chinese_text');
});

test('retries a transient failure then succeeds', async () => {
  const runner = flakyRunner(2, { status: 'ok', fullText: 'X' });
  const r = await runOcr(URL_IMAGE, {
    runner,
    retry: { maxAttempts: 3, baseDelayMs: 0, sleep: noSleep },
  });
  assert.equal(r.fullText, 'X');
  assert.equal(runner.calls, 3);
});

test('throws after exhausting retries on persistent transient failure', async () => {
  const runner = flakyRunner(99, { status: 'ok', fullText: 'X' });
  await assert.rejects(
    runOcr(URL_IMAGE, {
      runner,
      retry: { maxAttempts: 3, baseDelayMs: 0, sleep: noSleep },
    }),
    /transient/,
  );
  assert.equal(runner.calls, 3);
});

test('buildOcrMessages includes the image (bytes -> base64 block) and a text part', () => {
  const msgs = buildOcrMessages({
    kind: 'bytes',
    data: new Uint8Array([1, 2, 3]),
    mediaType: 'image/png',
  });
  assert.equal(msgs.length, 2);
  const human = msgs[1] as { content: Array<Record<string, unknown>> };
  const img = human.content[0] as { type: string; data: string; mimeType: string };
  assert.equal(img.type, 'image');
  assert.equal(img.mimeType, 'image/png');
  assert.equal(img.data, Buffer.from([1, 2, 3]).toString('base64'));
});

test('withRetry honours a non-retryable predicate (no retries)', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw new Error('fatal');
      },
      { maxAttempts: 5, baseDelayMs: 0, sleep: noSleep, isRetryable: () => false },
    ),
    /fatal/,
  );
  assert.equal(calls, 1);
});
