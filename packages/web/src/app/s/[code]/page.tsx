// Public web reader route: /s/{code}
//
// This is an async Server Component — the fetch to GET /shares/{code} happens
// server-side (SSR), so the reader is delivered fully populated and shareable
// links render even with JS disabled. An unknown/expired code renders a
// friendly not-found page (no stack trace); genuinely unexpected failures
// propagate to Next's error boundary.

import { resolveSharePage } from '../../../lib/resolveSharePage';
import { SharePageView } from '../../../components/SharePageView';

// Share content is per-code and must not be statically cached at build time.
export const dynamic = 'force-dynamic';

export default async function SharePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const state = await resolveSharePage(code);
  return <SharePageView state={state} />;
}
