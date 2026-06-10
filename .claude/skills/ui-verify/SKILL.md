---
name: ui-verify
description: Run the Playwright e2e suite and take browser screenshots to verify the web reader's UI. Use whenever a change touches packages/web (components, routes, styles), when the user asks to "verify the UI", "run the e2e tests", "screenshot the reader", or before marking any web-touching task done.
---

# UI verification (Playwright)

The web reader has a hermetic Playwright e2e harness in `packages/web/e2e/` (ADR-0011).
"Hermetic" means Playwright boots everything itself: a **fixture stub API**
(`e2e/stub-server.mjs`, port 4545) and **`next dev`** (port 3100) pointed at it via
`AYA_API_BASE_URL`. No deployed backend, no network, no LLM calls.

## The gate

Any change that touches `packages/web` UI or routes must pass the e2e suite before it is
considered done — the web-package analogue of the "no prompt change without an eval run"
golden rule:

```bash
npm run test:e2e -w @aya/web
```

One-time setup if the browser is missing (error mentions "Executable doesn't exist"):

```bash
npx playwright install chromium
```

`@aya/shared` must be built (`npm run build -w @aya/shared`) — the stub imports its
schemas. The root `npm run test:e2e` (turbo) handles that ordering automatically.

## Reading failures

- `screenshot: only-on-failure` and `trace: retain-on-failure` are configured. After a red
  run, look in `packages/web/test-results/<test-name>/`:
  - `test-failed-1.png` — Read it (it's an image) and judge visually.
  - `error-context.md` — an accessibility-tree snapshot of the page at failure.
- An HTML report lands in `packages/web/playwright-report/` (for humans:
  `npx playwright show-report`).

## Ad-hoc visual verification (screenshots)

To *see* a change rather than just assert on it, start the two servers in the background,
then screenshot any path:

```bash
cd packages/web
node e2e/stub-server.mjs &                                     # port 4545
AYA_API_BASE_URL=http://127.0.0.1:4545 npx next dev --port 3100 &
# wait ~5–10s for next to be ready, then:
node e2e/screenshot.mjs /s/e2etest1                            # → e2e-artifacts/s-e2etest1.png
node e2e/screenshot.mjs /s/anything-unknown out.png            # not-found state
```

Read the PNG and verify the rendering yourself (phrases underlined, line breaks
preserved, no raw JSON, etc.). Kill both processes when done. For interactive
verification (hovering a phrase, checking the popup), prefer writing/extending a spec in
`e2e/share-reader.spec.ts` — interactions belong in the suite so they keep being checked.
The Playwright MCP server (registered in `.mcp.json`) is also available for exploratory
driving of a real browser against these same servers.

## Fixtures (adding test pages)

Fixtures live in `packages/web/e2e/fixtures/`. **The filename is the share code**:
`e2etest1.json` is served at `GET /shares/e2etest1` → `http://127.0.0.1:3100/s/e2etest1`.

Each file is one `AnalyzedPage` (`{ page, phrases }`). The stub validates every fixture at
startup against `ShareResolveResponseSchema` **and** `checkReconstruction` (phrases must
join back to `fullText`, indexes contiguous from 1) and refuses to start otherwise — if
the suite dies immediately, read the stub's error output first.

Fixture rules (mirroring the real pipeline):

- Non-word tokens (punctuation, `\n`) are phrases with `pinyin: null` — they render as
  plain text, not buttons.
- Idioms/compounds stay whole (e.g. 风雨无阻 is one phrase).
- Keep one canonical fixture (`e2etest1`) stable — specs assert against it by content.
  Add new files for new scenarios instead of mutating it.

## What the suite covers (don't regress these)

- Exact DOM reconstruction of `fullText` (the reconstruction invariant, in the browser).
- Every analysed phrase is a tappable button, in `index` order; null-analysis tokens are
  not interactive.
- Hover/focus popup shows pinyin/translation/contextual meaning **with zero network
  requests** (UX north star); Escape and blur dismiss it.
- Unknown share codes render the friendly not-found state.
