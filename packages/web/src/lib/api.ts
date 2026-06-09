// Typed API client for the web reader.
//
// The web reader only ever reads a shared page: it calls GET /shares/{code} and
// validates the response against the shared contract (ShareResolveResponseSchema)
// so the wire payload and our types can never drift (North Star: Extensible).
//
// It depends on @aya/shared ONLY — never on @aya/api or @aya/llm. The base URL
// of the backend comes from the environment (no secrets, no hard-coded hosts).

import {
  ShareResolveResponseSchema,
  ErrorEnvelopeSchema,
  type AnalyzedPage,
  type ErrorCode,
} from '@aya/shared';

/**
 * Resolve the API base URL from the environment. We accept the
 * `AYA_API_BASE_URL` server var (used during SSR) and fall back to the
 * `NEXT_PUBLIC_AYA_API_BASE_URL` public var so the same client works in both
 * places. (Trailing slashes are trimmed by the caller before path joins.)
 */
function resolveApiBaseUrl(): string {
  const raw =
    process.env['AYA_API_BASE_URL'] ??
    process.env['NEXT_PUBLIC_AYA_API_BASE_URL'];
  if (!raw) {
    throw new Error(
      'Missing API base URL: set AYA_API_BASE_URL (or NEXT_PUBLIC_AYA_API_BASE_URL).',
    );
  }
  return raw;
}

/**
 * A typed error carrying the machine-readable {@link ErrorCode} from the API's
 * standard error envelope, so callers can branch on `code` (e.g. render a
 * not-found page for `share_not_found`) without parsing strings.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }

  /** True for the unknown/expired share-code case the reader renders specially. */
  get isShareNotFound(): boolean {
    return this.code === 'share_not_found';
  }
}

interface FetchSharedPageOptions {
  /** Override the base URL (mainly for tests). Defaults to the env value. */
  baseUrl?: string;
  /** Inject a fetch implementation (mainly for tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Fetch a shared, analysed page by its short code.
 *
 * - On `200` it validates the body against {@link ShareResolveResponseSchema}
 *   and returns the {@link AnalyzedPage}.
 * - On `404 share_not_found` (or any error envelope) it throws an
 *   {@link ApiError} carrying the machine-readable code.
 * - On an unparseable/unexpected response it throws a generic {@link ApiError}.
 */
export async function fetchSharedPage(
  code: string,
  options: FetchSharedPageOptions = {},
): Promise<AnalyzedPage> {
  const baseUrl = (options.baseUrl ?? resolveApiBaseUrl()).replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? fetch;

  const response = await doFetch(
    `${baseUrl}/shares/${encodeURIComponent(code)}`,
    { headers: { accept: 'application/json' } },
  );

  if (response.ok) {
    const json: unknown = await response.json();
    return ShareResolveResponseSchema.parse(json);
  }

  // Non-2xx: try to read the standard error envelope for a typed code.
  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    envelope = undefined;
  }

  const parsed = ErrorEnvelopeSchema.safeParse(envelope);
  if (parsed.success) {
    const { code: errorCode, message } = parsed.data.error;
    throw new ApiError(errorCode, message, response.status);
  }

  // Couldn't parse a known envelope; surface a typed-but-generic failure.
  throw new ApiError(
    'analysis_failed',
    `Unexpected ${response.status} response from the API.`,
    response.status,
  );
}
