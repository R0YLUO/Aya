// Production wiring for the POST /pages scan handler. Adapts the real @aya/llm
// calls (runOcr, analyzeText) and the S3 presign service to the injectable
// dependency shapes makeScanHandler expects, keeping the handler itself free of
// LangChain/AWS imports so it stays unit-testable offline.
//
// @aya/api depends on @aya/llm here (the only place) — never the reverse
// (CLAUDE.md dependency direction).

import { runOcr, analyzeText, type Env } from '@aya/llm';
import type { S3PresignService } from '../services/s3-presign-service.js';
import { makeScanHandler, type ScanHandlerDeps } from './pages.js';

/** Default MIME type for uploaded images (uploads are presigned as image/jpeg). */
const DEFAULT_IMAGE_MEDIA_TYPE = 'image/jpeg';

export interface ScanWiringOptions {
  /** Env source for @aya/llm config (model ids, API key). */
  env?: Env;
  /** Override the structured log sink / clocks (defaults inside makeScanHandler). */
  log?: ScanHandlerDeps['log'];
  clock?: ScanHandlerDeps['clock'];
  now?: ScanHandlerDeps['now'];
}

/**
 * Construct the live scan handler from the real S3 presign service and the two
 * @aya/llm calls. Token usage is not yet surfaced by runOcr/analyzeText (it lives
 * in LangSmith — specs/05-observability.md), so the log line records null token
 * counts until the LLM calls return usage. See brain/handoffs for the gap.
 */
export function makeScanHandlerWithLlm(presign: S3PresignService, options: ScanWiringOptions = {}) {
  const { env } = options;
  const deps: ScanHandlerDeps = {
    fetchImage: async (imageKey) => {
      const data = await presign.getUploadedImage(imageKey);
      return { data, mediaType: DEFAULT_IMAGE_MEDIA_TYPE };
    },
    runOcr: async (image, pageId) => {
      const result = await runOcr(
        { kind: 'bytes', data: image.data, mediaType: image.mediaType },
        env !== undefined ? { pageId, env } : { pageId },
      );
      return { status: result.status, fullText: result.fullText, tokens: null };
    },
    analyzeText: async (fullText, pageId) => {
      const phrases = await analyzeText(
        fullText,
        pageId,
        env !== undefined ? { env } : {},
      );
      return { phrases, tokens: null };
    },
    ...(options.log !== undefined ? { log: options.log } : {}),
    ...(options.clock !== undefined ? { clock: options.clock } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  };
  return makeScanHandler(deps);
}
