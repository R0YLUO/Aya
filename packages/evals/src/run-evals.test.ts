import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BaseMessageLike } from '@langchain/core/messages';
import type {
  StructuredRunner,
  OcrResult,
  AnalysisResult,
  PhraseToken,
} from '@aya/llm';
import { runEvals } from './run-evals.js';
import { loadOcrDataset, loadAnalysisDataset } from './datasets.js';

// Extract the human text from a message list (last string-ish content).
function humanText(messages: BaseMessageLike[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { content?: unknown } | string;
    const content = typeof m === 'string' ? m : m?.content;
    if (typeof content === 'string') return content;
  }
  return '';
}

test('runEvals: perfect offline run scores 100% with injected runners', async () => {
  const ocrData = await loadOcrDataset();
  const analysisData = await loadAnalysisDataset();

  // OCR stub: return each example's gold, keyed by image identity.
  const byImage = new Map<string, OcrResult>();
  for (const e of ocrData.examples) {
    const key = e.image.kind === 'url' ? e.image.url : e.image.data;
    byImage.set(key, { status: e.expected.status, fullText: e.expected.fullText });
  }
  // The runner can't see the image url directly (it gets messages), so key the
  // stub on call order instead — runEvals maps examples in array order.
  let ocrCall = 0;
  const ocrRunner: StructuredRunner<OcrResult> = {
    async invoke() {
      const e = ocrData.examples[ocrCall++]!;
      return { status: e.expected.status, fullText: e.expected.fullText };
    },
  };

  // Analysis stub: segment fullText exactly per the matching example's gold.
  const analysisRunner: StructuredRunner<AnalysisResult> = {
    async invoke(messages) {
      const text = humanText(messages);
      const ex = analysisData.examples.find((e) => text.startsWith(e.fullText));
      assert.ok(ex, `no analysis fixture matched message: ${text}`);
      const tokens: PhraseToken[] = ex.goldBoundaries.map((original, i) => ({
        index: i + 1,
        original,
        pinyin: ex.goldPinyin[original] ?? null,
        translation: null,
        contextualMeaning: null,
      }));
      return { tokens };
    },
  };

  const report = await runEvals({ ocrRunner, analysisRunner, env: {} });

  assert.equal(report.ocr.rows.length, ocrData.examples.length);
  assert.equal(report.ocr.meanCharAccuracy, 1);
  assert.equal(report.ocr.statusAccuracy, 1);

  assert.equal(report.analysis.rows.length, analysisData.examples.length);
  assert.equal(report.analysis.meanBoundaryF1, 1);
  assert.equal(report.analysis.totalIdiomSplits, 0);
  assert.equal(report.analysis.reconstructionPassRate, 1);
  // The gold pinyin agrees with the library reference, so no mismatches.
  assert.ok(report.analysis.pinyinScored >= 1, 'pinyin tokens were scored');
  assert.equal(report.analysis.pinyinMismatches, 0);
  assert.equal(report.analysis.pinyinMismatchRate, 0);

  assert.ok(report.translation.exampleCount >= 1);

  assert.equal(report.langsmith.enabled, false);
  assert.equal(report.langsmith.registered, false);
});

test('runEvals: skips model stages when no runner and no ANTHROPIC_API_KEY', async () => {
  const report = await runEvals({ env: {} });
  assert.equal(report.ocr.rows.length, 0);
  assert.equal(report.analysis.rows.length, 0);
});

test('runEvals: a split idiom is detected and lowers boundary F1', async () => {
  const analysisData = await loadAnalysisDataset();
  const idiomEx = analysisData.examples.find((e) =>
    e.goldBoundaries.some((t) => t.length >= 4),
  )!;

  const analysisRunner: StructuredRunner<AnalysisResult> = {
    async invoke(messages) {
      const text = humanText(messages);
      const ex = analysisData.examples.find((e) => text.startsWith(e.fullText))!;
      // Split every multi-char token character-by-character (wrong segmentation,
      // still reconstructs the text).
      const tokens: PhraseToken[] = [];
      let index = 1;
      for (const tok of ex.goldBoundaries) {
        for (const ch of [...tok]) {
          tokens.push({
            index: index++,
            original: ch,
            pinyin: null,
            translation: null,
            contextualMeaning: null,
          });
        }
      }
      return { tokens };
    },
  };

  const report = await runEvals({ analysisRunner, env: {} });
  const row = report.analysis.rows.find((r) => r.id === idiomEx.id)!;
  assert.ok(row.idiomSplits >= 1, 'idiom split should be counted');
  assert.ok(row.boundaryF1 < 1, 'boundary F1 should drop on over-segmentation');
  assert.equal(row.reconstructionOk, true, 'over-segmentation still reconstructs');
  assert.equal(row.passed, true, 'a reconstructing example is not auto-failed');
  assert.ok(report.analysis.totalIdiomSplits >= 1);
});

test('runEvals: a reconstruction failure marks the example failed regardless of quality', async () => {
  const analysisData = await loadAnalysisDataset();

  // Runner that drops the last character of fullText — perfect-looking tokens
  // (good pinyin), but tokens.join('') !== fullText, so analyzeText throws and
  // the example must be marked failed independent of any quality score.
  const analysisRunner: StructuredRunner<AnalysisResult> = {
    async invoke(messages) {
      const text = humanText(messages);
      const ex = analysisData.examples.find((e) => text.startsWith(e.fullText))!;
      const tokens: PhraseToken[] = ex.goldBoundaries
        .slice(0, -1) // drop a token → reconstruction can never match
        .map((original, i) => ({
          index: i + 1,
          original,
          pinyin: ex.goldPinyin[original] ?? null,
          translation: null,
          contextualMeaning: null,
        }));
      return { tokens };
    },
  };

  const report = await runEvals({ analysisRunner, env: {} });
  assert.ok(report.analysis.rows.length >= 1);
  for (const row of report.analysis.rows) {
    assert.equal(row.reconstructionOk, false, `${row.id} should fail reconstruction`);
    assert.equal(row.passed, false, `${row.id} should be auto-failed`);
  }
  assert.equal(report.analysis.reconstructionPassRate, 0);
});
