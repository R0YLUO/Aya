---
title: "mobile-reader-view: tappable scrollable reader (recovery)"
type: log
packages: [mobile]
tasks: [mobile-reader-view]
summary: Recovered abandoned worktree work for the mobile reader view (PRD Story 2) onto main — framework-free token logic + thin RN ReaderView, 5 new tests.
updated: 2026-06-11
---

## What was built

`packages/mobile/src/reader/` — the mobile reader (PRD Story 2):

- `tokens.ts` (framework-free core): `isInteractive(phrase)` (tappable iff
  `pinyin !== null`), `readerTokens(page)` (sorts by `index` defensively, tags each
  token interactive/plain), `reconstructText(page)` (joins `original`s → `fullText`).
- `ReaderView.tsx` (thin RN screen): one scrollable `<Text>` of nested `<Text>` runs
  so each token's literal `original` — newlines included — preserves line breaks.
  Interactive runs get a dotted underline and call `onPhrasePress(phrase)`;
  null-analysis tokens render plain. Mobile-legible sizing (22px / 38px line height).
- `tokens.test.ts` — 5 node:test cases (interactive vs plain classification,
  index ordering from unordered input, reconstruction incl. line breaks, 120-token
  long page). Wired into `tsconfig.test.json`; barrel (`index.tsx`) re-exports the reader.

## Recovery context

This was a RECOVERY iteration: the plan had `mobile-reader-view` in `progress` with
**no** matching commit on `main`. The completed work existed only in an abandoned
worktree (`.claude/worktrees/agent-aa34402557732dbbc`, commit `6f38ee6`), which had
branched from `e7758d0` before later main commits. The work was salvageable and fully
consistent with current `@aya/shared` types (`AnalyzedPage`/`Phrase`), so I ported the
four reader files onto main rather than reimplementing, then re-verified.

## Verification

- `npm run test -w @aya/mobile` → 31/31 pass (5 new reader tests).
- `npm run typecheck -w @aya/mobile` (forced fresh), `lint`, `build` → all pass.
- Real device rendering still pending — covered by the existing
  `brain/handoffs/mobile-device-run.md` (Story 2 verify note added).

## Surprises / decisions

- Did not re-apply the worktree commit's `implementation_plan.json` edit; status went
  through `update-task.js` instead (single source of truth for status).
