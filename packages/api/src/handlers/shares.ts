// POST /shares — the only write path in the system. Given a fully analysed page
// ({ page, phrases }) it validates the payload against the shared contract AND
// the reconstruction invariant, mints a short code, and persists the Page, all
// its Phrases, and the Share in one transaction (specs/03-api-design.md §3,
// specs/02-data-model.md). Returns 201 { code, url, pageId }.
//
// Validation is two-layered:
//   1. ShareRequestSchema.safeParse — shape (types, required fields).
//   2. checkReconstruction(page.fullText, phrases) — the reconstruction
//      invariant (CLAUDE.md golden rule #3): every phrase references page.id,
//      indexes are unique and contiguous from 1, and concatenating `original`
//      in index order equals page.fullText.
// Either failure is a 400 validation_error and writes NOTHING (the persist call
// only runs after both checks pass).

import {
  ShareRequestSchema,
  checkReconstruction,
  type Page,
  type Phrase,
  type Share,
  type ShareResponse,
} from '@aya/shared';
import { validationError } from '../errors.js';
import type { Handler, HandlerRequest, HandlerResult } from './types.js';

/** Persists a page, its phrases, and the share in one transaction. */
export interface SharePersister {
  savePageWithPhrasesAndShare(
    page: Page,
    phrases: readonly Phrase[],
    share: Share,
  ): Promise<void>;
}

/** Mints a fresh share code and composes the public reader URL. */
export interface ShareUrlMinter {
  generateShareCode(): string;
  buildShareUrl(code: string): string;
}

export interface SharesCreateHandlerDeps {
  /** Repository for the single transactional write. */
  repository: SharePersister;
  /** Short-URL service: code minting + URL composition. */
  shortUrls: ShareUrlMinter;
  /** Wall clock for the share's createdAt. Defaults to () => new Date(). */
  now?: () => Date;
}

/**
 * Build the POST /shares create handler. Dependencies (repository + short-URL
 * service) are injected so the orchestration unit-tests offline and config
 * (table name, web base URL) is resolved at the edge, never inside the handler
 * (api package convention).
 */
export function makeSharesCreateHandler(
  deps: SharesCreateHandlerDeps,
): Handler<ShareResponse> {
  const now = deps.now ?? (() => new Date());

  return async (request: HandlerRequest): Promise<HandlerResult<ShareResponse>> => {
    // ----- Layer 1: shape ----------------------------------------------------
    const parsed = ShareRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw validationError('Invalid share request body.', {
        issues: parsed.error.issues,
      });
    }
    const { page, phrases } = parsed.data;

    // ----- Layer 2: reconstruction invariant ---------------------------------
    // checkReconstruction asserts the phrases share ONE pageId, but not that it
    // is this page's id; assert that explicitly so a share whose phrases point
    // at a different page is rejected (acceptance criterion: mismatched pageId).
    const reconstruction = checkReconstruction(page.fullText, phrases);
    if (!reconstruction.ok) {
      throw validationError('Phrases do not reconstruct the page.', {
        reason: reconstruction.reason,
      });
    }
    const phrasePageId = phrases[0]?.pageId;
    if (phrasePageId !== page.id) {
      throw validationError('Phrases do not reference this page.', {
        reason: 'mixed_page_id',
      });
    }

    // ----- Persist (the only write path) -------------------------------------
    // Both checks passed, so this is the first side effect: a single
    // transactional write of Page + N Phrases + Share. A failure here propagates
    // to the router's error catch (no partial write — it is one transaction).
    const code = deps.shortUrls.generateShareCode();
    const share: Share = {
      code,
      pageId: page.id,
      createdAt: now().toISOString(),
    };

    await deps.repository.savePageWithPhrasesAndShare(page, phrases, share);

    const body: ShareResponse = {
      code,
      url: deps.shortUrls.buildShareUrl(code),
      pageId: page.id,
    };
    return { statusCode: 201, body };
  };
}
