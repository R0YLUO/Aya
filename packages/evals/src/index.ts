// Public barrel for @aya/evals.
//
// Evals run against the same runOcr / analyzeText the production API uses
// (specs/06-evals.md). Datasets are versioned fixtures under datasets/; scorers
// are deterministic; LangSmith is an optional sink. The entrypoint is run-evals.ts
// (`npm run eval`).

export {
  loadOcrDataset,
  loadAnalysisDataset,
  OcrDatasetSchema,
  AnalysisDatasetSchema,
  OcrExampleSchema,
  AnalysisExampleSchema,
} from './datasets.js';
export type {
  OcrDataset,
  AnalysisDataset,
  OcrExample,
  AnalysisExample,
} from './datasets.js';

export {
  editDistance,
  characterErrorRate,
  characterAccuracy,
  boundaryF1,
  idiomSplitCount,
  reconstructionPass,
} from './scorers.js';
export type { BoundaryScore } from './scorers.js';

export { isLangSmithEnabled, registerLangSmithDataset } from './langsmith.js';
export type { LangSmithEnv, RegisterDatasetInput } from './langsmith.js';

export { runEvals, printReport } from './run-evals.js';
export type {
  EvalReport,
  OcrEvalRow,
  AnalysisEvalRow,
  RunEvalsOptions,
} from './run-evals.js';
