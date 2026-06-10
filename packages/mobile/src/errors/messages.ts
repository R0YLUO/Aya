// Maps machine-readable API error codes to PRD-specified, client-displayable
// copy and the right recovery CTA (North Star: UX-Centric — clear errors).
//
// PRD copy:
//   image_unreadable -> "Photo unclear, please retake"   (retake)
//   no_chinese_text  -> "No Chinese text found, please try again" (retake)
//   network failure  -> retry upload+scan
//   analysis_failed  -> offer retry
//
// Codes not on the scan path (validation_error, image_not_found,
// share_not_found) get sensible inline fallbacks.

import type { ErrorCode } from '@aya/shared';

export type ScanErrorCode = ErrorCode | 'network_error';

/** The recovery action offered to the user for a given error. */
export type RecoveryCta = 'retake' | 'retry';

export interface ScanErrorPresentation {
  /** Inline message shown to the user. */
  message: string;
  /** Whether the CTA sends the user back to the camera or retries the scan. */
  cta: RecoveryCta;
  /** Label for the CTA button. */
  ctaLabel: string;
}

const PRESENTATIONS: Record<ScanErrorCode, ScanErrorPresentation> = {
  image_unreadable: {
    message: 'Photo unclear, please retake',
    cta: 'retake',
    ctaLabel: 'Retake',
  },
  no_chinese_text: {
    message: 'No Chinese text found, please try again',
    cta: 'retake',
    ctaLabel: 'Retake',
  },
  network_error: {
    message: 'Network error. Please check your connection and try again.',
    cta: 'retry',
    ctaLabel: 'Retry',
  },
  analysis_failed: {
    message: 'We could not analyse this page. Please try again.',
    cta: 'retry',
    ctaLabel: 'Retry',
  },
  image_not_found: {
    message: 'Your photo expired before processing. Please retake.',
    cta: 'retake',
    ctaLabel: 'Retake',
  },
  validation_error: {
    message: 'Something went wrong with the request. Please try again.',
    cta: 'retry',
    ctaLabel: 'Retry',
  },
  share_not_found: {
    message: 'That shared page could not be found.',
    cta: 'retry',
    ctaLabel: 'Retry',
  },
};

export function presentScanError(code: ScanErrorCode): ScanErrorPresentation {
  return PRESENTATIONS[code];
}
