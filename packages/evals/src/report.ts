// Aggregate eval report + baseline comparison (specs/06-evals.md "Reporting").
//
// An eval run summarises the SIX headline metrics — CER (OCR char accuracy),
// boundary F1, idiom-split count, pinyin mismatch rate, judge score distribution,
// and reconstruction pass rate — and compares them against a stored baseline
// (`datasets/baseline.json`). The run fails (exit non-zero) when any metric
// regresses beyond its configured tolerance OR falls below an absolute threshold;
// it passes otherwise. This is the CI gate that enforces "no prompt change without
// an eval" (CLAUDE.md golden rule #2 / north star "Accurate").
//
// The comparison is intentionally tolerant of stages that were SKIPPED in a run
// (no Anthropic key locally): a skipped stage is neither compared nor counted as
// a regression — only stages that actually produced rows are gated. This keeps
// `npm run eval` green offline while still gating real runs in CI.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { findDatasetsDir } from './datasets.js';
import type { EvalReport, JudgeScoreDistribution } from './run-evals.js';

/**
 * The six headline metrics, flattened from an {@link EvalReport}. Each is
 * `null` when its stage was skipped (no model output), so a baseline never
 * forces a stage to have run.
 */
export interface EvalMetrics {
  /** Mean OCR character accuracy (1 - CER). Higher is better. */
  ocrMeanCharAccuracy: number | null;
  /** Mean segmentation boundary F1. Higher is better. */
  analysisMeanBoundaryF1: number | null;
  /** Total idioms the model split across the analysis set. Lower is better; 0 ideal. */
  analysisTotalIdiomSplits: number | null;
  /** Pinyin mismatch rate over scorable tokens. Lower is better. */
  analysisPinyinMismatchRate: number | null;
  /** Reconstruction pass rate across analysis examples. Higher is better; 1 ideal. */
  analysisReconstructionPassRate: number | null;
  /** Judge pass rate (all dimensions >= threshold). Higher is better. */
  translationPassRate: number | null;
  /** Judge score distribution (mean per rubric dimension). Higher is better. */
  translationScoreDistribution: JudgeScoreDistribution | null;
}

/** Pull the six headline metrics out of a full report; skipped stages → null. */
export function extractMetrics(report: EvalReport): EvalMetrics {
  const ocrRan = report.ocr.rows.length > 0;
  const analysisRan = report.analysis.rows.length > 0;
  const translationRan = report.translation.rows.length > 0;
  return {
    ocrMeanCharAccuracy: ocrRan ? report.ocr.meanCharAccuracy : null,
    analysisMeanBoundaryF1: analysisRan ? report.analysis.meanBoundaryF1 : null,
    analysisTotalIdiomSplits: analysisRan ? report.analysis.totalIdiomSplits : null,
    analysisPinyinMismatchRate: analysisRan
      ? report.analysis.pinyinMismatchRate
      : null,
    analysisReconstructionPassRate: analysisRan
      ? report.analysis.reconstructionPassRate
      : null,
    translationPassRate: translationRan ? report.translation.passRate : null,
    translationScoreDistribution: translationRan
      ? report.translation.scoreDistribution
      : null,
  };
}

/**
 * Which direction is an improvement for a metric. `higher` metrics (accuracy,
 * F1, pass rate) regress when they DROP below baseline; `lower` metrics
 * (idiom splits, mismatch rate) regress when they RISE above baseline.
 */
export type MetricDirection = 'higher' | 'lower';

// Baseline = recorded metric values + per-metric gate config. Stored as
// `datasets/baseline.json` and loaded by the runner. The judge score distribution
// is gated per dimension with one shared gate. The type is inferred from
// `BaselineSchema` below (the single source of truth — validated on load).

/**
 * Per-metric gate config. `tolerance` is the allowed slack vs the baseline before
 * a move counts as a regression (absolute, in the metric's own units). `threshold`
 * (optional) is an absolute floor (for `higher` metrics) or ceiling (for `lower`
 * metrics) the metric must satisfy regardless of the baseline.
 */
const MetricGateSchema = z.object({
  direction: z.enum(['higher', 'lower']),
  tolerance: z.number().min(0),
  threshold: z.number().optional(),
});

export type MetricGate = z.infer<typeof MetricGateSchema>;

const JudgeScoreDistributionSchema = z.object({
  faithfulness: z.number(),
  contextualCorrectness: z.number(),
  fluency: z.number(),
});

export const BaselineSchema = z.object({
  description: z.string().optional(),
  metrics: z.object({
    ocrMeanCharAccuracy: z.number().optional(),
    analysisMeanBoundaryF1: z.number().optional(),
    analysisTotalIdiomSplits: z.number().optional(),
    analysisPinyinMismatchRate: z.number().optional(),
    analysisReconstructionPassRate: z.number().optional(),
    translationPassRate: z.number().optional(),
    translationScoreDistribution: JudgeScoreDistributionSchema.optional(),
  }),
  gates: z.object({
    ocrMeanCharAccuracy: MetricGateSchema,
    analysisMeanBoundaryF1: MetricGateSchema,
    analysisTotalIdiomSplits: MetricGateSchema,
    analysisPinyinMismatchRate: MetricGateSchema,
    analysisReconstructionPassRate: MetricGateSchema,
    translationPassRate: MetricGateSchema,
    translationScoreDistribution: MetricGateSchema,
  }),
});

export type Baseline = z.infer<typeof BaselineSchema>;

/**
 * Load and validate the stored baseline. Default path is
 * `datasets/baseline.json` (alongside the versioned dataset fixtures).
 */
export async function loadBaseline(fileName = 'baseline.json'): Promise<Baseline> {
  const root = await findDatasetsDir();
  const raw = JSON.parse(await readFile(join(root, fileName), 'utf8')) as unknown;
  return BaselineSchema.parse(raw);
}

/** A single metric that failed the gate — a regression or a threshold breach. */
export interface MetricFinding {
  /** The metric key (or `dimension.<name>` for a judge dimension). */
  metric: string;
  /** Why it failed. */
  kind: 'regression' | 'threshold';
  current: number;
  /** Baseline value (regression) or the absolute threshold (threshold breach). */
  against: number;
  direction: MetricDirection;
  message: string;
}

/** Outcome of comparing a run's metrics to its baseline. */
export interface BaselineComparison {
  /** True when nothing regressed beyond tolerance and no threshold was breached. */
  ok: boolean;
  /** Every gate failure (regressions and threshold breaches), in metric order. */
  findings: MetricFinding[];
  /** Metrics whose stage was skipped (null) and so were not compared. */
  skipped: string[];
}

/**
 * Check one scalar metric against its baseline value + gate. Returns a finding
 * (or two — regression and/or threshold) when it fails, else an empty array.
 */
function checkScalar(
  metric: string,
  current: number,
  baselineValue: number | undefined,
  gate: MetricGate,
): MetricFinding[] {
  const findings: MetricFinding[] = [];
  const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(4));

  // Absolute threshold floor/ceiling, independent of the baseline.
  if (gate.threshold !== undefined) {
    const breach =
      gate.direction === 'higher'
        ? current < gate.threshold
        : current > gate.threshold;
    if (breach) {
      findings.push({
        metric,
        kind: 'threshold',
        current,
        against: gate.threshold,
        direction: gate.direction,
        message: `${metric} ${fmt(current)} ${
          gate.direction === 'higher' ? 'below floor' : 'above ceiling'
        } ${fmt(gate.threshold)}`,
      });
    }
  }

  // Regression vs the baseline beyond tolerance.
  if (baselineValue !== undefined) {
    const regressed =
      gate.direction === 'higher'
        ? current < baselineValue - gate.tolerance
        : current > baselineValue + gate.tolerance;
    if (regressed) {
      findings.push({
        metric,
        kind: 'regression',
        current,
        against: baselineValue,
        direction: gate.direction,
        message: `${metric} ${fmt(current)} regressed vs baseline ${fmt(
          baselineValue,
        )} (tolerance ${fmt(gate.tolerance)})`,
      });
    }
  }

  return findings;
}

/**
 * Compare a run's metrics to the baseline, gating on regressions beyond tolerance
 * and absolute threshold breaches. Skipped stages (null metric) are recorded in
 * `skipped` and not gated, so an offline run with no model output still passes.
 */
export function compareToBaseline(
  metrics: EvalMetrics,
  baseline: Baseline,
): BaselineComparison {
  const findings: MetricFinding[] = [];
  const skipped: string[] = [];

  const scalarKeys = [
    'ocrMeanCharAccuracy',
    'analysisMeanBoundaryF1',
    'analysisTotalIdiomSplits',
    'analysisPinyinMismatchRate',
    'analysisReconstructionPassRate',
    'translationPassRate',
  ] as const;

  for (const key of scalarKeys) {
    const current = metrics[key];
    if (current === null) {
      skipped.push(key);
      continue;
    }
    findings.push(
      ...checkScalar(key, current, baseline.metrics[key], baseline.gates[key]),
    );
  }

  // Judge score distribution: gate each dimension against the same gate config.
  const dist = metrics.translationScoreDistribution;
  if (dist === null) {
    skipped.push('translationScoreDistribution');
  } else {
    const gate = baseline.gates.translationScoreDistribution;
    const baseDist = baseline.metrics.translationScoreDistribution;
    const dims = ['faithfulness', 'contextualCorrectness', 'fluency'] as const;
    for (const dim of dims) {
      findings.push(
        ...checkScalar(
          `translationScoreDistribution.${dim}`,
          dist[dim],
          baseDist?.[dim],
          gate,
        ),
      );
    }
  }

  return { ok: findings.length === 0, findings, skipped };
}

/** Pretty-print the baseline comparison after the report. */
export function printComparison(comparison: BaselineComparison): void {
  console.log('');
  console.log('Baseline comparison');
  console.log('===================');
  if (comparison.skipped.length > 0) {
    console.log(`Skipped (stage not run): ${comparison.skipped.join(', ')}`);
  }
  if (comparison.ok) {
    console.log('PASS: no metric regressed beyond tolerance or breached a threshold.');
    return;
  }
  console.log(`FAIL: ${comparison.findings.length} metric gate failure(s):`);
  for (const f of comparison.findings) {
    console.log(`  - [${f.kind}] ${f.message}`);
  }
}
