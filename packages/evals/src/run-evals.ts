// Eval runner entrypoint — `npm run eval -w packages/evals`.
//
// Runs the SAME runOcr / analyzeText the production API uses against the versioned
// fixtures, scores them with the deterministic scorers, and prints a summary
// (specs/06-evals.md). LangSmith datasets are registered when its env is present;
// otherwise the run is purely local. The Anthropic key gates the REAL model path:
// when it (or an injected runner) is absent the runner reports that the model
// stages were skipped rather than failing — the offline scaffold still exercises
// loading, scoring, and (optionally) LangSmith registration.
//
// Callers (and tests) can inject runners to score against fixed model output
// without any network — the same dependency-injection pattern packages/llm uses.

import {
  runOcr,
  analyzeText,
  type OcrResult,
  type AnalysisResult,
  type StructuredRunner,
  type OcrImageInput,
  AnalysisFailedError,
} from '@aya/llm';
import type { Phrase } from '@aya/shared';
import { pathToFileURL } from 'node:url';
import {
  loadOcrDataset,
  loadAnalysisDataset,
  loadTranslationDataset,
  type OcrExample,
  type AnalysisExample,
} from './datasets.js';
import {
  scoreCER,
  CER_ACCURACY_TARGET,
  boundaryF1,
  idiomSplitCount,
  reconstructionPass,
} from './scorers.js';
import { isLangSmithEnabled, registerLangSmithDataset } from './langsmith.js';

export interface OcrEvalRow {
  id: string;
  charAccuracy: number;
  statusMatch: boolean;
}

/** A single OCR example that fell below the ≥95% accuracy KPI. */
export interface OcrBelowTargetRow {
  id: string;
  charAccuracy: number;
}

export interface AnalysisEvalRow {
  id: string;
  boundaryF1: number;
  idiomSplits: number;
  reconstructionOk: boolean;
}

export interface EvalReport {
  ocr: {
    rows: OcrEvalRow[];
    meanCharAccuracy: number;
    statusAccuracy: number;
    /** The accuracy KPI each OCR example is judged against (≥95%). */
    accuracyTarget: number;
    /** OCR examples whose char accuracy fell below the KPI. */
    belowTarget: OcrBelowTargetRow[];
  };
  analysis: {
    rows: AnalysisEvalRow[];
    meanBoundaryF1: number;
    totalIdiomSplits: number;
    reconstructionPassRate: number;
  };
  /**
   * Translation set is loaded/validated and (when enabled) registered, but the
   * LLM-as-judge scorer is deferred to a later task (needs the Anthropic key), so
   * only the example count is reported here for now.
   */
  translation: { exampleCount: number };
  langsmith: { enabled: boolean; registered: boolean };
}

export interface RunEvalsOptions {
  /** Inject an OCR runner (offline scoring / tests). */
  ocrRunner?: StructuredRunner<OcrResult>;
  /** Inject an analysis runner (offline scoring / tests). */
  analysisRunner?: StructuredRunner<AnalysisResult>;
  /** Dataset versions to load. */
  ocrVersion?: string;
  analysisVersion?: string;
  translationVersion?: string;
  /** Env source (LangSmith + model config). Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** When true, mirror the loaded fixtures into LangSmith (if enabled). */
  register?: boolean;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Map a fixture image ref to the runOcr input (base64 bytes → Uint8Array). */
function toImageInput(image: OcrExample['image']): OcrImageInput {
  if (image.kind === 'url') return { kind: 'url', url: image.url };
  return {
    kind: 'bytes',
    data: new Uint8Array(Buffer.from(image.data, 'base64')),
    mediaType: image.mediaType,
  };
}

async function scoreOcr(
  example: OcrExample,
  runner: StructuredRunner<OcrResult> | undefined,
  env: NodeJS.ProcessEnv,
): Promise<OcrEvalRow> {
  const result = await runOcr(
    toImageInput(example.image),
    runner !== undefined ? { runner } : { env },
  );
  return {
    id: example.id,
    charAccuracy: scoreCER(result.fullText, example.expected.fullText).accuracy,
    statusMatch: result.status === example.expected.status,
  };
}

async function scoreAnalysis(
  example: AnalysisExample,
  runner: StructuredRunner<AnalysisResult> | undefined,
  env: NodeJS.ProcessEnv,
): Promise<AnalysisEvalRow> {
  let phrases: Phrase[];
  try {
    phrases = await analyzeText(
      example.fullText,
      example.pageId,
      runner !== undefined ? { runner } : { env },
    );
  } catch (err) {
    // A persistent reconstruction failure is an automatic fail, not a crash.
    if (err instanceof AnalysisFailedError) {
      return {
        id: example.id,
        boundaryF1: 0,
        idiomSplits: idiomSplitCount([], example.goldBoundaries),
        reconstructionOk: false,
      };
    }
    throw err;
  }

  const predictedBoundaries = phrases.map((p) => p.original);
  const goldIdioms = example.goldBoundaries.filter((t) => t.length > 1);
  return {
    id: example.id,
    boundaryF1: boundaryF1(predictedBoundaries, example.goldBoundaries).f1,
    idiomSplits: idiomSplitCount(predictedBoundaries, goldIdioms),
    reconstructionOk: reconstructionPass(example.fullText, phrases),
  };
}

/**
 * Run the full eval suite and return a structured report. The model stages run
 * only when a runner is injected OR real model env is present; otherwise the
 * relevant section is empty and the caller's summary notes the skip.
 */
export async function runEvals(options: RunEvalsOptions = {}): Promise<EvalReport> {
  const env = options.env ?? process.env;
  const ocrData = await loadOcrDataset(options.ocrVersion);
  const analysisData = await loadAnalysisDataset(options.analysisVersion);
  // Loaded (and validated) on every run so a malformed fixture fails loudly, even
  // though the LLM-as-judge translation scorer is deferred (needs the Anthropic key).
  const translationData = await loadTranslationDataset(options.translationVersion);

  const lsEnabled = isLangSmithEnabled(env);
  let registered = false;
  if (options.register && lsEnabled) {
    const ocrReg = await registerLangSmithDataset(
      {
        datasetName: `aya-ocr-${ocrData.version}`,
        description: ocrData.description ?? '',
        examples: ocrData.examples.map((e) => ({
          inputs: { image: e.image },
          outputs: { ...e.expected },
        })),
      },
      env,
    );
    const analysisReg = await registerLangSmithDataset(
      {
        datasetName: `aya-analysis-${analysisData.version}`,
        description: analysisData.description ?? '',
        examples: analysisData.examples.map((e) => ({
          inputs: { fullText: e.fullText, pageId: e.pageId },
          outputs: { goldBoundaries: e.goldBoundaries, goldPinyin: e.goldPinyin },
        })),
      },
      env,
    );
    const translationReg = await registerLangSmithDataset(
      {
        datasetName: `aya-translation-${translationData.version}`,
        description: translationData.description ?? '',
        examples: translationData.examples.map((e) => ({
          inputs: { fullText: e.fullText, phrase: e.phrase },
          outputs: {
            referenceTranslation: e.referenceTranslation,
            referenceContextualMeaning: e.referenceContextualMeaning,
            rubricNotes: e.rubricNotes,
          },
        })),
      },
      env,
    );
    registered = ocrReg && analysisReg && translationReg;
  }

  // Decide whether the model path can run: a runner is injected, or a real key.
  const hasApiKey = Boolean(env['ANTHROPIC_API_KEY']);
  const canRunOcr = options.ocrRunner !== undefined || hasApiKey;
  const canRunAnalysis = options.analysisRunner !== undefined || hasApiKey;

  const ocrRows = canRunOcr
    ? await Promise.all(
        ocrData.examples.map((e) => scoreOcr(e, options.ocrRunner, env)),
      )
    : [];
  const analysisRows = canRunAnalysis
    ? await Promise.all(
        analysisData.examples.map((e) =>
          scoreAnalysis(e, options.analysisRunner, env),
        ),
      )
    : [];

  return {
    ocr: {
      rows: ocrRows,
      meanCharAccuracy: mean(ocrRows.map((r) => r.charAccuracy)),
      statusAccuracy: mean(ocrRows.map((r) => (r.statusMatch ? 1 : 0))),
      accuracyTarget: CER_ACCURACY_TARGET,
      belowTarget: ocrRows
        .filter((r) => r.charAccuracy < CER_ACCURACY_TARGET)
        .map((r) => ({ id: r.id, charAccuracy: r.charAccuracy })),
    },
    analysis: {
      rows: analysisRows,
      meanBoundaryF1: mean(analysisRows.map((r) => r.boundaryF1)),
      totalIdiomSplits: analysisRows.reduce((a, r) => a + r.idiomSplits, 0),
      reconstructionPassRate: mean(
        analysisRows.map((r) => (r.reconstructionOk ? 1 : 0)),
      ),
    },
    translation: { exampleCount: translationData.examples.length },
    langsmith: { enabled: lsEnabled, registered },
  };
}

/** Pretty-print the report to stdout. */
export function printReport(report: EvalReport): void {
  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
  console.log('Aya eval report');
  console.log('================');
  if (report.ocr.rows.length === 0) {
    console.log('OCR     : skipped (no ANTHROPIC_API_KEY / injected runner)');
  } else {
    console.log(
      `OCR     : ${report.ocr.rows.length} examples | char acc ${pct(
        report.ocr.meanCharAccuracy,
      )} | status acc ${pct(report.ocr.statusAccuracy)} | target ${pct(
        report.ocr.accuracyTarget,
      )}`,
    );
    if (report.ocr.belowTarget.length > 0) {
      console.log(
        `          ⚠ ${report.ocr.belowTarget.length} below target: ${report.ocr.belowTarget
          .map((r) => `${r.id} (${pct(r.charAccuracy)})`)
          .join(', ')}`,
      );
    }
  }
  if (report.analysis.rows.length === 0) {
    console.log('Analysis: skipped (no ANTHROPIC_API_KEY / injected runner)');
  } else {
    console.log(
      `Analysis: ${report.analysis.rows.length} examples | boundary F1 ${pct(
        report.analysis.meanBoundaryF1,
      )} | idiom splits ${report.analysis.totalIdiomSplits} | reconstruction ${pct(
        report.analysis.reconstructionPassRate,
      )}`,
    );
  }
  console.log(
    `Translation: ${report.translation.exampleCount} examples loaded (judge scorer deferred — needs ANTHROPIC_API_KEY)`,
  );
  console.log(
    `LangSmith: ${report.langsmith.enabled ? 'enabled' : 'disabled'}${
      report.langsmith.registered ? ' (datasets registered)' : ''
    }`,
  );
}

/** True when this module is the process entrypoint (ESM-safe). */
function isMain(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  runEvals({ register: true })
    .then((report) => {
      printReport(report);
      // Idiom splits must stay at zero; a non-zero count fails the run.
      if (report.analysis.totalIdiomSplits > 0) {
        console.error(
          `\nFAIL: ${report.analysis.totalIdiomSplits} idiom split(s) detected.`,
        );
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      console.error('eval run failed:', err);
      process.exit(1);
    });
}
