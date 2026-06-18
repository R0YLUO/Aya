// Public barrel for @aya/llm.
//
// The rest of the system interacts with the model only through `runOcr` and
// `analyzeText` — it never imports LangChain or knows which model is in use
// (North Star: Extensible; specs/04-llm-pipeline.md).

export {
  loadLlmConfig,
  hasModelCredentials,
  parseProviderId,
  PROVIDERS,
  SUPPORTED_PROVIDERS,
  OCR_MAX_TOKENS,
  ANALYSIS_MAX_TOKENS,
} from './config.js';
export type { LlmConfig, ModelSpec, ProviderId, ProviderInfo, Env } from './config.js';

export {
  buildRunConfig,
  buildRunMetadata,
  isTracingEnabled,
} from './tracing.js';
export type { Stage, RunTagInput, RunMetadata } from './tracing.js';

export {
  createStructuredRunner,
  withRetry,
  TransientLlmError,
} from './model.js';
export type { StructuredRunner, RetryOptions } from './model.js';

export {
  OcrResultSchema,
  OcrStatusSchema,
  buildOcrSystemPrompt,
} from './ocr.js';
export type { OcrResult, OcrStatus } from './ocr.js';

export {
  AnalysisResultSchema,
  PhraseTokenSchema,
  buildAnalysisSystemPrompt,
} from './analysis.js';
export type { AnalysisResult, PhraseToken } from './analysis.js';

export { runOcr, buildOcrMessages } from './run-ocr.js';
export type { OcrImageInput, RunOcrOptions } from './run-ocr.js';

export { analyzeText, AnalysisFailedError } from './analyze-text.js';
export type { AnalyzeTextOptions } from './analyze-text.js';
