// Side-by-side model comparison — `npm run eval:compare -w packages/evals`.
//
// The whole point of the provider-agnostic LLM layer is being able to answer
// "is Gemini as good as Claude here?" with data. This runs the SAME eval datasets
// and the SAME deterministic + LLM-as-judge scorers (runEvals) against N model
// configurations and prints ONE side-by-side table — identical inputs, fair
// comparison (specs/06-evals.md; CLAUDE.md North Star: Accurate).
//
// Each model config is just a set of env overrides (provider + model ids) merged
// over the ambient environment. API KEYS COME FROM process.env — models.compare.json
// holds no secrets. Offline (no provider credentials) every column reports "skipped",
// exactly like `npm run eval`, so the wiring is verifiable without network.

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { runEvals, type EvalReport, type RunEvalsOptions } from './run-evals.js';

/** One model under comparison: a label plus the env overrides selecting it. */
export interface ModelRunConfig {
  /** Column label, e.g. "claude-sonnet" / "gemini-1.5-pro". */
  label: string;
  /** Env overrides (AYA_LLM_PROVIDER, AYA_*_MODEL, …) merged over the base env. */
  env?: Record<string, string | undefined>;
}

/** A completed run for one model. */
export interface LabeledReport {
  label: string;
  report: EvalReport;
}

/** Options for {@link runEvalsMatrix}: a base env + any injected runners (tests). */
export interface RunEvalsMatrixOptions extends Omit<RunEvalsOptions, 'env'> {
  /** Base environment each config is merged over. Defaults to process.env. */
  baseEnv?: Record<string, string | undefined>;
}

/**
 * Run the eval suite once per model config (sequentially — fair, rate-limit-safe)
 * and return the labelled reports. Shared options (injected runners, versions,
 * thresholds) apply to every run; only the env differs per config.
 */
export async function runEvalsMatrix(
  configs: ModelRunConfig[],
  options: RunEvalsMatrixOptions = {},
): Promise<LabeledReport[]> {
  const { baseEnv = process.env, ...shared } = options;
  const results: LabeledReport[] = [];
  for (const cfg of configs) {
    const env = { ...baseEnv, ...cfg.env };
    const report = await runEvals({ ...shared, env });
    results.push({ label: cfg.label, report });
  }
  return results;
}

/** A row in the comparison table: a metric name + how to read it off a report. */
interface MetricRow {
  label: string;
  /** Returns the formatted cell, or null when the stage was skipped for this model. */
  value: (r: EvalReport) => string | null;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const num = (x: number): string => x.toFixed(2);

const METRIC_ROWS: MetricRow[] = [
  { label: 'OCR char acc', value: (r) => (r.ocr.rows.length ? pct(r.ocr.meanCharAccuracy) : null) },
  { label: 'OCR status acc', value: (r) => (r.ocr.rows.length ? pct(r.ocr.statusAccuracy) : null) },
  {
    label: 'Boundary F1',
    value: (r) => (r.analysis.rows.length ? pct(r.analysis.meanBoundaryF1) : null),
  },
  {
    label: 'Idiom splits',
    value: (r) => (r.analysis.rows.length ? String(r.analysis.totalIdiomSplits) : null),
  },
  {
    label: 'Reconstruction',
    value: (r) => (r.analysis.rows.length ? pct(r.analysis.reconstructionPassRate) : null),
  },
  {
    label: 'Pinyin mismatch',
    value: (r) => (r.analysis.rows.length ? pct(r.analysis.pinyinMismatchRate) : null),
  },
  {
    label: 'Judge pass rate',
    value: (r) => (r.translation.rows.length ? pct(r.translation.passRate) : null),
  },
  {
    label: 'Judge faithfulness',
    value: (r) =>
      r.translation.rows.length ? num(r.translation.scoreDistribution.faithfulness) : null,
  },
  {
    label: 'Judge contextual',
    value: (r) =>
      r.translation.rows.length ? num(r.translation.scoreDistribution.contextualCorrectness) : null,
  },
  {
    label: 'Judge fluency',
    value: (r) => (r.translation.rows.length ? num(r.translation.scoreDistribution.fluency) : null),
  },
];

/** Pretty-print the labelled reports as one side-by-side table. */
export function printMatrix(results: LabeledReport[]): void {
  const metricWidth = Math.max(
    18,
    ...METRIC_ROWS.map((m) => m.label.length),
  );
  const colWidth = Math.max(10, ...results.map((r) => r.label.length));
  const pad = (s: string, w: number): string => s.padEnd(w);
  const cell = (s: string): string => s.padStart(colWidth);

  console.log('Aya model comparison');
  console.log('====================');
  const header = `${pad('metric', metricWidth)} | ${results.map((r) => cell(r.label)).join(' | ')}`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const row of METRIC_ROWS) {
    const cells = results.map((r) => cell(row.value(r.report) ?? 'skipped'));
    console.log(`${pad(row.label, metricWidth)} | ${cells.join(' | ')}`);
  }
  const anySkipped = results.some(
    (r) => r.report.ocr.rows.length === 0 && r.report.analysis.rows.length === 0,
  );
  if (anySkipped) {
    console.log(
      '\nNote: "skipped" columns lacked provider credentials. Set the provider key(s) ' +
        'and run again for real numbers.',
    );
  }
}

/** The committed comparison config: which models to put side-by-side. */
export interface CompareConfigFile {
  description?: string;
  models: ModelRunConfig[];
}

/** Walk up from this module to find models.compare.json (works from dist/ or dist-test/). */
async function findCompareConfig(): Promise<string> {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'models.compare.json');
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      dir = resolve(dir, '..');
    }
  }
  throw new Error('models.compare.json not found');
}

/** Load the committed comparison config. */
export async function loadCompareConfig(): Promise<CompareConfigFile> {
  const path = await findCompareConfig();
  return JSON.parse(await readFile(path, 'utf8')) as CompareConfigFile;
}

/** True when this module is the process entrypoint (ESM-safe). */
function isMain(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  loadCompareConfig()
    .then((cfg) => runEvalsMatrix(cfg.models))
    .then((results) => {
      printMatrix(results);
    })
    .catch((err: unknown) => {
      console.error('eval comparison failed:', err);
      process.exit(1);
    });
}
