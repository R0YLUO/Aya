// useScanFlow — React hook wrapping runScan with the scan-flow state machine.
//
// `scan(photo)` kicks off upload -> scan and drives the loading/success/error
// UI without blocking the JS thread (the await yields to the event loop, so the
// loading animation keeps running). On success the AnalyzedPage is in state for
// the reader; on failure a typed error code is surfaced for the error UI.

import { useCallback, useReducer } from 'react';
import { ApiError } from '../api/client.js';
import type { CapturedPhoto } from '../camera/types.js';
import { runScan, type ScanDeps } from './runScan.js';
import {
  initialScanState,
  scanReducer,
  type ScanState,
  type ScanErrorCode,
} from './scanState.js';

export interface UseScanFlow {
  state: ScanState;
  scan: (photo: CapturedPhoto) => Promise<void>;
  reset: () => void;
}

function toErrorCode(err: unknown): { code: ScanErrorCode; message: string } {
  if (err instanceof ApiError) {
    return { code: err.code, message: err.message };
  }
  return {
    code: 'network_error',
    message: err instanceof Error ? err.message : 'Unexpected error.',
  };
}

export function useScanFlow(deps: ScanDeps): UseScanFlow {
  const [state, dispatch] = useReducer(scanReducer, initialScanState);

  const scan = useCallback(
    async (photo: CapturedPhoto) => {
      dispatch({ type: 'start' });
      try {
        const page = await runScan(deps, photo);
        dispatch({ type: 'succeeded', page });
      } catch (err) {
        const { code, message } = toErrorCode(err);
        dispatch({ type: 'failed', code, message });
      }
    },
    [deps],
  );

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  return { state, scan, reset };
}
