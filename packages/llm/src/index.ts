// Public barrel for @aya/llm.
//
// The rest of the system interacts with the model only through `runOcr` and
// `analyzeText` — it never imports LangChain or knows which model is in use
// (North Star: Extensible; specs/04-llm-pipeline.md).
//
// Stubs at this scaffold step throw "not implemented"; they are replaced by the
// real chains in the llm-run-ocr / llm-analyze-text tasks.

import type { Phrase } from '@aya/shared';

export {
  loadLlmConfig,
  OCR_MAX_TOKENS,
  ANALYSIS_MAX_TOKENS,
} from './config.js';
export type { LlmConfig, StageConfig, Env } from './config.js';

export {
  buildRunConfig,
  buildRunMetadata,
  isTracingEnabled,
} from './tracing.js';
export type { Stage, RunTagInput, RunMetadata } from './tracing.js';

/** Image input accepted by {@link runOcr}: raw bytes or an S3/HTTP(S) URL. */
export type OcrImageInput =
  | { kind: 'bytes'; data: Uint8Array; mediaType: string }
  | { kind: 'url'; url: string };

/** Status discriminant returned by the OCR call (specs/04-llm-pipeline.md). */
export type OcrStatus = 'ok' | 'unreadable' | 'no_chinese_text';

/** Validated result of the OCR call. `fullText` is "" unless status is "ok". */
export interface OcrResult {
  status: OcrStatus;
  fullText: string;
}

/**
 * Call ① — OCR. Extracts printed Simplified-Chinese text from an image via a
 * Claude vision model, returning a validated {@link OcrResult}.
 *
 * Stub until `llm-run-ocr`.
 */
export function runOcr(_image: OcrImageInput): Promise<OcrResult> {
  throw new Error('runOcr: not implemented');
}

/**
 * Call ② — Analysis. Segments and analyses `fullText` into an ordered
 * `Phrase[]`, enforcing the reconstruction invariant. Stub until
 * `llm-analyze-text`.
 */
export function analyzeText(_fullText: string, _pageId: string): Promise<Phrase[]> {
  throw new Error('analyzeText: not implemented');
}
