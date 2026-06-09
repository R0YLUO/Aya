// Scan-flow UI state (framework-free, unit-tested). Drives the loading screen
// and hands off to the reader on success / the error UI on failure.

import type { AnalyzedPage, ErrorCode } from '@aya/shared';

export type ScanErrorCode = ErrorCode | 'network_error';

export type ScanState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'success'; page: AnalyzedPage }
  | { status: 'error'; code: ScanErrorCode; message: string };

export type ScanEvent =
  | { type: 'start' }
  | { type: 'succeeded'; page: AnalyzedPage }
  | { type: 'failed'; code: ScanErrorCode; message: string }
  | { type: 'reset' };

export const initialScanState: ScanState = { status: 'idle' };

export function scanReducer(state: ScanState, event: ScanEvent): ScanState {
  switch (event.type) {
    case 'start':
      return { status: 'scanning' };
    case 'succeeded':
      return { status: 'success', page: event.page };
    case 'failed':
      return { status: 'error', code: event.code, message: event.message };
    case 'reset':
      return initialScanState;
    default:
      return state;
  }
}
