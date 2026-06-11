// useShareFlow — React hook wrapping runShare with the share-flow state machine.
//
// `share(stored)` POSTs the stored page to /shares and drives the
// sharing/success/error UI. On success the minted ShareResponse is in state for
// the share-success UI (which presents the short URL via copy / native share
// sheet); on failure a typed error code is surfaced for the inline retry UI.

import { useCallback, useReducer } from 'react';
import type { AnalyzedPage } from '@aya/shared';
import { ApiError } from '../api/client.js';
import { runShare, type ShareDeps } from './runShare.js';
import {
  initialShareState,
  shareReducer,
  type ShareState,
  type ShareErrorCode,
} from './shareState.js';

export interface UseShareFlow {
  state: ShareState;
  share: (stored: AnalyzedPage) => Promise<void>;
  reset: () => void;
}

function toErrorCode(err: unknown): { code: ShareErrorCode; message: string } {
  if (err instanceof ApiError) {
    return { code: err.code, message: err.message };
  }
  return {
    code: 'network_error',
    message: err instanceof Error ? err.message : 'Unexpected error.',
  };
}

export function useShareFlow(deps: ShareDeps): UseShareFlow {
  const [state, dispatch] = useReducer(shareReducer, initialShareState);

  const share = useCallback(
    async (stored: AnalyzedPage) => {
      dispatch({ type: 'start' });
      try {
        const result = await runShare(deps, stored);
        dispatch({ type: 'succeeded', share: result });
      } catch (err) {
        const { code, message } = toErrorCode(err);
        dispatch({ type: 'failed', code, message });
      }
    },
    [deps],
  );

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  return { state, share, reset };
}
