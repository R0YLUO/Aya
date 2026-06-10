// Typed HTTP API client for the Aya mobile app.
//
// The mobile client depends only on @aya/shared (domain types + Zod contracts)
// and the HTTP API — never on @aya/api / @aya/llm. Every response is validated
// against the shared schema at the boundary, so the rest of the app trusts
// well-typed, well-formed data (North Star: Reliable & Stable).

import {
  UploadRequestSchema,
  UploadResponseSchema,
  ScanRequestSchema,
  ScanResponseSchema,
  ShareRequestSchema,
  ShareResponseSchema,
  ErrorEnvelopeSchema,
  type UploadResponse,
  type ScanResponse,
  type ShareResponse,
  type Page,
  type Phrase,
  type ErrorCode,
} from '@aya/shared';

/** Minimal fetch surface the client needs — lets tests inject a fake. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Uint8Array;
  },
) => Promise<FetchResponse>;

export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface ApiClientConfig {
  /** Base URL of the Aya HTTP API, e.g. https://api.aya.example. No trailing slash. */
  baseUrl: string;
  /** Injectable fetch (defaults to global fetch, available in React Native). */
  fetch?: FetchLike;
}

/**
 * A typed error carrying the machine-readable {@link ErrorCode} from the API's
 * error envelope (or a synthetic `network_error` for transport failures). The
 * UI maps these codes to PRD copy and CTAs (see ../errors/messages).
 */
export class ApiError extends Error {
  readonly code: ErrorCode | 'network_error';
  readonly status: number | null;

  constructor(
    code: ErrorCode | 'network_error',
    message: string,
    status: number | null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

export class AyaApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    const injected = config.fetch;
    if (injected) {
      this.fetchImpl = injected;
    } else if (typeof globalThis.fetch === 'function') {
      // Bind so `this` inside the platform fetch stays correct.
      this.fetchImpl = globalThis.fetch.bind(globalThis) as unknown as FetchLike;
    } else {
      throw new Error('AyaApiClient: no fetch available; pass config.fetch.');
    }
  }

  /** POST /uploads — get a presigned URL + dated object key for the photo. */
  async requestUpload(contentType = 'image/jpeg'): Promise<UploadResponse> {
    const body = UploadRequestSchema.parse({ contentType });
    const res = await this.send('POST', '/uploads', JSON.stringify(body));
    return UploadResponseSchema.parse(await this.readJson(res));
  }

  /** PUT the raw image bytes to the presigned S3 URL. No body is returned. */
  async uploadImage(
    uploadUrl: string,
    bytes: Uint8Array,
    contentType = 'image/jpeg',
  ): Promise<void> {
    let res: FetchResponse;
    try {
      res = await this.fetchImpl(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: bytes,
      });
    } catch (err) {
      throw new ApiError('network_error', toMessage(err), null);
    }
    if (!res.ok) {
      throw new ApiError(
        'network_error',
        `Image upload failed (status ${res.status}).`,
        res.status,
      );
    }
  }

  /** POST /pages — the single scan round-trip; returns a fully AnalyzedPage. */
  async scanPage(imageKey: string): Promise<ScanResponse> {
    const body = ScanRequestSchema.parse({ imageKey });
    const res = await this.send('POST', '/pages', JSON.stringify(body));
    return ScanResponseSchema.parse(await this.readJson(res));
  }

  /** POST /shares — persist the page and mint a short URL. */
  async sharePage(page: Page, phrases: Phrase[]): Promise<ShareResponse> {
    const body = ShareRequestSchema.parse({ page, phrases });
    const res = await this.send('POST', '/shares', JSON.stringify(body));
    return ShareResponseSchema.parse(await this.readJson(res));
  }

  // ---- internals --------------------------------------------------------

  private async send(
    method: string,
    path: string,
    body: string,
  ): Promise<FetchResponse> {
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: { ...JSON_HEADERS },
        body,
      });
    } catch (err) {
      throw new ApiError('network_error', toMessage(err), null);
    }
  }

  /** Read a JSON success body, converting an error envelope into an ApiError. */
  private async readJson(res: FetchResponse): Promise<unknown> {
    if (res.ok) {
      return res.json();
    }
    // Try to surface the machine-readable error code from the envelope.
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      throw new ApiError(
        'network_error',
        `Request failed (status ${res.status}).`,
        res.status,
      );
    }
    const envelope = ErrorEnvelopeSchema.safeParse(parsed);
    if (envelope.success) {
      throw new ApiError(
        envelope.data.error.code,
        envelope.data.error.message,
        res.status,
      );
    }
    throw new ApiError(
      'network_error',
      `Request failed (status ${res.status}).`,
      res.status,
    );
  }
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Network request failed.';
}
