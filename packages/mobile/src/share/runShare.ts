// runShare — the share submission orchestration (framework-free, unit-tested).
//
// When the user taps Share on a stored page, the app POSTs the locally stored
// page + phrases to /shares and receives a short URL. This is the *only* write
// path in the system (scan persists nothing) — see specs/03-api-design.md and
// brain/concepts/share-flow.md. The request body is exactly the stored
// AnalyzedPage split into { page, phrases } — no transformation, so the shared
// page matches what the user is reading.

import type { AnalyzedPage, ShareResponse } from '@aya/shared';
import type { AyaApiClient } from '../api/client.js';

export interface ShareDeps {
  api: Pick<AyaApiClient, 'sharePage'>;
}

/**
 * Share a stored {@link AnalyzedPage}: POST /shares with the page + phrases and
 * return the minted {@link ShareResponse} (code, short url, pageId). Throws an
 * {@link ApiError} from the client on failure; the caller maps the error code to
 * inline copy + a retry CTA (see ../errors, ./shareState).
 *
 * Makes exactly one POST /shares call.
 */
export async function runShare(
  deps: ShareDeps,
  stored: AnalyzedPage,
): Promise<ShareResponse> {
  return deps.api.sharePage(stored.page, stored.phrases);
}
