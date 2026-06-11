// GET /shares/{code} — resolve a short code to its analysed page. Used by the
// web reader (specs/03-api-design.md §4). The code is read from the path, the
// repository resolves it to an AnalyzedPage via a single partition query, and we
// return { page, phrases } (phrases ordered by index, satisfying the
// reconstruction invariant the create path enforced before persisting).
//
// This is a READ path: it never writes (CLAUDE.md golden rule #6 only allows
// writes at POST /shares). An unknown, missing, or dangling code (one whose page
// is gone) maps to 404 share_not_found in the standard envelope.

import type { AnalyzedPage, ShareResolveResponse } from '@aya/shared';
import { shareNotFound, validationError } from '../errors.js';
import type { Handler, HandlerRequest, HandlerResult } from './types.js';

/** Resolves a share code to its analysed page (single partition query). */
export interface ShareResolver {
  resolveShare(code: string): Promise<AnalyzedPage | undefined>;
}

export interface SharesResolveHandlerDeps {
  /** Repository for the read query. */
  repository: ShareResolver;
}

/**
 * Build the GET /shares/{code} resolve handler. The repository is injected so the
 * handler unit-tests offline with a mocked resolver and config (table name) is
 * resolved at the edge, never inside the handler (api package convention).
 */
export function makeSharesResolveHandler(
  deps: SharesResolveHandlerDeps,
): Handler<ShareResolveResponse> {
  return async (
    request: HandlerRequest,
  ): Promise<HandlerResult<ShareResolveResponse>> => {
    const code = request.pathParameters?.['code'];
    if (code === undefined || code === '') {
      // A missing path param is a malformed request, not an unknown share.
      throw validationError('A share code is required.');
    }

    const resolved = await deps.repository.resolveShare(code);
    if (resolved === undefined) {
      // Unknown / expired / dangling code → 404 in the standard envelope.
      throw shareNotFound(undefined, { code });
    }

    return { statusCode: 200, body: resolved };
  };
}
