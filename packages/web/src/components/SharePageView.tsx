// Presentational view for the /s/{code} route. Kept separate from the route's
// server component so it can be unit-tested directly with either a resolved
// page or a not-found state.

import type { AnalyzedPage } from '@aya/shared';
import { ReaderWithPopups } from './ReaderWithPopups';

/** Result of resolving a share code: either the analysed page or "not found". */
export type SharePageState =
  | { status: 'found'; page: AnalyzedPage }
  | { status: 'not_found' };

export function ShareNotFound() {
  return (
    <main
      role="alert"
      style={{
        maxWidth: '32rem',
        margin: '0 auto',
        padding: '4rem 1.5rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
        This page isn’t available
      </h1>
      <p style={{ opacity: 0.8 }}>
        The shared link may be incorrect or has expired. Check the link and try
        again.
      </p>
    </main>
  );
}

export function SharePageView({ state }: { state: SharePageState }) {
  if (state.status === 'not_found') {
    return <ShareNotFound />;
  }
  return <ReaderWithPopups page={state.page} />;
}
