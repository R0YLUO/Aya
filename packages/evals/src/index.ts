// Public barrel for @aya/evals.
//
// Evals run against the same runOcr / analyzeText the production API uses
// (specs/06-evals.md). Datasets are versioned fixtures under datasets/; scorers
// are deterministic; LangSmith is an optional sink. The entrypoint is run-evals.ts
// (`npm run eval`).

export {
  loadOcrDataset,
  loadAnalysisDataset,
  loadTranslationDataset,
  OcrDatasetSchema,
  AnalysisDatasetSchema,
  TranslationDatasetSchema,
  OcrExampleSchema,
  AnalysisExampleSchema,
  TranslationExampleSchema,
} from './datasets.js';
export type {
  OcrDataset,
  AnalysisDataset,
  TranslationDataset,
  OcrExample,
  AnalysisExample,
  TranslationExample,
} from './datasets.js';

export {
  editDistance,
  characterErrorRate,
  characterAccuracy,
  scoreCER,
  summariseCer,
  CER_ACCURACY_TARGET,
  boundaryF1,
  idiomSplitCount,
  scoreSegmentation,
  reconstructionPass,
} from './scorers.js';
export type {
  BoundaryScore,
  SegmentationScore,
  CerScore,
  CerExample,
  CerSummary,
  CerSummaryRow,
} from './scorers.js';

export {
  normalizePinyin,
  referencePinyin,
  characterReadings,
  stripTones,
  scorePinyin,
  summarisePinyin,
  DEFAULT_POLYPHONE_EXCEPTIONS,
} from './pinyin.js';
export type { PinyinScore, PinyinExample, PinyinSummary } from './pinyin.js';

export {
  scoreTranslation,
  loadJudgeConfig,
  buildJudgeSystemPrompt,
  buildJudgeUserMessage,
  JudgeRubricSchema,
  JUDGE_DIMENSIONS,
  JUDGE_SCALE_MIN,
  JUDGE_SCALE_MAX,
  JUDGE_MAX_TOKENS,
  DEFAULT_JUDGE_THRESHOLD,
} from './translation.js';
export type {
  JudgeRubric,
  JudgeDimension,
  TranslationScore,
  ScoreTranslationOptions,
} from './translation.js';

export { isLangSmithEnabled, registerLangSmithDataset } from './langsmith.js';
export type { LangSmithEnv, RegisterDatasetInput } from './langsmith.js';

export { runEvals, printReport } from './run-evals.js';
export type {
  EvalReport,
  OcrEvalRow,
  AnalysisEvalRow,
  TranslationEvalRow,
  JudgeScoreDistribution,
  RunEvalsOptions,
} from './run-evals.js';

export { runEvalsMatrix, printMatrix, loadCompareConfig } from './compare.js';
export type {
  ModelRunConfig,
  LabeledReport,
  RunEvalsMatrixOptions,
  CompareConfigFile,
} from './compare.js';

export {
  extractMetrics,
  compareToBaseline,
  loadBaseline,
  printComparison,
  BaselineSchema,
} from './report.js';
export type {
  EvalMetrics,
  Baseline,
  MetricGate,
  MetricDirection,
  MetricFinding,
  BaselineComparison,
} from './report.js';
