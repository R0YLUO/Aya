// POST /pages — the scan endpoint. Given an uploaded image key it runs the
// two-call pipeline server-side (OCR -> analysis) and returns the fully analysed
// page. It is STATELESS: nothing is written to DynamoDB on this path (golden
// rule #6 / specs/03-api-design.md §2). Page and phrase ids and createdAt are
// minted here and only persisted later if the user shares the page.
//
// OCR statuses map to PRD errors: unreadable -> image_unreadable (422),
// no_chinese_text -> no_chinese_text (422). A missing/expired image key is a
// 404 image_not_found (thrown by getUploadedImage). Analysis/reconstruction
// failure is a 502 analysis_failed.
//
// One structured `page_scanned` JSON log line is emitted per scan with per-stage
// latency, token counts, phrase count and outcome (specs/05-observability.md).

import { v4 as uuidv4 } from 'uuid';
import {
  ScanRequestSchema,
  ScanResponseSchema,
  type AnalyzedPage,
  type Page,
  type Phrase,
} from '@aya/shared';
import { analysisFailed, imageUnreadable, noChineseText, validationError } from '../errors.js';
import type { Handler, HandlerRequest, HandlerResult } from './types.js';

/** Input/passthrough or URL accepted by the injected OCR function. */
export interface ScanImageInput {
  /** Raw image bytes fetched from S3. */
  data: Uint8Array;
  /** MIME type of the bytes; uploads default to image/jpeg. */
  mediaType: string;
}

/** Token usage for one LLM stage, as surfaced to the per-scan log line. */
export interface StageTokens {
  input: number;
  output: number;
}

/** Result of the OCR stage as the handler consumes it. */
export interface OcrStageResult {
  status: 'ok' | 'unreadable' | 'no_chinese_text';
  fullText: string;
  /** Token usage, when the underlying call surfaces it; otherwise null. */
  tokens?: StageTokens | null;
}

/** Result of the analysis stage as the handler consumes it. */
export interface AnalysisStageResult {
  phrases: Phrase[];
  /** Token usage, when the underlying call surfaces it; otherwise null. */
  tokens?: StageTokens | null;
}

/** Fetches the uploaded image bytes; throws image_not_found on a missing key. */
export type FetchImage = (imageKey: string) => Promise<ScanImageInput>;

/** Runs OCR over the fetched image. */
export type RunOcrFn = (image: ScanImageInput, pageId: string) => Promise<OcrStageResult>;

/** Segments + analyses the OCR text into ordered phrases. */
export type AnalyzeTextFn = (fullText: string, pageId: string) => Promise<AnalysisStageResult>;

/** Emits one structured log line (defaults to JSON on stdout). */
export type LogFn = (line: Record<string, unknown>) => void;

/** Outcome recorded in the page_scanned log line. */
export type ScanOutcome = 'ok' | 'image_unreadable' | 'no_chinese_text' | 'analysis_failed';

export interface ScanHandlerDeps {
  fetchImage: FetchImage;
  runOcr: RunOcrFn;
  analyzeText: AnalyzeTextFn;
  /** Structured logger. Defaults to JSON.stringify -> console.log. */
  log?: LogFn;
  /** Monotonic-ish clock in ms for latency measurement. Defaults to Date.now. */
  clock?: () => number;
  /** Wall clock for the page's createdAt. Defaults to () => new Date(). */
  now?: () => Date;
}

const defaultLog: LogFn = (line) => {
  // Single JSON line to stdout -> CloudWatch Logs (specs/05-observability.md).
  console.log(JSON.stringify(line));
};

/** Map an OCR non-ok status to the outcome we log for it. */
function outcomeForOcr(status: 'unreadable' | 'no_chinese_text'): ScanOutcome {
  return status === 'unreadable' ? 'image_unreadable' : 'no_chinese_text';
}

/**
 * Build the POST /pages scan handler. Dependencies (image fetch + the two LLM
 * calls) are injected so the orchestration is unit-testable offline and the
 * config/runner wiring stays at the edge (api package convention).
 */
export function makeScanHandler(deps: ScanHandlerDeps): Handler<AnalyzedPage> {
  const log = deps.log ?? defaultLog;
  const clock = deps.clock ?? (() => Date.now());
  const now = deps.now ?? (() => new Date());

  return async (request: HandlerRequest): Promise<HandlerResult<AnalyzedPage>> => {
    const parsed = ScanRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw validationError('Invalid scan request body.', {
        issues: parsed.error.issues,
      });
    }
    const { imageKey } = parsed.data;

    const pageId = uuidv4();
    const startedAt = clock();

    // Latencies + token counts captured for the per-scan log line. Held in a
    // mutable bag so the `emit` closure always reads the latest values; we emit
    // on every terminal path (success and each PRD failure), then re-throw.
    const metrics: {
      ocrStatus: OcrStageResult['status'] | null;
      ocrLatencyMs: number;
      analysisLatencyMs: number;
      ocrTokens: StageTokens | null;
      analysisTokens: StageTokens | null;
      phraseCount: number;
    } = {
      ocrStatus: null,
      ocrLatencyMs: 0,
      analysisLatencyMs: 0,
      ocrTokens: null,
      analysisTokens: null,
      phraseCount: 0,
    };

    const emit = (outcome: ScanOutcome): void => {
      log({
        event: 'page_scanned',
        pageId,
        ocrStatus: metrics.ocrStatus,
        ocrLatencyMs: metrics.ocrLatencyMs,
        analysisLatencyMs: metrics.analysisLatencyMs,
        totalLatencyMs: clock() - startedAt,
        phraseCount: metrics.phraseCount,
        ocrTokens: metrics.ocrTokens,
        analysisTokens: metrics.analysisTokens,
        outcome,
      });
    };

    // image_not_found (404) is thrown by fetchImage before any logging fields
    // exist; let it propagate to the router's error catch.
    const image = await deps.fetchImage(imageKey);

    // ----- Call ①: OCR -------------------------------------------------------
    const ocrStart = clock();
    const ocr = await deps.runOcr(image, pageId);
    metrics.ocrLatencyMs = clock() - ocrStart;
    metrics.ocrStatus = ocr.status;
    metrics.ocrTokens = ocr.tokens ?? null;

    if (ocr.status === 'unreadable' || ocr.status === 'no_chinese_text') {
      emit(outcomeForOcr(ocr.status));
      throw ocr.status === 'unreadable' ? imageUnreadable() : noChineseText();
    }

    // ----- Call ②: analysis --------------------------------------------------
    const analysisStart = clock();
    let analysis: AnalysisStageResult;
    try {
      analysis = await deps.analyzeText(ocr.fullText, pageId);
    } catch (error) {
      metrics.analysisLatencyMs = clock() - analysisStart;
      emit('analysis_failed');
      // Surface the canonical 502 regardless of the underlying LLM error type.
      throw analysisFailed(undefined, { cause: errorMessage(error) });
    }
    metrics.analysisLatencyMs = clock() - analysisStart;
    metrics.analysisTokens = analysis.tokens ?? null;
    metrics.phraseCount = analysis.phrases.length;

    const page: Page = {
      id: pageId,
      fullText: ocr.fullText,
      createdAt: now().toISOString(),
    };
    const result: AnalyzedPage = { page, phrases: analysis.phrases };

    // Validate the response shape against the shared contract before returning.
    // The reconstruction invariant itself is enforced upstream by analyzeText
    // (it throws AnalysisFailedError on mismatch — caught above); this is the
    // defensive shape check. A malformed result is an analysis failure, not a 500.
    const validated = ScanResponseSchema.safeParse(result);
    if (!validated.success) {
      emit('analysis_failed');
      throw analysisFailed(undefined, { issues: validated.error.issues });
    }

    emit('ok');
    return { statusCode: 200, body: result };
  };
}

/** Best-effort message extraction for the analysis_failed log detail. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
