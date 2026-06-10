// Short-URL service. Mints an unguessable, URL-safe code for a shared page and
// composes the public web-reader URL from a configured base (specs/02-data-model.md
// Share, specs/03-api-design.md POST /shares).
//
// The code is 8 characters of base62 drawn from a CSPRNG with rejection sampling,
// so the distribution is uniform (no modulo bias) and the codes are unguessable.
// The web base URL is config (env), never a literal (CLAUDE.md golden rule #7).

import { randomBytes } from 'node:crypto';

/** base62 alphabet: digits + upper + lower. URL-safe, no separators. */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Length of a minted share code. */
export const SHARE_CODE_LENGTH = 8;

/**
 * Generate an 8-character URL-safe base62 share code. Uses crypto-grade random
 * bytes with rejection sampling so every alphabet symbol is equally likely.
 */
export function generateShareCode(length: number = SHARE_CODE_LENGTH): string {
  const max = ALPHABET.length; // 62
  // Largest multiple of `max` that fits in a byte; bytes >= this are rejected.
  const limit = Math.floor(256 / max) * max;

  let code = '';
  while (code.length < length) {
    const bytes = randomBytes(length - code.length);
    for (const byte of bytes) {
      if (byte < limit) {
        code += ALPHABET[byte % max];
        if (code.length === length) break;
      }
    }
  }
  return code;
}

/**
 * Service that builds public share URLs from a configured web base URL. The base
 * URL is injected (sourced from env at the edge) so it is never hard-coded.
 */
export class ShortUrlService {
  private readonly webBaseUrl: string;

  /** @param webBaseUrl e.g. "https://aya.app"; a trailing slash is tolerated. */
  constructor(webBaseUrl: string) {
    // Normalise away a trailing slash so we never produce "https://aya.app//s/...".
    this.webBaseUrl = webBaseUrl.replace(/\/+$/, '');
  }

  /** Mint a fresh, unguessable share code. */
  generateShareCode(): string {
    return generateShareCode();
  }

  /** Compose the public reader URL: `${WEB_BASE_URL}/s/${code}`. */
  buildShareUrl(code: string): string {
    return `${this.webBaseUrl}/s/${code}`;
  }
}
