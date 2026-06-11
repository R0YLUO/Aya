// Error layer: maps domain/LLM errors to the consistent HTTP error envelope and
// status codes from the API doc. Every endpoint funnels failures through here so
// clients always receive `{ error: { code, message, details? } }` with a stable,
// machine-readable `code` they can map to the exact PRD error state.
//
// Source of truth: specs/03-api-design.md (Errors table) and the PRD copy.

import type { ErrorCode, ErrorEnvelope } from '@aya/shared';

/** HTTP status returned for each machine-readable error code (API doc table). */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation_error: 400,
  image_not_found: 404,
  share_not_found: 404,
  image_unreadable: 422,
  no_chinese_text: 422,
  analysis_failed: 502,
};

/**
 * Default, client-displayable message for each error code. Where the PRD/API doc
 * specifies copy verbatim ("Photo unclear, please retake."), we match it exactly.
 */
const DEFAULT_MESSAGE_BY_CODE: Record<ErrorCode, string> = {
  validation_error: 'The request was invalid.',
  image_not_found: 'The uploaded image could not be found. Please upload it again.',
  share_not_found: 'This shared page could not be found.',
  image_unreadable: 'Photo unclear, please retake.',
  no_chinese_text: 'No Chinese text found, please try again.',
  analysis_failed: 'We could not analyse this page. Please try again.',
};

/** Structured context attached to an error envelope. */
export type ErrorDetails = Record<string, unknown>;

/**
 * A typed, expected API failure. Throwing an `ApiError` anywhere in a handler is
 * the canonical way to produce a non-500 response: `toErrorResponse` turns it into
 * the right status + envelope. Anything that is *not* an `ApiError` is treated as
 * an unexpected server error (500).
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: ErrorDetails | undefined;

  constructor(code: ErrorCode, message?: string, details?: ErrorDetails) {
    super(message ?? DEFAULT_MESSAGE_BY_CODE[code]);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.details = details;
  }
}

// Convenience constructors for the PRD failure states. They carry the canonical
// status + default copy; callers may override the message/details.
export const validationError = (message?: string, details?: ErrorDetails): ApiError =>
  new ApiError('validation_error', message, details);
export const imageNotFound = (message?: string, details?: ErrorDetails): ApiError =>
  new ApiError('image_not_found', message, details);
export const shareNotFound = (message?: string, details?: ErrorDetails): ApiError =>
  new ApiError('share_not_found', message, details);
export const imageUnreadable = (message?: string, details?: ErrorDetails): ApiError =>
  new ApiError('image_unreadable', message, details);
export const noChineseText = (message?: string, details?: ErrorDetails): ApiError =>
  new ApiError('no_chinese_text', message, details);
export const analysisFailed = (message?: string, details?: ErrorDetails): ApiError =>
  new ApiError('analysis_failed', message, details);

/**
 * The code used for an unexpected server error (HTTP 500). It is intentionally
 * NOT part of the PRD `ErrorCode` enum — the enum is the set of expected,
 * client-actionable failures; a 500 is "something we didn't anticipate".
 */
export const INTERNAL_ERROR_CODE = 'internal_error' as const;

/**
 * The code used when no route matches the request (HTTP 404). Like
 * `internal_error`, it is intentionally NOT part of the PRD `ErrorCode` enum: an
 * unknown route is a transport-level "no such endpoint", not one of the expected,
 * client-actionable PRD failure states (which are resource-not-found cases like
 * `image_not_found` / `share_not_found`).
 */
export const NOT_FOUND_CODE = 'not_found' as const;

/** Error envelope shape, allowing the internal-error code for the 500 case. */
type ApiErrorEnvelope =
  | ErrorEnvelope
  | {
      error: {
        code: typeof INTERNAL_ERROR_CODE;
        message: string;
        details?: ErrorDetails;
      };
    };

/** An HTTP error response: a status code and a standard error envelope body. */
export interface ErrorResponse {
  statusCode: number;
  body: ApiErrorEnvelope;
}

/**
 * Map any thrown value to an HTTP error response. Expected `ApiError`s keep their
 * code/status; everything else becomes a `500` with a generic, safe message so we
 * never leak internals to clients (specs/03-api-design.md: 500 = unexpected).
 */
export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof ApiError) {
    const envelope: ErrorEnvelope = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    };
    return { statusCode: error.statusCode, body: envelope };
  }

  // Unknown / unexpected error: 500 with a generic, safe message.
  return {
    statusCode: 500,
    body: {
      error: {
        code: INTERNAL_ERROR_CODE,
        message: 'An unexpected error occurred.',
      },
    },
  };
}
