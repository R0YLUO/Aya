// Call ① — runOcr.
//
// Builds a Claude vision message from the image, invokes a structured-output
// runner bound to OcrResultSchema, and returns the validated result. Transient
// model/network errors get bounded retries with backoff (specs/04-llm-pipeline.md).

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessageLike } from '@langchain/core/messages';
import { loadLlmConfig, type Env } from './config.js';
import { OcrResultSchema, buildOcrSystemPrompt, type OcrResult } from './ocr.js';
import {
  createStructuredRunner,
  withRetry,
  type RetryOptions,
  type StructuredRunner,
} from './model.js';
import { buildRunConfig } from './tracing.js';

/** Image input accepted by {@link runOcr}: raw bytes or an S3/HTTP(S) URL. */
export type OcrImageInput =
  | { kind: 'bytes'; data: Uint8Array; mediaType: string }
  | { kind: 'url'; url: string };

/** Options for {@link runOcr} (mostly for tests and call-site overrides). */
export interface RunOcrOptions {
  /** Inject a structured runner (tests). Defaults to a ChatAnthropic-backed one. */
  runner?: StructuredRunner<OcrResult>;
  /** Page id for run tagging, if known at scan time. */
  pageId?: string;
  /** Retry tuning. */
  retry?: RetryOptions;
  /** Environment source for config (tests). */
  env?: Env;
}

/** A LangChain v1 standard image content block (url- or base64-sourced). */
type ImageBlock =
  | { type: 'image'; url: string }
  | { type: 'image'; data: string; mimeType: string };

function toImageBlock(image: OcrImageInput): ImageBlock {
  if (image.kind === 'url') return { type: 'image', url: image.url };
  return {
    type: 'image',
    data: Buffer.from(image.data).toString('base64'),
    mimeType: image.mediaType,
  };
}

/** Build the [system, human(image)] message list for the OCR call. */
export function buildOcrMessages(image: OcrImageInput): BaseMessageLike[] {
  return [
    new SystemMessage(buildOcrSystemPrompt()),
    new HumanMessage({
      content: [
        toImageBlock(image),
        { type: 'text', text: 'Transcribe this page.' },
      ],
    }),
  ];
}

/**
 * OCR an image into a validated {@link OcrResult}.
 *
 * On transient errors it retries a bounded number of times (default 3) with
 * exponential backoff, then throws. The structured runner guarantees the result
 * is Zod-validated before return.
 */
export async function runOcr(
  image: OcrImageInput,
  options: RunOcrOptions = {},
): Promise<OcrResult> {
  let runner = options.runner;
  let model = 'unknown';
  if (runner === undefined) {
    const cfg = loadLlmConfig(options.env);
    model = cfg.ocr.model;
    runner = createStructuredRunner(cfg.ocr, cfg.apiKey, OcrResultSchema);
  }

  const messages = buildOcrMessages(image);
  const runConfig = buildRunConfig(
    options.pageId !== undefined
      ? { stage: 'ocr', model, pageId: options.pageId }
      : { stage: 'ocr', model },
    options.env,
  );

  const result = await withRetry(
    () => runner.invoke(messages, runConfig),
    options.retry,
  );
  // The runner validates against the schema, but re-parse defensively so we
  // never return unvalidated model output.
  return OcrResultSchema.parse(result);
}
