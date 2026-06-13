import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMetrics,
  compareToBaseline,
  loadBaseline,
  BaselineSchema,
  type Baseline,
} from './report.js';
import type { EvalReport } from './run-evals.js';

// A fully-populated report with healthy metrics — every stage "ran".
function healthyReport(overrides: Partial<EvalReport> = {}): EvalReport {
  const base: EvalReport = {
    ocr: {
      rows: [{ id: 'o1', charAccuracy: 0.98, statusMatch: true }],
      meanCharAccuracy: 0.98,
      statusAccuracy: 1,
      accuracyTarget: 0.95,
      belowTarget: [],
    },
    analysis: {
      rows: [
        {
          id: 'a1',
          boundaryF1: 0.95,
          idiomSplits: 0,
          reconstructionOk: true,
          passed: true,
          pinyinScored: 3,
          pinyinMismatches: 0,
          pinyinPolyphoneExceptions: 0,
        },
      ],
      meanBoundaryF1: 0.95,
      totalIdiomSplits: 0,
      reconstructionPassRate: 1,
      pinyinScored: 3,
      pinyinMismatches: 0,
      pinyinMismatchRate: 0,
    },
    translation: {
      exampleCount: 1,
      rows: [
        {
          id: 't1',
          faithfulness: 5,
          contextualCorrectness: 5,
          fluency: 5,
          pass: true,
        },
      ],
      passRate: 1,
      threshold: 4,
      scoreDistribution: {
        faithfulness: 5,
        contextualCorrectness: 5,
        fluency: 5,
      },
    },
    langsmith: { enabled: false, registered: false },
  };
  return { ...base, ...overrides };
}

test('extractMetrics: pulls the six headline metrics from a populated report', () => {
  const m = extractMetrics(healthyReport());
  assert.equal(m.ocrMeanCharAccuracy, 0.98);
  assert.equal(m.analysisMeanBoundaryF1, 0.95);
  assert.equal(m.analysisTotalIdiomSplits, 0);
  assert.equal(m.analysisPinyinMismatchRate, 0);
  assert.equal(m.analysisReconstructionPassRate, 1);
  assert.equal(m.translationPassRate, 1);
  assert.deepEqual(m.translationScoreDistribution, {
    faithfulness: 5,
    contextualCorrectness: 5,
    fluency: 5,
  });
});

test('extractMetrics: skipped stages (no rows) become null', () => {
  const report = healthyReport({
    ocr: {
      rows: [],
      meanCharAccuracy: 0,
      statusAccuracy: 0,
      accuracyTarget: 0.95,
      belowTarget: [],
    },
    analysis: {
      rows: [],
      meanBoundaryF1: 0,
      totalIdiomSplits: 0,
      reconstructionPassRate: 0,
      pinyinScored: 0,
      pinyinMismatches: 0,
      pinyinMismatchRate: 0,
    },
    translation: {
      exampleCount: 5,
      rows: [],
      passRate: 0,
      threshold: 4,
      scoreDistribution: { faithfulness: 0, contextualCorrectness: 0, fluency: 0 },
    },
  });
  const m = extractMetrics(report);
  assert.equal(m.ocrMeanCharAccuracy, null);
  assert.equal(m.analysisMeanBoundaryF1, null);
  assert.equal(m.translationPassRate, null);
  assert.equal(m.translationScoreDistribution, null);
});

// A baseline matching the healthy report's values, with realistic gates.
function testBaseline(): Baseline {
  return {
    metrics: {
      ocrMeanCharAccuracy: 0.98,
      analysisMeanBoundaryF1: 0.95,
      analysisTotalIdiomSplits: 0,
      analysisPinyinMismatchRate: 0,
      analysisReconstructionPassRate: 1,
      translationPassRate: 1,
      translationScoreDistribution: {
        faithfulness: 5,
        contextualCorrectness: 5,
        fluency: 5,
      },
    },
    gates: {
      ocrMeanCharAccuracy: { direction: 'higher', tolerance: 0.02, threshold: 0.95 },
      analysisMeanBoundaryF1: { direction: 'higher', tolerance: 0.03 },
      analysisTotalIdiomSplits: { direction: 'lower', tolerance: 0, threshold: 0 },
      analysisPinyinMismatchRate: { direction: 'lower', tolerance: 0.02 },
      analysisReconstructionPassRate: {
        direction: 'higher',
        tolerance: 0,
        threshold: 1,
      },
      translationPassRate: { direction: 'higher', tolerance: 0.1 },
      translationScoreDistribution: { direction: 'higher', tolerance: 0.5 },
    },
  };
}

test('compareToBaseline: a healthy run passes with no findings', () => {
  const cmp = compareToBaseline(extractMetrics(healthyReport()), testBaseline());
  assert.equal(cmp.ok, true);
  assert.equal(cmp.findings.length, 0);
  assert.equal(cmp.skipped.length, 0);
});

test('compareToBaseline: a small in-tolerance drop still passes', () => {
  // boundary F1 drops 0.02 (< 0.03 tolerance), OCR drops 0.01 (< 0.02).
  const report = healthyReport();
  report.ocr.meanCharAccuracy = 0.97;
  report.analysis.meanBoundaryF1 = 0.93;
  const cmp = compareToBaseline(extractMetrics(report), testBaseline());
  assert.equal(cmp.ok, true);
});

test('compareToBaseline: a regression beyond tolerance fails', () => {
  const report = healthyReport();
  report.analysis.meanBoundaryF1 = 0.9; // 0.05 drop > 0.03 tolerance
  const cmp = compareToBaseline(extractMetrics(report), testBaseline());
  assert.equal(cmp.ok, false);
  const f = cmp.findings.find((x) => x.metric === 'analysisMeanBoundaryF1');
  assert.ok(f, 'boundary F1 regression reported');
  assert.equal(f.kind, 'regression');
});

test('compareToBaseline: a "lower is better" metric rising beyond tolerance fails', () => {
  const report = healthyReport();
  report.analysis.pinyinMismatchRate = 0.05; // rose 0.05 > 0.02 tolerance
  const cmp = compareToBaseline(extractMetrics(report), testBaseline());
  assert.equal(cmp.ok, false);
  assert.ok(cmp.findings.some((x) => x.metric === 'analysisPinyinMismatchRate'));
});

test('compareToBaseline: an absolute threshold breach fails even within tolerance', () => {
  const report = healthyReport();
  // OCR 0.945 is within 0.02 of baseline 0.98? No (0.035), so it regresses too;
  // make baseline equal current to isolate the threshold: floor is 0.95.
  report.ocr.meanCharAccuracy = 0.945;
  const baseline = testBaseline();
  baseline.metrics.ocrMeanCharAccuracy = 0.945; // no regression
  const cmp = compareToBaseline(extractMetrics(report), baseline);
  assert.equal(cmp.ok, false);
  const f = cmp.findings.find((x) => x.metric === 'ocrMeanCharAccuracy');
  assert.ok(f);
  assert.equal(f.kind, 'threshold');
});

test('compareToBaseline: idiom split ceiling of 0 is a hard fail', () => {
  const report = healthyReport();
  report.analysis.totalIdiomSplits = 1;
  const cmp = compareToBaseline(extractMetrics(report), testBaseline());
  assert.equal(cmp.ok, false);
  const f = cmp.findings.find((x) => x.metric === 'analysisTotalIdiomSplits');
  assert.ok(f);
  assert.equal(f.kind, 'threshold');
});

test('compareToBaseline: reconstruction below 1.0 is a hard fail', () => {
  const report = healthyReport();
  report.analysis.reconstructionPassRate = 0.5;
  const cmp = compareToBaseline(extractMetrics(report), testBaseline());
  assert.equal(cmp.ok, false);
  assert.ok(
    cmp.findings.some(
      (x) => x.metric === 'analysisReconstructionPassRate' && x.kind === 'threshold',
    ),
  );
});

test('compareToBaseline: a judge dimension dropping beyond tolerance fails', () => {
  const report = healthyReport();
  report.translation.scoreDistribution.fluency = 4.4; // 0.6 drop > 0.5 tolerance
  const cmp = compareToBaseline(extractMetrics(report), testBaseline());
  assert.equal(cmp.ok, false);
  assert.ok(
    cmp.findings.some((x) => x.metric === 'translationScoreDistribution.fluency'),
  );
});

test('compareToBaseline: skipped stages are recorded, not failed', () => {
  const report = healthyReport({
    ocr: {
      rows: [],
      meanCharAccuracy: 0,
      statusAccuracy: 0,
      accuracyTarget: 0.95,
      belowTarget: [],
    },
  });
  const cmp = compareToBaseline(extractMetrics(report), testBaseline());
  assert.equal(cmp.ok, true);
  assert.ok(cmp.skipped.includes('ocrMeanCharAccuracy'));
});

test('loadBaseline: the stored baseline.json is valid and gates idiom splits at 0', async () => {
  const baseline = await loadBaseline();
  // Re-validate to be explicit the on-disk file matches the schema.
  BaselineSchema.parse(baseline);
  assert.equal(baseline.gates.analysisTotalIdiomSplits.threshold, 0);
  assert.equal(baseline.gates.analysisReconstructionPassRate.threshold, 1);
});
