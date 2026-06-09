// Server-side resolution of a share code into a renderable state.
//
// Used by the /s/{code} route (a server component): it fetches the shared page
// via the typed API client and maps the result into a SharePageState. A known
// `share_not_found` becomes a friendly not-found state; any other failure is
// re-thrown so Next.js can render its error boundary rather than masking a real
// outage as "not found".

import { ApiError, fetchSharedPage } from './api';
import type { SharePageState } from '../components/SharePageView';

export async function resolveSharePage(
  code: string,
  options?: { fetchImpl?: typeof fetch; baseUrl?: string },
): Promise<SharePageState> {
  try {
    const page = await fetchSharedPage(code, options ?? {});
    return { status: 'found', page };
  } catch (err) {
    if (err instanceof ApiError && err.isShareNotFound) {
      return { status: 'not_found' };
    }
    throw err;
  }
}
