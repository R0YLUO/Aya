---
title: "@aya/web"
type: package
packages: [web]
tasks: [web-package-scaffold, web-share-page-ssr, web-reader-component, web-phrase-popup]
summary: Next.js share reader — /s/{code} SSR route, typed share client, Reader with render-prop popups. All four planned web tasks are done.
updated: 2026-06-10
---

# @aya/web (as built)

Next.js (App Router) web reader. Depends on `@aya/shared` + HTTP only. All planned
`web-ui` tasks are **done**; remaining web work is deployment (`infra-web-hosting`).

## What lives where

- `src/lib/api.ts` — `fetchSharedPage(code)`: GET `/shares/{code}`, validates 200
  bodies against `ShareResolveResponseSchema`, converts error envelopes into a web
  `ApiError` (with `isShareNotFound` getter). Base URL: `AYA_API_BASE_URL` (SSR) with
  `NEXT_PUBLIC_AYA_API_BASE_URL` fallback.
- `src/lib/resolveSharePage.ts` — maps the fetch into `SharePageState`
  (`found` | `not_found`); **only** `share_not_found` becomes the friendly not-found
  state, anything else re-throws to Next's error boundary (outages must not render as
  "not found").
- `src/app/s/[code]/page.tsx` — async Server Component, `dynamic = 'force-dynamic'`
  (per-code content, never statically cached). Note Next 15 style: `params` is a
  `Promise` and is awaited.
- `src/components/Reader.tsx` — renders `AnalyzedPage`; sorts phrases by `index`
  defensively; interactive iff `pinyin !== null` (a reset-styled `<button>` with
  dotted underline); non-word tokens render as plain spans inside a `pre-wrap`
  `<article>` so line breaks survive. Exposes a `renderInteractive(phrase, element)`
  render prop.
- `src/components/PhrasePopup.tsx` — `InteractivePhrase` wraps the Reader's trigger;
  popup on hover/focus, dismiss on leave/blur/Escape; shows pinyin / translation /
  contextualMeaning **from memory — no network on hover** (UX north star).
- `src/components/ReaderWithPopups.tsx` — the shipped composition;
  `SharePageView.tsx` — presentational found/not-found view, unit-testable apart from
  the route.

## Conventions

- Server components fetch; presentational components render; the render-prop seam in
  `Reader` is how behaviour (popups) is layered without coupling.
- Tests are vitest + testing-library (`vitest.setup.ts`), unlike the node:test
  pattern in the non-React packages.

## Gotchas

- `packages/web/.next/` build output is currently **checked into the tree** (shows up
  in file listings); don't read it for understanding and don't edit it.
- The web `ApiError` is a distinct class from the api package's `ApiError` and
  mobile's — same name, three packages, intentionally not shared. See
  [error-handling](../concepts/error-handling.md).
