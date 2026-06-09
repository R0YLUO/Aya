// REST API request/response contracts for Aya, defined once here and imported by
// `packages/api` (to validate inbound requests and shape responses) and by the
// web/mobile clients (to type their API clients). One definition, three
// consumers — a contract change is a typecheck event everywhere (North Star:
// Extensible).
//
// Source of truth: specs/03-api-design.md.

import { z } from 'zod';
import { PageSchema, PhraseSchema, AnalyzedPageSchema } from './schemas.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Machine-readable, stable error codes mapped to the PRD error states. Clients
 * switch on these to show the right message.
 */
export const ERROR_CODES = [
  'image_unreadable',
  'no_chinese_text',
  'image_not_found',
  'analysis_failed',
  'validation_error',
  'share_not_found',
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);

/** Union of the machine-readable error codes. */
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** The consistent error envelope returned by every endpoint on failure. */
export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

// ---------------------------------------------------------------------------
// POST /uploads — presigned image upload URL
// ---------------------------------------------------------------------------

/** Body may be empty; `contentType` defaults to image/jpeg server-side. */
export const UploadRequestSchema = z.object({
  contentType: z.string().optional(),
});

export type UploadRequest = z.infer<typeof UploadRequestSchema>;

export const UploadResponseSchema = z.object({
  uploadUrl: z.string(),
  imageKey: z.string(),
  expiresInSeconds: z.number().int().positive(),
});

export type UploadResponse = z.infer<typeof UploadResponseSchema>;

// ---------------------------------------------------------------------------
// POST /pages — scan: OCR -> analysis (stateless)
// ---------------------------------------------------------------------------

export const ScanRequestSchema = z.object({
  imageKey: z.string(),
});

export type ScanRequest = z.infer<typeof ScanRequestSchema>;

/** The scan response is a fully analysed page. */
export const ScanResponseSchema = AnalyzedPageSchema;

export type ScanResponse = z.infer<typeof ScanResponseSchema>;

// ---------------------------------------------------------------------------
// POST /shares — persist a page and mint a short URL
// ---------------------------------------------------------------------------

export const ShareRequestSchema = z.object({
  page: PageSchema,
  phrases: z.array(PhraseSchema),
});

export type ShareRequest = z.infer<typeof ShareRequestSchema>;

export const ShareResponseSchema = z.object({
  code: z.string(),
  url: z.string(),
  pageId: z.string(),
});

export type ShareResponse = z.infer<typeof ShareResponseSchema>;

// ---------------------------------------------------------------------------
// GET /shares/{code} — resolve a short URL to its analysed page
// ---------------------------------------------------------------------------

/** Resolving a share returns the same analysed-page shape as the scan endpoint. */
export const ShareResolveResponseSchema = AnalyzedPageSchema;

export type ShareResolveResponse = z.infer<typeof ShareResolveResponseSchema>;

// ---------------------------------------------------------------------------
// GET /health — liveness
// ---------------------------------------------------------------------------

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
