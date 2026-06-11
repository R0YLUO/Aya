// Share-flow UI state (framework-free, unit-tested). Drives the share action's
// loading state, the success state that presents the short URL (copy / native
// share sheet), and the inline error state with a retry CTA.

import type { ShareResponse } from '@aya/shared';
import type { ScanErrorCode } from '../errors/messages.js';

/** Share errors carry the same code seam as the rest of the app (ErrorCode | 'network_error'). */
export type ShareErrorCode = ScanErrorCode;

export type ShareState =
  | { status: 'idle' }
  | { status: 'sharing' }
  | { status: 'success'; share: ShareResponse }
  | { status: 'error'; code: ShareErrorCode; message: string };

export type ShareEvent =
  | { type: 'start' }
  | { type: 'succeeded'; share: ShareResponse }
  | { type: 'failed'; code: ShareErrorCode; message: string }
  | { type: 'reset' };

export const initialShareState: ShareState = { status: 'idle' };

export function shareReducer(state: ShareState, event: ShareEvent): ShareState {
  switch (event.type) {
    case 'start':
      return { status: 'sharing' };
    case 'succeeded':
      return { status: 'success', share: event.share };
    case 'failed':
      return { status: 'error', code: event.code, message: event.message };
    case 'reset':
      return initialShareState;
    default:
      return state;
  }
}
