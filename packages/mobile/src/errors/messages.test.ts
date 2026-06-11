import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/client.js';
import {
  presentScanError,
  recoveryHandler,
  type ScanErrorCode,
} from './messages.js';

// A mocked API client: each scan attempt rejects with the ApiError the real
// client would surface for a given server (or transport) failure. The error
// UI consumes `err.code`, so this is exactly the seam the screen sees.
function mockClientThatFails(code: ScanErrorCode): () => Promise<never> {
  return () =>
    Promise.reject(new ApiError(code, `mock failure: ${code}`, null));
}

// Mirrors useScanFlow's toErrorCode: ApiError -> its code; anything else ->
// network_error. The error UI is driven entirely by this code.
function codeFromError(err: unknown): ScanErrorCode {
  return err instanceof ApiError ? err.code : 'network_error';
}

// PRD copy + recovery CTA, per error code (the contract of mobile-error-states).
const EXPECTED: Record<
  ScanErrorCode,
  { message: string; cta: 'retake' | 'retry' }
> = {
  image_unreadable: {
    message: 'Photo unclear, please retake',
    cta: 'retake',
  },
  no_chinese_text: {
    message: 'No Chinese text found, please try again',
    cta: 'retake',
  },
  network_error: {
    message: 'Network error. Please check your connection and try again.',
    cta: 'retry',
  },
  analysis_failed: {
    message: 'We could not analyse this page. Please try again.',
    cta: 'retry',
  },
  image_not_found: {
    message: 'Your photo expired before processing. Please retake.',
    cta: 'retake',
  },
  validation_error: {
    message: 'Something went wrong with the request. Please try again.',
    cta: 'retry',
  },
  share_not_found: {
    message: 'That shared page could not be found.',
    cta: 'retry',
  },
};

const ALL_CODES = Object.keys(EXPECTED) as ScanErrorCode[];

for (const code of ALL_CODES) {
  test(`a mocked client failing with ${code} maps to the right message + CTA`, async () => {
    // 1. The mocked client surfaces this code as an ApiError...
    let caught: ScanErrorCode | undefined;
    try {
      await mockClientThatFails(code)();
    } catch (err) {
      caught = codeFromError(err);
    }
    assert.equal(caught, code, 'error code reaches the UI unchanged');

    // 2. ...which the error UI presents with the PRD copy + CTA.
    const present = presentScanError(caught!);
    assert.equal(present.message, EXPECTED[code].message);
    assert.equal(present.cta, EXPECTED[code].cta);
    assert.equal(
      present.ctaLabel,
      EXPECTED[code].cta === 'retake' ? 'Retake' : 'Retry',
    );
  });
}

test('image_unreadable and no_chinese_text route the CTA back to retake', () => {
  for (const code of ['image_unreadable', 'no_chinese_text'] as const) {
    let retook = false;
    let retried = false;
    const handler = recoveryHandler(code, {
      onRetake: () => {
        retook = true;
      },
      onRetry: () => {
        retried = true;
      },
    });
    handler();
    assert.equal(retook, true, `${code} routes to onRetake`);
    assert.equal(retried, false, `${code} does not retry`);
  }
});

test('network_error retries upload+scan; analysis_failed offers retry', () => {
  for (const code of ['network_error', 'analysis_failed'] as const) {
    let retook = false;
    let retried = false;
    const handler = recoveryHandler(code, {
      onRetake: () => {
        retook = true;
      },
      onRetry: () => {
        retried = true;
      },
    });
    handler();
    assert.equal(retried, true, `${code} routes to onRetry`);
    assert.equal(retook, false, `${code} does not retake`);
  }
});

test('every ScanErrorCode has a presentation (exhaustive, no crash)', () => {
  for (const code of ALL_CODES) {
    const p = presentScanError(code);
    assert.ok(p.message.length > 0, `${code} has a message`);
    assert.ok(p.ctaLabel.length > 0, `${code} has a CTA label`);
    assert.ok(p.cta === 'retake' || p.cta === 'retry');
  }
});
