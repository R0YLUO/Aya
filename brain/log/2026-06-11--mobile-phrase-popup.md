---
title: "mobile-phrase-popup: tap-to-translate bottom sheet (PRD Story 3)"
type: log
packages: [mobile]
tasks: [mobile-phrase-popup]
summary: Built the mobile phrase popup — framework-free open/dismiss + field-selection core, thin RN bottom sheet with tap-outside / swipe-down / close-button dismissal, all from in-memory analysis (no network). 8 new tests.
updated: 2026-06-11
---

## What was built

`packages/mobile/src/reader/` — PRD Story 3 (look up a phrase):

- `phrasePopup.ts` (framework-free core): `PhrasePopupState` (`{phrase} | null`);
  `openPhrasePopup` opens only for interactive phrases and is a no-op for
  null-analysis tokens (returns prior state unchanged); `closePhrasePopup` is the
  single dismissal all three affordances route through; `isPhrasePopupOpen`;
  `phrasePopupContent` narrows the nullable analysis to the non-null MVP triple
  `{pinyin, translation, contextualMeaning}` (ADR-0003 — no char breakdown /
  example sentences), or `null` for a non-analysed token. No network: every field
  is read from the in-memory `AnalyzedPage`.
- `PhrasePopupSheet.tsx` (thin RN bottom sheet): backdrop `Pressable`
  (tap-outside), `Animated`+`PanResponder` drag past 80px (swipe-down), and a `✕`
  close button — all three call `onDismiss`. Renders `original` then
  pinyin/translation/contextualMeaning; returns `null` for a null/non-analysed
  phrase (guard).
- `phrasePopup.test.ts` — 8 node:test cases: starts closed; interactive tap opens
  carrying the phrase; non-tappable tap is a no-op (closed stays closed, open
  undisturbed); re-open swaps the phrase; dismissal closes; content surfaces the
  MVP triple; content is null for punctuation.
- Wired into the reader barrel, the package `index.tsx`, and `tsconfig.test.json`.

## Verification

- `npm run test -w @aya/mobile` → 48/48 pass (8 new).
- `npm run typecheck -w @aya/mobile` (covers the .tsx sheet), `lint`, `build`,
  and full-repo `npm run typecheck` (shared contract) → all pass.
- No `packages/web` touched, so the Playwright e2e gate doesn't apply.
- Device rendering + the actual swipe/tap gestures remain unverified — covered by
  the existing `brain/handoffs/mobile-device-run.md` (Story 3 walk-through added).

## Surprises / decisions

- Kept the mobile convention exactly: pure reducer-style core unit-tested under
  node:test, thin RN screen on top (RN screens aren't run in tests, only
  typechecked). The "interaction test" the acceptance criteria call for is the
  open/dismiss/no-op state logic in `phrasePopup.test.ts`.
- Matched the web `PhrasePopup` field set (pinyin / translation / contextual
  meaning) for cross-client parity; contextual meaning is always shown on mobile
  since `phrasePopupContent` only returns content when all three are present.
